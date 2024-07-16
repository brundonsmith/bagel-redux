
import { walk as _walk } from '@nodelib/fs.walk'
import { ModuleAST, parseModule } from './parser'
import { promisify } from 'util'
import { extname } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { input } from './parser-combinators'
import { transpile } from './transpiler'
import { format } from './formatter'
import { check, CheckerError } from './checker'

const walk = promisify(_walk)

export type Module = {
	remoteUrl: string | undefined,
	localFilePath: string,
	code: string,
	ast: ModuleAST,
	target: 'client' | 'server' | undefined,
	isEntry: boolean
}

const targetedFiles = async (dir: string) => {
	const files = []
	for (const entry of await walk(dir)) {
		if (extname(entry.path) === '.bgl') {
			const bgl = await readFile(entry.path)
			const parsed = parseModule(input(bgl.toString('utf-8')))

			if (parsed?.kind === 'success') {
				files.push({ path: entry.path, bgl, parsed: parsed.parsed })
			} else {
				console.log('Failed to parse ' + entry.path)
			}
		}
	}
	return files
}

const checkAll = async (dir: string) => {
	const errors: CheckerError[] = []

	for (const { path, parsed } of await targetedFiles(dir)) {
		const errors: CheckerError[] = []

		check({ error: e => errors.push(e) }, parsed)

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

const bundleFrom = async (entry: string) => {

}

const formatAll = async (dir: string) => {
	for (const { path, parsed } of await targetedFiles(dir)) {
		const formatted = format(parsed)
		await writeFile(path, formatted)
	}
}

const command = process.argv[2]
if (command !== 'check' && command !== 'transpile' && command !== 'bundle' && command !== 'format') {
	throw Error('Expected command')
}

const target = process.argv[3] ?? process.cwd()

switch (command) {
	case 'check': checkAll(target); break
	case 'transpile': transpileAll(target); break
	case 'bundle': bundleFrom(target); break
	case 'format': formatAll(target); break
}