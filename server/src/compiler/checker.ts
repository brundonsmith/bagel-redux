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
			case 'property-access-expression': {
				const subjectType = inferType(ast.subject)
				const propertyType = inferType(ast.property)
				if (!subsumes({ to: { kind: 'keys-type', subject: subjectType }, from: propertyType })) {
					error({
						message: `Can't index type ${displayType(subjectType)} with property ${displayType(propertyType)}`,
						src: ast.property.src
					})
				}

				check(ctx, ast.subject)
				check(ctx, ast.property)
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

				check(ctx, ast.expression)
				check(ctx, ast.type)
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

				check(ctx, ast.params)
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
			case 'object-literal': {
				check(ctx, ast.entries)
			} break
			case 'key-value': {
				check(ctx, ast.key)
				check(ctx, ast.value)
			} break
			case 'array-literal': {
				check(ctx, ast.elements)
			} break
			case 'spread': {
				check(ctx, ast.spread)
			} break
			case 'range': {
				if (ast.start != null && ast.end != null && ast.start > ast.end) {
					error({
						message: 'The end of a range must be greater than or equal to the start',
						src: ast.src
					})
				}
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