import { Module } from './cli'
import { transpile } from './transpiler'

export type BundlerOptions = {
	modules: Module[],
}

export const bundle = ({ modules }: BundlerOptions): string => {
	// const entryModule = modules.find(m => m.isEntry)
	// if (!entryModule) {
	// 	throw Error()
	// }

	const transpiled = modules.map(m => transpile(
		{
			outputTypes: false,
			minify: false,
			testMode: false
		},
		m.ast
	))
	return transpiled.join('\n') + '\n\nmain()' // naive for now
}
