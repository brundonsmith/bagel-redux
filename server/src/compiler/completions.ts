import { ModuleAST } from './parser'

export const getCompletions = (module: ModuleAST, position: number): { text: string }[] => {
	return module.declarations.map(decl => ({
		text: decl.declared.name.identifier
	}))
}