import { ModuleAST, findASTNodeAtPosition } from './parser'
import { valueDeclarationsInScope } from './types'
import { profile } from './utils'

export const getCompletions = profile('getCompletions', (module: ModuleAST, position: number): { text: string }[] => {
	const selected = findASTNodeAtPosition(position, module)
	return valueDeclarationsInScope(selected).map(decl => {
		switch (decl.kind) {
			case 'import-item': return { text: (decl.alias ?? decl.name).identifier }
			case 'const-declaration': return { text: decl.declared.name.identifier }
			case 'name-and-type': return { text: decl.name.identifier }
		}
	})
})
