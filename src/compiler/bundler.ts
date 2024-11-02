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

	const transpiled = Array.from(modules.values())
		.reverse() // HUUUGE HACK
		.map(m => transpile(
			{
				outputTypes: false,
				minify: false,
				testMode: false,
				forBundle: true
			},
			m.ast
		))
	return intern + transpiled.join('\n') + '\n\nmain()' // naive for now
}

const intern = `
const ___fits = (type, value) => {
	switch (type.kind) {
		case 'nil-type': return value == null
		case 'unknown-type': return true
		case 'boolean-type':
		case 'number-type':
		case 'string-type': {
			if (type.value == null) {
				return typeof value === type.kind.split('-')[0]
			} else {
				return value === type.value
			}
		}
	}
}
`