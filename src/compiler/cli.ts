
import { walk as _walk } from '@nodelib/fs.walk'
import { stat } from 'fs/promises'
import { ModuleAST, parseModule } from './parser'
import { promisify } from 'util'
import { extname, join, resolve } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { input } from './parser-combinators'
import { transpile } from './transpiler'
import { format } from './formatter'
import { check, CheckerError } from './checker'
import { bundle } from './bundler'
import { spawn } from 'child_process'

const walk = promisify(_walk)

export type Module = {
	remoteUrl: string | undefined,
	localFilePath: string,
	code: string,
	ast: ModuleAST,
	target: ModulePlatform
}

export type ModulePlatform = 'browser' | 'node' | 'cross-platform'

const moduleFromSource = (path: string, ast: ModuleAST): Module => {

	return {
		remoteUrl: undefined,
		localFilePath: path,
		code: ast.src.code,
		ast,
		target: 'cross-platform' // TODO
	}
}

const targetedFiles = async (dir: string) => {
	const isFile = (await stat(dir)).isFile()

	const entries = (
		isFile
			? [dir]
			: (await walk(dir)).map(e => e.path)
	)

	const files = []
	for (const path of entries) {
		if (extname(path) === '.bgl') {
			const bgl = await readFile(path)
			const parsed = parseModule(input(bgl.toString('utf-8')))

			if (parsed?.kind === 'success') {
				files.push({ path, bgl, parsed: parsed.parsed })
			} else {
				console.log('Failed to parse ' + path)
			}
		}
	}
	return files

}

const checkAll = async (dir: string) => {
	for (const { path, parsed } of await targetedFiles(dir)) {
		const errors: CheckerError[] = []

		check({
			error: e => errors.push(e),
			platform: 'cross-platform' // TODO
		}, parsed)

		if (errors.length === 0) {
			console.log(path + ' ' + '✅')
		} else {
			console.log(path + ' ' + '❌')
			console.log(errors.map(e =>
				`  ${e.message}\n` + (e.details?.map((d, i) => `  ${new Array(i).fill('  ').join('')}${d.message}\n`).join('') ?? '')).join(''))
		}
		console.log()
	}
}

const transpileAll = async (dir: string) => {
	for (const { path, parsed } of await targetedFiles(dir)) {
		const transpiled = transpile(
			{
				outputTypes: true,
				minify: false,
				testMode: false
			},
			parsed
		)
		await writeFile(path + '.ts', transpiled)
	}
}

const bundleModule = async (entry: string): Promise<string | undefined> => {
	const isFile = (await stat(entry)).isFile()

	if (!isFile) {
		throw Error('Bundle command requires a single entry module')
	}

	const bgl = await readFile(entry)
	const parsed = parseModule(input(bgl.toString('utf-8')))

	if (parsed?.kind === 'success') {
		const bundled = bundle({
			modules: [moduleFromSource(entry, parsed.parsed)]
		})

		return bundled
	}
}

const bundleFrom = async (entry: string) => {
	const bundled = await bundleModule(entry)

	if (bundled != null) {
		await writeFile(entry + '.bundle.js', bundled)
	} else {
		console.log('Failed to parse ' + entry)
	}
}

const bundleAndRun = async (entry: string) => {
	const bundled = await bundleModule(entry)

	if (bundled != null) {
		const cachePath = moduleCachePath(entry)
		await writeFile(cachePath, bundled)

		spawn('node', [cachePath], { stdio: 'inherit' })
	} else {
		console.log('Failed to parse ' + entry)
	}
}

const formatAll = async (dir: string) => {
	for (const { path, parsed } of await targetedFiles(dir)) {
		const formatted = format(parsed)
		await writeFile(path, formatted)
	}
}

const command = process.argv[2]
if (command !== 'check' && command !== 'transpile' && command !== 'bundle' && command !== 'run' && command !== 'format') {
	throw Error('Expected command')
}

const target = process.argv[3] ?? process.cwd()

switch (command) {
	case 'check': checkAll(target); break
	case 'transpile': transpileAll(target); break
	case 'bundle': bundleFrom(target); break
	case 'run': bundleAndRun(target); break
	case 'format': formatAll(target); break
}

const moduleCachePath = (modulePath: string) => join(CACHE_DIR, moduleCacheName(modulePath))

const moduleCacheName = (modulePath: string) => encodeURIComponent(resolve(modulePath))

const CACHE_DIR_NAME = 'bagel'
const CACHE_DIR = (() => {
	switch (process.platform) {
		case 'darwin':
			return join(process.env.HOME!, 'Library/Caches', CACHE_DIR_NAME)
		case 'win32':
			return join(process.env.LOCALAPPDATA || join(process.env.USERPROFILE!, 'AppData/Local'), 'Cache', CACHE_DIR_NAME)
		default:
			return join(process.env.XDG_CACHE_HOME!, CACHE_DIR_NAME)
	}
})()