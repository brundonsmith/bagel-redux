import { AST, Expression, TypeExpression } from './parser'
import { ParseSource } from './parser-combinators'
import { Type, displayType, inferType, opSignatures, resolveDeclaration, resolveType, subsumationIssues, subsumes } from './types'
import { zip } from './utils'

export type CheckerError = { message: string, src: ParseSource, details?: { message: string, src: ParseSource }[] }

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
				const [firstIssue, ...rest] = subsumationIssues({ to: resolveType(destination), from: inferType(value) })

				if (firstIssue) {
					error({
						message: firstIssue,
						src: value.src,
						details: rest.map(message => ({ message, src: value.src })),  // TODO: more granular location info
					})
				}
			}
		}

		switch (ast.kind) {
			case 'module': {
				check(ctx, ast.declarations)
			} break
			case 'const-declaration': {
				checkAssignment(ast.declared.type, ast.value)
				check(ctx, ast.declared)
				check(ctx, ast.value)
			} break
			case 'typeof-type-expression': {
				check(ctx, ast.expression)
			} break
			case 'function-type-expression': {
				check(ctx, ast.params)
				check(ctx, ast.returns)
			} break
			case 'union-type-expression': {
				check(ctx, ast.members)
			} break
			case 'function-expression': {
				// TODO: Lots of stuff
				check(ctx, ast.args)
				check(ctx, ast.returnType)
				check(ctx, ast.body)
			} break
			case 'name-and-type': {
				check(ctx, ast.name)
				check(ctx, ast.type)
			} break
			case 'invocation': {
				const subjectType = inferType(ast.subject)

				if (subjectType.kind !== 'function-type') {
					error({
						message: 'Can\'t call this because it isn\'t a function',
						src: ast.subject.src
					})
				} else {
					if (ast.args.length !== subjectType.params.length) {
						error({
							message: `Expected ${subjectType.params.length} arguments, but received ${ast.args.length}`,
							src: ast.src
						})
					}

					for (const [expectedType, argExpression] of zip(subjectType.params, ast.args, 'truncate')) {
						const providedType = inferType(argExpression)

						if (!subsumes({ to: expectedType as Type, from: providedType })) { // TODO
							error({
								message: `${displayType(providedType)} cannot be passed to parameter expecting type ${displayType(expectedType as Type)}`, // TODO
								src: argExpression.src
							})
						}
					}
				}

				check(ctx, ast.subject)
				check(ctx, ast.args)
			} break
			case 'binary-operation-expression': {
				const leftType = inferType(ast.left)
				const rightType = inferType(ast.right)

				if (!opSignatures[ast.op].some(({ requiredLeft, requiredRight }) =>
					subsumes({ to: requiredLeft, from: leftType }) && subsumes({ to: requiredRight, from: rightType }))
				) {
					error({
						message: `Can't apply operator ${ast.op} to operands ${displayType(leftType)} and ${displayType(rightType)}`,
						src: ast.src
					})
				}

				check(ctx, ast.left)
				check(ctx, ast.right)
			} break
			case 'if-else-expression': {
				check(ctx, ast.cases)
				check(ctx, ast.defaultCase)
			} break
			case 'object-type-expression':
			case 'object-literal': {
				check(ctx, ast.entries)
			} break
			case 'key-value-type-expression':
			case 'key-value-expression': {
				check(ctx, ast.key)
				check(ctx, ast.value)
			} break
			case 'array-type-expression':
			case 'array-literal': {
				check(ctx, ast.elements)
			} break
			case 'spread-type-expression':
			case 'spread-expression': {
				check(ctx, ast.spread)
			} break
			case 'if-else-expression-case': {
				check(ctx, ast.condition)
				check(ctx, ast.outcome)
			} break
			case 'local-identifier': {
				if (!resolveDeclaration(ast.identifier, ast)) {
					error({
						message: `Couldn't resolve identifier ${ast.identifier}`,
						src: ast.src
					})
				}
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
			case 'plain-identifier':
				break // nothing to check
			default:
				// @ts-expect-error kind should be of type `never`
				ast.kind
		}
	}
}