import { visitAST } from './ast-utils'
import { Module, ModulePlatform } from './modules'
import { AST, VariableDeclaration, Expression, ModuleAST, source, span, TypeDeclaration, TypeExpression } from './parser'
import { ParseSource } from './parser-combinators'
import { displayType, inferType, resolveValueDeclaration, resolveType, subsumationIssues, subsumes, simplifyType, literal, TypeContext, Type, poisoned, resolveTypeDeclaration, unknown, inferBodyType, ResolveTypeContext, InferTypeContext, globalJSType, purity } from './types'
import { exists, given, profile, todo, zip } from './utils'

export type CheckerError = { message: string, src: ParseSource, details?: { message: string, src: ParseSource }[] }

// TODO: Warning-level issues
export type CheckContext = {
	error: (err: CheckerError) => void,
	target: ModulePlatform,
	typeContext?: TypeContext,
	resolveModule: (relativeUri: string) => Module | undefined
}

export const checkInner = (ctx: CheckContext, ast: AST[] | AST | undefined): void => {
	visitAST(ctx, ast, (ast, ctx) => {
		const typeContext = ctx.typeContext as TypeContext
		const { error } = ctx

		const infer = (expression: Expression) => inferType(ctx, expression)
		const resolve = (expression: TypeExpression) => resolveType(ctx, expression)
		const checkAssignment = (destination: TypeExpression | undefined, value: Expression) => {
			if (destination != null) {
				const [firstIssue, ...rest] = subsumationIssues(typeContext, { to: resolve(destination), from: infer(value) })

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
				return {
					...ctx,
					typeContext: {
						typeScope: typeScopeFromModule(ctx, ast),
						valueScope: valueScopeFromModule(ctx, ast)
					}
				}
			}
			case 'variable-declaration': {
				checkAssignment(ast.declared.type, ast.value)
			} break
			case 'assignment-statement': {
				switch (ast.target.kind) {
					case 'local-identifier': {
						const destination = resolveValueDeclaration(ctx, ast.target.identifier, ast.target, ast.target)

						const canAssign =
							destination?.kind === 'variable-declaration' &&
							!destination.isConst

						// TODO: Allow assigning to imports if they point to global lets

						if (!canAssign) {
							const reason =
								destination?.kind === 'variable-declaration' &&
									destination.isConst ?
									' because it\'s const' :
									destination?.kind === 'name-and-type' &&
										destination.parent?.kind === 'function-expression' ?
										' because it\'s a function argument' :
										''

							error({
								message: `Can't assign to ${source(ast.target.src)}${reason}`,
								src: ast.src
							})
						}
					} break
					case 'property-access-expression': break // TODO
				}
			} break
			case 'markup-expression': {
				if (ast.tag.identifier !== ast.closingTag.identifier) {
					error({
						message: `Closing tag ${ast.closingTag.identifier} doesn't match opening tag ${ast.tag.identifier}`,
						src: ast.closingTag.src
					})
				}
			} break
			case 'property-access-expression': {
				const subjectType = infer(ast.subject)
				const propertyType = infer(ast.property)
				if (subjectType.kind !== 'poisoned-type' && !subsumes(typeContext, { to: { kind: 'keys-type', subject: subjectType }, from: propertyType })) {
					if (propertyType.kind === 'string-type' && propertyType.value != null) {
						error({
							message: `Property ${displayType(typeContext, propertyType)} doesn't exist on type ${displayType(typeContext, subjectType)}`,
							src: ast.property.src
						})
					} else {
						error({
							message: `Can't index type ${displayType(typeContext, subjectType)} with property ${displayType(typeContext, propertyType)}`,
							src: ast.property.src
						})
					}
				}
			} break
			case 'as-expression': {
				const expressionType = infer(ast.expression)
				const castType = resolve(ast.type)
				const issues = subsumationIssues(typeContext, { to: castType, from: expressionType })
				if (issues.length > 0) {
					error({
						message: `Can't cast ${displayType(typeContext, expressionType)} to ${displayType(typeContext, castType)}, because its value may not fit into the new type`,
						src: ast.src,
						details: issues.map(issue => ({ message: issue, src: ast.expression.src }))
					})
				}
			} break
			case 'function-expression': {
				// TODO: Lots of stuff

				if (ast.returnType) {
					const returnType = resolve(ast.returnType)
					const bodyType = inferBodyType(ctx, ast.body)
					const issues = subsumationIssues(typeContext, { to: returnType, from: bodyType })
					if (issues.length > 0) {
						const bodySrc = Array.isArray(ast.body) ? span(...ast.body.map(s => s.src)) : ast.body.src
						error({
							message: `Expected return type of ${displayType(typeContext, returnType)}, but found ${displayType(typeContext, bodyType)}`,
							src: bodySrc,
							details: issues.map(issue => ({
								message: issue,
								src: bodySrc
							}))
						})
					}
				}

				return {
					...ctx,
					typeContext: {
						typeScope: ctx.typeContext?.typeScope ?? {},
						valueScope: {
							...ctx.typeContext?.valueScope,
							...Object.fromEntries(
								ast.params.map(p => [p.name.identifier, given(p.type, resolve) ?? unknown])
							)
						}
					}
				}
			}
			case 'invocation': {
				const subjectType = simplifyType(typeContext, infer(ast.subject))

				if (subjectType.kind !== 'function-type') {
					// TODO: Move this into subsumation logic
					error({
						message: 'Can\'t call this because it isn\'t a function',
						src: ast.subject.src
					})
				} else {
					const parametersType = { kind: 'parameters-type' as const, subject: subjectType }
					const argumentsType = { kind: 'array-type' as const, elements: ast.args.map(infer) }
					const argumentIssues = subsumationIssues(typeContext, { to: parametersType, from: argumentsType })
					if (argumentIssues.length > 0) {
						error({
							message: `Can't call ${displayType(typeContext, subjectType)} with provided arguments`,
							src: ast.src,
							details: argumentIssues.map(issue => ({ message: issue, src: ast.src }))
						})
					}

					const p = purity(subjectType)
					if (ast.awaitOrDetach == null && p === 'async') {
						error({
							message: `${source(ast.subject.src)} is async, and must have 'await' or 'detach' in front of it when called`,
							src: ast.src
						})
					}

					if (ast.awaitOrDetach != null && p !== 'async') {
						error({
							message: `Can't ${ast.awaitOrDetach} ${source(ast.subject.src)} because it isn't async`,
							src: ast.src
						})
					}

					if (ast.awaitOrDetach === 'detach' && ast.context === 'expression') {
						error({
							message: 'Can\'t detach inside an expression; must await to use the promised value',
							src: ast.src
						})
					}

					// TODO: If in a module-level const declaration, only pure functions allowed to be called
				}
			} break
			case 'binary-operation-expression': {
				const resultType = simplifyType(typeContext, infer(ast))
				if (resultType.kind === 'poisoned-type') {
					const leftType = infer(ast.left)
					const rightType = infer(ast.right)
					error({
						message: `Can't apply operator ${ast.op} to operands ${displayType(typeContext, leftType)} and ${displayType(typeContext, rightType)}`,
						src: ast.src
					})
				}
			} break
			case 'if-else-expression': {
				for (const { condition } of ast.cases) {
					const vals = [true, false] as const

					for (const val of vals) {
						if (subsumes(typeContext, { to: literal(val), from: infer(condition) })) {
							error({
								message: `Condition will always be ${val}, so this conditional is redundant`,
								src: condition.src
							})
						}
					}
				}
			} break
			case 'object-literal': {
				if (ast.context === 'type-expression') {
					for (const entry of ast.entries) {
						if (entry.kind === 'local-identifier') {
							error({
								message: 'Can\'t use a plain identifier in an object type',
								src: entry.src
							})
						}
					}
				}
			} break
			case 'range': {
				if (ast.start != null && ast.end != null && ast.start > ast.end) {
					error({
						message: 'The end of a range must be greater than or equal to the start',
						src: ast.src
					})
				}
			} break
			case 'local-identifier': {
				switch (ast.context) {
					case 'expression':
						if (!resolveValueDeclaration(ctx, ast.identifier, ast, ast)) {
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
			case 'parameterized-type-expression': {
				const innerType = simplifyType({ ...typeContext, preserveGenerics: true }, resolve(ast.inner))

				if (innerType.kind !== 'generic-type') {
					error({
						message: `Can't parameterize non-generic type ${displayType(typeContext, innerType)}`,
						src: ast.src
					})
				} else {
					// TODO: Check for too many or too few parameters
					for (const [arg, param] of zip(ast.params, innerType.params, 'truncate')) {
						if (param.extendz) {
							const issues = subsumationIssues(typeContext, { to: param.extendz, from: resolve(arg) })
							if (issues.length > 0) {
								error({
									message: `Can't parameterize generic type ${displayType({ ...typeContext, preserveGenerics: true }, innerType)} with provided types`,
									src: ast.src,
									details: issues.map(issue => ({ message: issue, src: ast.src }))
								})
							}
						}
					}
				}
			} break
			case 'broken-subtree': {
				error({
					message: ast.error,
					src: ast.src
				})
			} break
		}

		return ctx
	})
}

export const typeScopeFromModule = (ctx: ResolveTypeContext, ast: ModuleAST): TypeContext['typeScope'] => {
	return Object.fromEntries(
		ast.declarations
			.map(d => {
				switch (d.kind) {
					case 'type-declaration': return [[d.name.identifier, resolveType(ctx, d.type)]]
					case 'import-declaration': return d.imports
						.map(i => {
							const otherDeclaration = ctx.resolveModule(d.uri.value)?.ast.declarations
								.find((d): d is TypeDeclaration => d.kind === 'type-declaration' && d.exported && d.name.identifier === i.name.identifier)

							if (otherDeclaration) {
								const type = resolveType(ctx, otherDeclaration.type)
								return [i.name.identifier, type]
							}
						})
						.filter(exists)
				}
			})
			.filter(exists)
			.flat()
	)
}

export const valueScopeFromModule = (ctx: InferTypeContext, ast: ModuleAST): TypeContext['valueScope'] => {
	return {
		js: globalJSType(ctx.target),
		...Object.fromEntries(
			ast.declarations
				.map(d => {
					switch (d.kind) {
						case 'variable-declaration': return [[d.declared.name.identifier, inferType(ctx, d.value)]]
						case 'import-declaration': return d.imports
							.map(i => {
								const otherDeclaration = ctx.resolveModule(d.uri.value)?.ast.declarations
									.find((d): d is VariableDeclaration => d.kind === 'variable-declaration' && d.exported && d.declared.name.identifier === i.name.identifier)

								if (otherDeclaration) {
									const type = given(otherDeclaration?.declared.type, t => resolveType(ctx, t)) ?? inferType(ctx, otherDeclaration.value)
									return [i.name.identifier, type]
								}
							})
							.filter(exists)
					}
				})
				.filter(exists)
				.flat()
		)
	}
}

export const check = profile('check', checkInner)
