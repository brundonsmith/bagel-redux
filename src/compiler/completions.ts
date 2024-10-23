import { findASTNodeAtPosition } from './ast-utils'
import { valueScopeFromModule } from './checker'
import { ModuleAST } from './parser'
import { InferTypeContext, valueDeclarationsInScope } from './types'
import { exists, profile } from './utils'

export const getCompletions = profile('getCompletions', (module: ModuleAST, position: number): { text: string }[] => {
	const selected = findASTNodeAtPosition(position, module)

	if (!selected) {
		return []
	}

	const ctx: InferTypeContext = {
		target: 'cross-platform',
		resolveModule: () => undefined
	}

	return valueDeclarationsInScope(ctx, selected, selected)
		.map(decl => {
			switch (decl.kind) {
				case 'import-item': return { text: (decl.alias ?? decl.name).identifier }
				case 'variable-declaration': return { text: decl.declared.name.identifier }
				case 'name-and-type': return { text: decl.name.identifier }
			}
		})
		.filter(exists)
})
