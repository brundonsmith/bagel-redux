import { AST, Expression, TypeExpression } from './parser'
import { ParseSource } from './parser-combinators'
import { displayType, inferType, resolveValueDeclaration, resolveType, subsumationIssues, subsumes, resolveTypeDeclaration, simplifyType, literal } from './types'
import { profile } from './utils'

export type CheckerError = { message: string, src: ParseSource, details?: { message: string, src: ParseSource }[] }

export type CheckContext = {
	error: (err: CheckerError) => void
}

export const checkInner = (ctx: CheckContext, ast: AST[] | AST | undefined): void => {
	const ch = (ast: AST[] | AST | undefined) => checkInner(ctx, ast)

	if (Array.isArray(ast)) {
		for (const child of ast) {
			ch(child)
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
				ch(ast.declarations)
			} break
			case 'import-declaration': {
				ch(ast.uri)
				ch(ast.imports)
			} break
			case 'import-item': {
				ch(ast.name)
				ch(ast.alias)
			} break
			case 'type-declaration': {
				ch(ast.name)
				ch(ast.type)
			} break
			case 'const-declaration': {
				checkAssignment(ast.declared.type, ast.value)
				ch(ast.declared)
				ch(ast.value)
			} break
			case 'typeof-type-expression': {
				ch(ast.expression)
			} break
			case 'function-type-expression': {
				ch(ast.params)
				ch(ast.returns)
			} break
			case 'union-type-expression': {
				ch(ast.members)
			} break
			case 'property-access-expression': {
				const subjectType = inferType(ast.subject)
				const propertyType = inferType(ast.property)
				if (subjectType.kind !== 'poisoned-type' && !subsumes({ to: { kind: 'keys-type', subject: subjectType }, from: propertyType })) {
					error({
						message: `Can't index type ${displayType(subjectType)} with property ${displayType(propertyType)}`,
						src: ast.property.src
					})
				}

				ch(ast.subject)
				ch(ast.property)
			} break
			case 'as-expression': {
				const expressionType = inferType(ast.expression)
				const castType = resolveType(ast.type)
				const issues = subsumationIssues({ to: castType, from: expressionType })
				if (issues.length > 0) {
					error({
						message: `Can't cast ${displayType(expressionType)} to ${displayType(castType)}, because its value may not fit into the new type`,
						src: ast.src,
						details: issues.map(issue => ({ message: issue, src: ast.expression.src }))
					})
				}

				ch(ast.expression)
				ch(ast.type)
			} break
			case 'function-expression': {
				// TODO: Lots of stuff

				if (ast.returnType) {
					const returnType = resolveType(ast.returnType)
					const bodyType = inferType(ast.body)
					const issues = subsumationIssues({ to: returnType, from: bodyType })
					if (issues.length > 0) {
						error({
							message: `Expected return type of ${displayType(returnType)}, but found ${displayType(bodyType)}`,
							src: ast.body.src,
							details: issues.map(issue => ({ message: issue, src: ast.body.src }))
						})
					}
				}

				ch(ast.params)
				ch(ast.returnType)
				ch(ast.body)
			} break
			case 'name-and-type': {
				ch(ast.name)
				ch(ast.type)
			} break
			case 'invocation': {
				const subjectType = inferType(ast.subject)

				if (subjectType.kind !== 'function-type') {
					// TODO: Move this into subsumation logic
					error({
						message: 'Can\'t call this because it isn\'t a function',
						src: ast.subject.src
					})
				} else {
					const parametersType = { kind: 'parameters-type' as const, subject: subjectType }
					const argumentsType = { kind: 'array-type' as const, elements: ast.args.map(inferType) }
					const argumentIssues = subsumationIssues({ to: parametersType, from: argumentsType })
					if (argumentIssues.length > 0) {
						error({
							message: `Can't call ${displayType(subjectType)} with provided arguments`,
							src: ast.src,
							details: argumentIssues.map(issue => ({ message: issue, src: ast.src }))
						})
					}
				}

				ch(ast.subject)
				ch(ast.args)
			} break
			case 'binary-operation-expression': {
				const resultType = simplifyType(inferType(ast))
				if (resultType.kind === 'poisoned-type') {
					const leftType = inferType(ast.left)
					const rightType = inferType(ast.right)
					error({
						message: `Can't apply operator ${ast.op} to operands ${displayType(leftType)} and ${displayType(rightType)}`,
						src: ast.src
					})
				}

				ch(ast.left)
				ch(ast.right)
			} break
			case 'if-else-expression': {
				ch(ast.cases)
				ch(ast.defaultCase)

				for (const { condition } of ast.cases) {
					const vals = [true, false] as const

					for (const val of vals) {
						if (subsumes({ to: literal(val), from: inferType(condition) })) {
							error({
								message: `Condition will always be ${val}, so this conditional is redundant`,
								src: condition.src
							})
						}
					}
				}
			} break
			case 'object-literal': {
				ch(ast.entries)
			} break
			case 'key-value': {
				ch(ast.key)
				ch(ast.value)
			} break
			case 'array-literal': {
				ch(ast.elements)
			} break
			case 'spread': {
				ch(ast.spread)
			} break
			case 'range': {
				if (ast.start != null && ast.end != null && ast.start > ast.end) {
					error({
						message: 'The end of a range must be greater than or equal to the start',
						src: ast.src
					})
				}

				ch(ast.start)
				ch(ast.end)
			} break
			case 'if-else-expression-case': {
				ch(ast.condition)
				ch(ast.outcome)
			} break
			case 'local-identifier': {
				switch (ast.context) {
					case 'expression':
						if (!resolveValueDeclaration(ast.identifier, ast)) {
							error({
								message: `Couldn't find ${ast.identifier}`,
								src: ast.src
							})
						}
						break
					case 'type-expression':
						if (!resolveTypeDeclaration(ast.identifier, ast)) {
							error({
								message: `Couldn't find ${ast.identifier}`,
								src: ast.src
							})
						}
						break
				}

			} break
			case 'parenthesis': {
				ch(ast.inner)
			} break
			case 'generic-type-expression': {
				ch(ast.inner)
				ch(ast.params)
			} break
			case 'generic-type-parameter': {
				ch(ast.name)
				ch(ast.extendz)
			} break
			case 'broken-subtree': {
				error({
					message: ast.error,
					src: ast.src
				})
			} break
			case 'string-type-expression':
			case 'number-type-expression':
			case 'boolean-type-expression':
			case 'unknown-type-expression':
			case 'string-literal':
			case 'number-literal':
			case 'boolean-literal':
			case 'nil-literal':
			case 'plain-identifier':
			case 'comment':
				break // nothing to check
			default:
				// @ts-expect-error kind should be of type `never`
				ast.kind
		}
	}
}

export const check = profile('check', checkInner)