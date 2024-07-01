
import { walk as _walk } from '@nodelib/fs.walk'
import { ModuleAST, parseModule } from './parser'
import { promisify } from 'util'
import { extname } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { input } from './parser-combinators'
import { transpile } from './transpiler'

const walk = promisify(_walk)

export type Module = {
	remoteUrl: string | undefined,
	localFilePath: string,
	code: string,
	ast: ModuleAST,
	target: 'client' | 'server' | undefined,
	isEntry: boolean
}

const transpileAll = async (dir: string) => {
	for (const entry of await walk(dir)) {
		if (extname(entry.path) === '.bgl') {
			const bgl = await readFile(entry.path)
			const parsed = parseModule(input(bgl.toString('utf-8')))

			if (parsed?.kind === 'success') {
				const transpiled = transpile(
					{
						outputTypes: true,
						minify: false,
						testMode: false
					},
					parsed.parsed
				)
				await writeFile(entry.path + '.ts', transpiled)
			} else {
				console.log('Failed to parse ' + entry.path)
			}
		}
	}
}

const bundleFrom = async (entry: string) => {

}

const command = process.argv[2]
if (command !== 'transpile' && command !== 'bundle') {
	throw Error('Expected command')
}

const target = process.argv[3] ?? process.cwd()

switch (command) {
	case 'transpile': transpileAll(target); break
	case 'bundle': bundleFrom(target); break
}