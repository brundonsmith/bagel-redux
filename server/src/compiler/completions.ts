import { AST, ModuleAST, findASTNodeAtPosition } from './parser'
import { declarationsInScope } from './types'

export const getCompletions = (module: ModuleAST, position: number): { text: string }[] => {
	const selected = findASTNodeAtPosition(position, module)
	return declarationsInScope(selected).map(decl => {
		switch (decl.kind) {
			case 'const-declaration': return { text: decl.declared.name.identifier }
			case 'name-and-type': return { text: decl.name.identifier }
		}
	})
}
