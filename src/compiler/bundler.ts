import { Module } from './modules'
import { transpile } from './transpiler'

export type BundlerOptions = {
	entryModule: Module,
	modules: Map<string, Module>,
}

export const bundle = ({ entryModule, modules }: BundlerOptions): string => {
	// const entryModule = modules.find(m => m.isEntry)
	// if (!entryModule) {
	// 	throw Error()
	// }

	const transpiled = Array.from(modules.values()).map(m => transpile(
		{
			outputTypes: false,
			minify: false,
			testMode: false
		},
		m.ast
	))
	return transpiled.join('\n') + '\n\nmain()' // naive for now
}
