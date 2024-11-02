
import { stat } from 'fs/promises'
import { resolve } from 'path'
import { writeFile } from 'fs/promises'
import { transpile } from './transpiler'
import { format } from './formatter'
import { check, CheckerError } from './checker'
import { bundle } from './bundler'
import { spawn } from 'child_process'
import { fullPath, moduleCachePath, targetedFiles } from './modules'

const getErrors = async (dir: string) => {
	const modules = await targetedFiles(dir, true)
	const moduleErrors = new Map<string, CheckerError[]>()
	for (const { uri, target, ast } of modules.values()) {
		const errors: CheckerError[] = []

		check({
			error: e => errors.push(e),
			target,
			resolveModule: path => modules.get(fullPath(uri, path))
		}, ast)

		moduleErrors.set(uri, errors)
	}
	return moduleErrors
}

const printErrors = (moduleErrors: Map<string, CheckerError[]>) => {
	for (const [uri, errors] of moduleErrors.entries()) {
		if (errors.length === 0) {
			console.log(uri + ' ' + '✅')
		} else {
			console.log(uri + ' ' + '❌')
			console.log(errors.map(e =>
				`  ${e.message}\n` + (e.details?.map((d, i) => `  ${new Array(i).fill('  ').join('')}${d.message}\n`).join('') ?? '')).join(''))
		}
		console.log()
	}
}

const checkAll = async (dir: string) => {
	const moduleErrors = await getErrors(dir)
	printErrors(moduleErrors)
}

const transpileAll = async (dir: string, { ignoreErrors }: { ignoreErrors: boolean }) => {
	const errors = await getErrors(dir)
	if (Array.from(errors.values()).some(errors => errors.length > 0)) {
		printErrors(errors)

		if (!ignoreErrors) {
			return
		}
	}

	for (const { localPath, ast } of (await targetedFiles(dir)).values()) {
		const transpiled = transpile(
			{
				outputTypes: true,
				minify: false,
				testMode: false,
				forBundle: false
			},
			ast
		)
		await writeFile(localPath + '.ts', transpiled)
	}

}

const bundleModule = async (entry: string): Promise<string | undefined> => {
	const isFile = (await stat(entry)).isFile()

	if (!isFile) {
		throw Error('Bundle command requires a single entry module')
	}

	const modules = await targetedFiles(entry, true)
	const entryModule = modules.get(entry)!

	const bundled = bundle({
		entryModule,
		modules
	})

	return bundled
}

const bundleFrom = async (entry: string, { ignoreErrors, inCachePath }: { ignoreErrors: boolean, inCachePath?: boolean }) => {
	const errors = await getErrors(entry)
	if (Array.from(errors.values()).some(errors => errors.length > 0)) {
		printErrors(errors)

		if (!ignoreErrors) {
			return
		}
	}

	const bundled = await bundleModule(entry)

	if (bundled != null) {
		const bundlePath = (
			inCachePath
				? moduleCachePath(entry) + '.bundle.js'
				: entry + '.bundle.js'
		)

		await writeFile(bundlePath, bundled)

		console.log('Bundled to:', bundlePath)

		return bundlePath
	} else {
		throw Error('Failed to parse ' + entry)
	}
}

const bundleAndRun = async (entry: string, { ignoreErrors }: { ignoreErrors: boolean }) => {
	const bundlePath = await bundleFrom(entry, { ignoreErrors, inCachePath: true })
	if (bundlePath) {
		spawn('node', [bundlePath], { stdio: 'inherit' })
	}
}

const formatAll = async (dir: string) => {
	for (const { localPath, ast } of (await targetedFiles(dir)).values()) {
		const formatted = format(ast)
		await writeFile(localPath, formatted)
	}
}

{
	const command = process.argv[2]
	if (command !== 'check' && command !== 'transpile' && command !== 'bundle' && command !== 'run' && command !== 'format') {
		throw Error('Expected command')
	}

	const target = resolve(process.cwd(), process.argv[3] ?? process.cwd())

	const ignoreErrors = process.argv.includes('--ignoreErrors')

	switch (command) {
		case 'check': checkAll(target); break
		case 'transpile': transpileAll(target, { ignoreErrors }); break
		case 'bundle': bundleFrom(target, { ignoreErrors }); break
		case 'run': bundleAndRun(target, { ignoreErrors }); break
		case 'format': formatAll(target); break
	}
}