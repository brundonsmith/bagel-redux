import { AST, Expression, Module, TypeExpression } from './parser'
import { ParseSource } from './parser-combinators'
import { inferType, resolveType, subsumationIssues } from './types'

export type CheckerError = { message: string, src: ParseSource }

export type CheckContext = {
	error: (err: CheckerError) => void
}

export const check = (ctx: CheckContext, ast: AST[] | AST | undefined): void => {

	if (Array.isArray(ast)) {
		for (const child of ast) {
			check(ctx, child)
		}
	} else if (ast != null) {
		const { error } = ctx

		const checkAssignment = (destination: TypeExpression | undefined, value: Expression) => {
			if (destination != null) {
				const [firstIssue] = subsumationIssues({ to: resolveType(destination), from: inferType(value) })

				if (firstIssue) {
					error({ message: firstIssue, src: value.src })
				}
			}
		}

		switch (ast.kind) {
			case 'module': {
				check(ctx, ast.declarations)
			} break
			case 'const-declaration': {
				checkAssignment(ast.type, ast.value)
				check(ctx, ast.type)
				check(ctx, ast.value)
			} break
			case 'union-type-expression': {
				check(ctx, ast.members)
			} break
			case 'object-type-expression': {
				if (Array.isArray(ast.entries)) {
					for (const { key, value } of ast.entries) {
						check(ctx, key)
						check(ctx, value)
					}
				} else {
					const { key, value } = ast.entries
					check(ctx, key)
					check(ctx, value)
				}
			} break
			case 'array-type-expression': {
				check(ctx, ast.elements)
			} break
			case 'object-literal': {
				for (const { key, value } of ast.entries) {
					check(ctx, key)
					check(ctx, value)
				}
			} break
			case 'array-literal': {
				check(ctx, ast.elements)
			} break
			case 'string-type-expression':
			case 'number-type-expression':
			case 'boolean-type-expression':
			case 'nil-type-expression':
			case 'unknown-type-expression':
			case 'string-literal':
			case 'number-literal':
			case 'boolean-literal':
			case 'nil-literal':
			case 'identifier':
				break // nothing to check
		}
	}
}