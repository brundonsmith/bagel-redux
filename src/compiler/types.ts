import { readFileSync } from 'fs'
import { join } from 'path'
import { ModulePlatform } from './cli'
import { AST, BinaryOperator, ConstDeclaration, Expression, GenericTypeParameter, ImportItem, NameAndType, Spread, Statement, TypeDeclaration, TypeExpression, isValidIdentifier, parseModule } from './parser'
import { input } from './parser-combinators'
import { todo, zip, profile, given, exists } from './utils'

export type Type =
	| Readonly<{ kind: 'function-type', params: Array<FunctionParam | SpreadType>, returns: Type, pure: boolean }>
	| Readonly<{ kind: 'union-type', members: Type[] }>
	| Readonly<{ kind: 'exclude-type', subject: Type, excluded: Type }>
	| Readonly<{ kind: 'object-type', entries: Array<KeyValueType | SpreadType> | KeyValueType }>
	| Readonly<{ kind: 'array-type', elements: Array<Type | SpreadType> | Type }>
	| StringType
	| Readonly<{ kind: 'number-type', value: Range | number | undefined }>
	| Readonly<{ kind: 'boolean-type', value: boolean | undefined }>
	| Readonly<{ kind: 'nil-type' }>
	| Readonly<{ kind: 'unknown-type' }>
	| Readonly<{ kind: 'poisoned-type' }> // poisoned is the same as unknown, except it suppresses any further errors it would otherwise cause
	| BinaryOperationType
	| IfElseType
	| Readonly<{ kind: 'switch-type', cases: { condition: Type, outcome: Type }[], defaultCase: Type | undefined }>
	| InvocationType
	| Readonly<{ kind: 'named-type', identifier: string }>
	| Readonly<{ kind: 'generic-type', inner: Type, params: GenericParam[] }>
	| Readonly<{ kind: 'parameterized-type', inner: Type, params: Type[] }>
	| Readonly<{ kind: 'local-identifier-type', identifier: string }>
	| PropertyType
	| KeysType
	| ValuesType
	| ParametersType
	| ReturnTypez

type FunctionParam = { kind: 'function-param', name: string | undefined, type: Type }
type GenericParam = { name: string, extendz: Type | undefined }
type Range = { start: number | undefined, end: number | undefined }

type StringType = Readonly<{ kind: 'string-type', value: string | undefined }>
type InvocationType = Readonly<{ kind: 'invocation-type', subject: Type, args: Type[] }>
type IfElseType = Readonly<{ kind: 'if-else-type', cases: { condition: Type, outcome: Type }[], defaultCase: Type | undefined }>
type BinaryOperationType = Readonly<{ kind: 'binary-operation-type', left: Type, op: BinaryOperator, right: Type }>
type PropertyType = Readonly<{ kind: 'property-type', subject: Type, property: Type }>
type KeysType = Readonly<{ kind: 'keys-type', subject: Type }>
type ValuesType = Readonly<{ kind: 'values-type', subject: Type }>
type ParametersType = Readonly<{ kind: 'parameters-type', subject: Type }>
type ReturnTypez = Readonly<{ kind: 'return-type', subject: Type }>

// convenience
export const union = (...members: Type[]): Type => ({ kind: 'union-type', members } as const)
export const literal = (value: string | Range | number | boolean): Type => (
	typeof value === 'string' ? { kind: 'string-type', value } :
		typeof value === 'number' || typeof value === 'object' ? { kind: 'number-type', value } :
			{ kind: 'boolean-type', value }
)
export const string = { kind: 'string-type', value: undefined } as const
export const number = { kind: 'number-type', value: undefined } as const
export const boolean = { kind: 'boolean-type', value: undefined } as const
export const nil = { kind: 'nil-type' } as const
export const unknown = { kind: 'unknown-type' } as const
export const poisoned = { kind: 'poisoned-type' } as const

export type KeyValueType = { kind: 'key-value-type', key: Type, value: Type }
export type SpreadType = { kind: 'spread', spread: Type }

export type InferTypeContext = {
	platform: ModulePlatform
}

export const inferType = profile('inferType', (ctx: InferTypeContext, expression: Expression): Type => {
	const infer = (expression: Expression) => inferType(ctx, expression)

	switch (expression.kind) {
		case 'property-access-expression': return {
			kind: 'property-type',
			subject: infer(expression.subject),
			property: infer(expression.property)
		}
		case 'as-expression': return resolveType(ctx, expression.type)
		case 'function-expression': {
			const expected = getExpectedType(ctx, expression)

			return {
				kind: 'function-type',
				params: expression.params.map((a, i) => ({
					kind: 'function-param' as const,
					name: a.name.identifier,
					type:
						a.type ? resolveType(ctx, a.type)
							: expected != null ? {
								kind: 'property-type',
								subject: {
									kind: 'parameters-type',
									subject: expected,
								},
								property: literal(i)
							}
								: unknown
				})),
				returns: inferBodyType(ctx, expression.body),
				pure: false // TODO
			}
		}
		case 'invocation': return { kind: 'invocation-type', subject: infer(expression.subject), args: expression.args.map(infer) }
		case 'binary-operation-expression': return { kind: 'binary-operation-type', left: infer(expression.left), op: expression.op, right: infer(expression.right) }
		case 'if-else-expression': return {
			kind: 'if-else-type',
			cases: expression.cases.map(({ condition, outcome }) => ({ condition: infer(condition), outcome: infer(outcome) })),
			defaultCase: expression.defaultCase ? infer(expression.defaultCase) : undefined
		}
		case 'parenthesis': return infer(expression.inner)
		case 'object-literal': return {
			kind: 'object-type', entries: expression.entries.map(entry =>
				entry.kind === 'key-value' ? { kind: 'key-value-type', key: infer(entry.key), value: infer(entry.value) } :
					entry.kind === 'spread' ? { kind: 'spread', spread: infer(entry.spread) } :
						{ kind: 'key-value-type', key: literal(entry.identifier), value: infer(entry) }
			)
		}
		case 'array-literal': return {
			kind: 'array-type', elements: expression.elements.map(element =>
				element.kind === 'spread'
					? { kind: 'spread', spread: infer(element.spread) } as const
					: infer(element)
			)
		}
		case 'string-literal': return { kind: 'string-type', value: expression.value }
		case 'number-literal': return { kind: 'number-type', value: expression.value }
		case 'boolean-literal': return { kind: 'boolean-type', value: expression.value }
		case 'nil-literal': return { kind: 'nil-type' }
		case 'local-identifier': return { kind: 'local-identifier-type', identifier: expression.identifier }
		case 'broken-subtree': return poisoned
		default:
			// @ts-expect-error kind should be of type `never`
			console.log(expression.kind)
			return poisoned // if this isn't an Expression, quietly return poisoned
	}
})

const opOnRange = (operator: '+' | '-' | '*' | '/', left: Range | number | undefined, right: Range | number | undefined): Range | number | undefined => {
	if (left == null || right == null) {
		return undefined
	}

	const op = (left: number | undefined, right: number | undefined) => {
		if (left == null || right == null) {
			return undefined
		}

		switch (operator) {
			case '+': return left + right
			case '-': return left - right
			case '*': return left * right
			case '/': return left / right
		}
	}

	switch (typeof left) {
		case 'number':
			switch (typeof right) {
				case 'number': return op(left, right)
				case 'object': return {
					start: op(left, right.start),
					end: op(left, right.end),
				} as Range
			}
		// eslint-disable-next-line no-fallthrough
		case 'object':
			switch (typeof right) {
				case 'number': return {
					start: op(left.start, right),
					end: op(left.end, right),
				} as Range
				case 'object': return {
					start: op(left.start, right.start),
					end: op(left.end, right.end),
				} as Range
			}
	}
}

export const declarationType = (ctx: InferTypeContext, declaration: ValueCreator | undefined): Type => {
	switch (declaration?.kind) {
		case 'import-item': return todo()
		case 'const-declaration': return inferType(ctx, declaration.value)
		case 'name-and-type': {
			if (declaration.type) {
				return resolveType(ctx, declaration.type)
			}

			// declaration is a function parameter
			if (declaration.parent?.kind === 'function-expression') {
				const functionType = getExpectedType(ctx, declaration.parent)
				const parameterIndex = declaration.parent.params.indexOf(declaration)

				if (functionType) {
					return {
						kind: 'property-type',
						subject: {
							kind: 'parameters-type',
							subject: functionType,
						},
						property: literal(parameterIndex)
					}
				}
			}

			return unknown
		}
		default: return declaration ?? poisoned
	}
}

export const resolveValueDeclaration = (ctx: InferTypeContext, name: string, at: AST | undefined, from: AST): ValueCreator | undefined =>
	valueDeclarationsInScope(ctx, at, from).find(decl => {
		switch (decl.kind) {
			case 'import-item': return (decl.alias ?? decl.name).identifier === name
			case 'const-declaration': return decl.declared.name.identifier === name
			case 'name-and-type': return decl.name.identifier === name
		}
	})

export const valueDeclarationsInScope = (ctx: InferTypeContext, at: AST | undefined, from: AST): Array<ValueCreator> => {
	if (at == null) {
		return [
			ctx.platform === 'cross-platform' ? globals.JS :
				ctx.platform === 'browser' ? globals.JSBrowser :
					globals.JSNode
		]
	}

	const declarationsInParentScopes = valueDeclarationsInScope(ctx, at?.parent, at)

	switch (at?.parent?.kind) {
		case 'module': {
			return [
				...at.parent.declarations
					.map(d =>
						d.kind === 'import-declaration' ? d.imports
							: d.kind === 'const-declaration' ? [d]
								: [])
					.flat(),
				...declarationsInParentScopes
			]
		}
		case 'function-expression': {
			const bodyStatements = (
				Array.isArray(at.parent.body)
					? at.parent.body
					: []
			)

			const thisIndex = bodyStatements.indexOf(from as Statement)

			const bodyDeclarations = bodyStatements.slice(0, thisIndex).filter(s => s.kind === 'const-declaration')

			return [
				...bodyDeclarations,
				...at.parent.params,
				...declarationsInParentScopes
			]
		}
	}

	return declarationsInParentScopes
}

type TypeCreator = TypeDeclaration | GenericTypeParameter

export const resolveTypeDeclaration = (name: string, at: AST | undefined): TypeCreator | undefined =>
	typeDeclarationsInScope(at).find(decl => {
		switch (decl.kind) {
			case 'type-declaration': return decl.name.identifier === name
			case 'generic-type-parameter': return decl.name.identifier === name
		}
	})

export const typeDeclarationType = (ctx: ResolveTypeContext, declaration: ReturnType<typeof resolveTypeDeclaration>): Type => {
	switch (declaration?.kind) {
		case 'type-declaration': return resolveType(ctx, declaration.type)
		case 'generic-type-parameter': return given(declaration.extendz, e => resolveType(ctx, e)) ?? unknown
		case undefined: return poisoned
	}
}

const typeDeclarationsInScope = (at: AST | undefined): Array<TypeCreator> => {
	if (at == null) {
		return []
	}

	const declarationsInParentScopes = typeDeclarationsInScope(at?.parent)

	switch (at?.parent?.kind) {
		case 'module': {
			return [
				...declarationsInParentScopes,
				...at.parent.declarations
					.map(d =>
						d.kind === 'type-declaration'
							? [d]
							: [])
					.flat()
			]
		}
		case 'generic-type-expression': {
			return [
				...declarationsInParentScopes,
				...at.parent.params
			]
		}
	}

	return declarationsInParentScopes
}

export type ResolveTypeContext = {
	platform: ModulePlatform
}

export const resolveType = (ctx: ResolveTypeContext, typeExpression: TypeExpression): Type => {
	const resolve = (typeExpression: TypeExpression) => resolveType(ctx, typeExpression)

	switch (typeExpression.kind) {
		case 'typeof-type-expression': return inferType(ctx, typeExpression.expression)
		case 'function-type-expression': return {
			kind: 'function-type',
			params: typeExpression.params.map(resolve).map(type => ({ kind: 'function-param', name: undefined, type })),
			returns: resolve(typeExpression.returns),
			pure: typeExpression.pure
		}
		case 'union-type-expression': return {
			kind: 'union-type',
			members: typeExpression.members.map(resolve)
		}
		case 'generic-type-expression': return {
			kind: 'generic-type',
			inner: resolve(typeExpression.inner),
			params: typeExpression.params.map(({ name, extendz }) => ({ name: name.identifier, extendz: given(extendz, resolve) }))
		}
		case 'parameterized-type-expression': return {
			kind: 'parameterized-type',
			inner: resolve(typeExpression.inner),
			params: typeExpression.params.map(resolve)
		}
		case 'parenthesis': return resolve(typeExpression.inner)
		case 'object-literal':
			return typeExpression.entries.some(e => e.kind === 'local-identifier')
				? poisoned
				: {
					kind: 'object-type',
					entries: (
						typeExpression.entries.map(entry =>
							entry.kind === 'key-value'
								? { kind: 'key-value-type', key: resolve(entry.key), value: resolve(entry.value) } as const
								: { kind: 'spread', spread: resolve((entry as Spread<TypeExpression>).spread) } as const

						)
					)
				}
		case 'array-literal': return {
			kind: 'array-type',
			elements: (
				typeExpression.elements.map(element =>
					element.kind === 'spread'
						? { kind: 'spread', spread: resolve(element.spread) } as const
						: resolve(element)
				)
			)
		}
		case 'string-literal':
		case 'number-literal':
		case 'boolean-literal':
			return literal(typeExpression.value)
		case 'range':
			return {
				kind: 'number-type',
				value: {
					start: typeExpression.start?.value,
					end: typeExpression.end?.value,
				}
			}
		case 'string-type-expression': return string
		case 'number-type-expression': return number
		case 'boolean-type-expression': return boolean
		case 'nil-literal': return nil
		case 'local-identifier': return { kind: 'named-type', identifier: typeExpression.identifier }
		case 'unknown-type-expression': return unknown
		case 'broken-subtree': return poisoned
	}
}

type ValueCreator = ImportItem | ConstDeclaration | NameAndType | Type

const getExpectedType = (ctx: ResolveTypeContext, expression: Expression): Type | undefined => {
	if (expression.parent?.kind === 'const-declaration' && expression.parent.declared.type) {
		return resolveType(ctx, expression.parent.declared.type)
	}
	if (expression.parent?.kind === 'function-expression' && expression.parent.returnType) {
		return resolveType(ctx, expression.parent.returnType)
	}
}

export const subsumes = (ctx: TypeContext, types: { to: Type, from: Type }): boolean => subsumationIssues(ctx, types).length === 0
export const intersect = (ctx: TypeContext, type1: Type, type2: Type) =>
	// TODO: this doesn't cover partial intersection yet
	subsumes(ctx, { to: type1, from: type2 }) || subsumes(ctx, { to: type2, from: type1 })

export type SubsumationIssue = string

export const subsumationIssues = (ctx: TypeContext, { to: _to, from: _from }: { to: Type, from: Type }): readonly SubsumationIssue[] => {
	const subsumation = (types: { to: Type, from: Type }) => subsumationIssues(ctx, types)
	// TODO: Tree structure of issues instead of just array
	// TODO: Source info for nested issues, not just the top-level issue (which means source info for types)

	const NO_ISSUES = [] as const

	const to = simplifyType(ctx, _to)
	const from = simplifyType(ctx, _from)

	// indirect types that require evaluation/recursion
	switch (to.kind) {
		case 'union-type': {
			const memberIssues = to.members.map(to => subsumation({ to, from }))

			if (memberIssues.some(i => i.length === 0)) {
				return NO_ISSUES
			} else {
				return memberIssues.flat()
			}
		}
		case 'named-type':
		case 'local-identifier-type':
		case 'unknown-type':
		case 'poisoned-type':
			return NO_ISSUES
	}
	switch (from.kind) {
		case 'union-type': return todo()
		case 'named-type':
		case 'local-identifier-type':
		case 'poisoned-type':
			return NO_ISSUES
	}

	// assume structural types
	switch (to.kind) {
		case 'function-type': {
			if (from.kind !== 'function-type') {
				return [basicSubsumationIssueMessage({ to, from })]
			} else {
				const issues: SubsumationIssue[] = []

				for (const [toParam, fromParam] of zip(to.params, from.params, 'truncate')) {
					// swapped on purpose!
					issues.push(...subsumation({ to: (fromParam as FunctionParam).type, from: (toParam as FunctionParam).type })) // TODO
				}

				issues.push(...subsumation({ to: to.returns, from: from.returns }))

				if (issues.length > 0) {
					return [basicSubsumationIssueMessage({ to, from }), ...issues]
				} else {
					return NO_ISSUES
				}
			}
		}
		case 'object-type': {
			if (from.kind !== 'object-type') {
				return [basicSubsumationIssueMessage({ to, from })]
			} else if (Array.isArray(to.entries)) {
				if (Array.isArray(from.entries)) {
					const subIssues: SubsumationIssue[] = []

					for (const required of to.entries) {
						if (required.kind === 'spread') {
							subIssues.push(...subsumation({ to: required.spread, from }))
						} else {
							const match = from.entries.find(e => e.kind === 'key-value-type' && subsumes(ctx, { to: required.key, from: e.key }))

							if (!match) {
								subIssues.push(`Property ${displayType(ctx, required.key)} is missing in type ${displayType(ctx, from)}`)
							} else {
								subIssues.push(...subsumation({ to: required.value, from: (match as KeyValueType).value }))
							}
						}
					}

					if (subIssues.length > 0) {
						return [basicSubsumationIssueMessage({ to, from }), ...subIssues]
					} else {
						return NO_ISSUES
					}
				} else {
					return todo()
				}
			} else {
				if (Array.isArray(from.entries)) {
					const toEntries = to.entries
					const subIssues = from.entries
						.map(entry =>
							entry.kind === 'key-value-type'
								? [
									...subsumation({ to: toEntries.key, from: entry.key }),
									...subsumation({ to: toEntries.value, from: entry.value }),
								]
								: subsumation({ to, from: entry.spread }))
						.flat()

					if (subIssues.length > 0) {
						return [basicSubsumationIssueMessage({ to, from }), ...subIssues]
					} else {
						return NO_ISSUES
					}
				} else {
					const subIssues = [
						...subsumation({ to: to.entries.key, from: from.entries.key }),
						...subsumation({ to: to.entries.value, from: from.entries.value })
					]

					if (subIssues.length > 0) {
						return [basicSubsumationIssueMessage({ to, from }), ...subIssues]
					} else {
						return NO_ISSUES
					}
				}
			}
		}
		case 'array-type': {
			if (from.kind !== 'array-type') {
				return [basicSubsumationIssueMessage({ to, from })]
			} else if (Array.isArray(to.elements)) {
				if (Array.isArray(from.elements)) {
					if (from.elements.length < to.elements.length) {
						return [
							basicSubsumationIssueMessage({ to, from }),
							`Array type ${displayType(ctx, from)} has fewer elements than destination array type ${displayType(ctx, to)}`
						]
					}

					const fromElements = from.elements
					const subIssues = to.elements.map((to, i) => {
						const from = fromElements[i]!
						return (
							to.kind === 'spread'
								? todo()
								: from.kind === 'spread'
									? todo()
									: subsumation({ to, from })
						)
					}).flat()

					if (subIssues.length > 0) {
						return [basicSubsumationIssueMessage({ to, from }), ...subIssues]
					} else {
						return NO_ISSUES
					}
				} else {
					return [basicSubsumationIssueMessage({ to, from })]
				}
			} else {
				if (Array.isArray(from.elements)) {
					const toElements = to.elements
					const subIssues = from.elements.map(from =>
						from.kind === 'spread'
							? todo()
							: subsumation({ to: toElements, from })
					).flat()

					if (subIssues.length > 0) {
						return [basicSubsumationIssueMessage({ to, from }), ...subIssues]
					} else {
						return NO_ISSUES
					}
				} else {
					const subIssues = subsumation({ to: to.elements, from: from.elements })

					if (subIssues.length > 0) {
						return [basicSubsumationIssueMessage({ to, from }), ...subIssues]
					} else {
						return NO_ISSUES
					}
				}
			}
		}
		case 'number-type':
			if (typeof to.value === 'object' && from.kind === 'number-type' && from.value != null) {
				if (typeof from.value === 'number') {
					if (
						(to.value.start == null || from.value >= to.value.start) &&
						(to.value.end == null || from.value < to.value.end)
					) {
						return NO_ISSUES
					}
				} else {
					if (
						(to.value.start == null || (from.value.start != null && from.value.start >= to.value.start)) &&
						(to.value.end == null || (from.value.end != null && from.value.end <= to.value.end))
					) {
						return NO_ISSUES
					}
				}
			}
		// eslint-disable-next-line no-fallthrough
		case 'string-type':
		case 'boolean-type': return (
			from.kind === to.kind && (to.value == null || to.value === from.value)
				? NO_ISSUES
				: [basicSubsumationIssueMessage({ to, from })]
		)
		case 'nil-type': return (
			from.kind === 'nil-type'
				? NO_ISSUES
				: [basicSubsumationIssueMessage({ to, from })]
		)
		case 'exclude-type':
		case 'binary-operation-type':
		case 'if-else-type':
		case 'switch-type':
		case 'invocation-type':
		case 'generic-type':
		case 'parameterized-type':
		case 'property-type':
		case 'keys-type':
		case 'values-type':
		case 'parameters-type':
		case 'return-type':
			return todo(JSON.stringify({ to: displayType(ctx, to), from: displayType(ctx, from) }))
	}
}

const getPropertyType = (ctx: TypeContext, { subject: _subject, property: _property }: PropertyType): Type | undefined => {
	const subject = simplifyType(ctx, _subject)
	const property = simplifyType(ctx, _property)

	switch (subject.kind) {
		case 'object-type': {
			if (Array.isArray(subject.entries)) {
				const found = subject.entries.find(e =>
					e.kind === 'key-value-type' && subsumes(ctx, { to: e.key, from: property })) as KeyValueType | undefined

				if (found) {
					return found.value
				} else {
					// TODO: Search spreads

					return undefined
				}
			} else if (subsumes(ctx, { to: subject.entries.key, from: property })) {
				return subject.entries.value
			}
		} break
		case 'array-type': {
			if (property.kind === 'number-type') {
				if (Array.isArray(subject.elements)) {
					// TODO: Search spreads

					switch (typeof property.value) {
						case 'number': return subject.elements[property.value] as Type | undefined
						case 'object': return todo()
						case 'undefined': return union(...subject.elements as Type[], nil)
					}
				} else {
					return union(subject.elements, nil)
				}
			} else if (property.kind === 'string-type' && property.value === 'length') {
				if (Array.isArray(subject.elements)) {
					return literal(subject.elements.length)
				} else {
					return number
				}
			}
		} break
		case 'string-type': {
			if (property.kind === 'string-type' && property.value === 'length') {
				if (subject.value != null) {
					return literal(subject.value.length)
				} else {
					return number
				}
			}
		} break
	}

	return poisoned
}

const getKeysType = (ctx: TypeContext, { subject: _subject }: KeysType): Type => {
	const subject = simplifyType(ctx, _subject)

	switch (subject.kind) {
		case 'object-type': {
			if (Array.isArray(subject.entries)) {
				return union(...subject.entries.map(e =>
					e.kind === 'key-value-type'
						? e.key
						: { kind: 'keys-type' as const, subject: e.spread }))
			} else {
				return subject.entries.key
			}
		}
		case 'array-type': {
			if (Array.isArray(subject.elements)) {
				// TODO: Combine with spreads
				return union(
					literal({ start: 0, end: subject.elements.length }),
					literal('length')
				)
			} else {
				return union(
					number,
					literal('length')
				)
			}
		}
		case 'string-type': {
			if (subject.value != null) {
				return union(
					literal({ start: 0, end: subject.value.length }),
					literal('length')
				)
			} else {
				return union(
					number,
					literal('length')
				)
			}
		}
	}

	return poisoned
}

const getValuesType = (ctx: TypeContext, { subject: _subject }: ValuesType): Type => {
	const subject = simplifyType(ctx, _subject)

	switch (subject.kind) {
		case 'object-type': {
			if (Array.isArray(subject.entries)) {
				return union(...subject.entries.map(e =>
					e.kind === 'key-value-type'
						? e.value
						: { kind: 'values-type' as const, subject: e.spread }))
			} else {
				return subject.entries.value
			}
		}
		case 'array-type': {
			if (Array.isArray(subject.elements)) {
				return union(
					...subject.elements.map(e =>
						e.kind === 'spread'
							? { kind: 'values-type' as const, subject: e.spread }
							: e)
				)
			} else {
				return union(subject.elements)
			}
		}
		case 'string-type': {
			if (subject.value != null) {
				return union(...subject.value.split('').map(literal))
			} else {
				return string
			}
		}
	}

	return poisoned
}

const getParametersType = (ctx: TypeContext, { subject: _subject }: ParametersType): Type => {
	const subject = simplifyType(ctx, _subject)

	switch (subject.kind) {
		case 'function-type': {
			return { kind: 'array-type', elements: (subject.params as FunctionParam[]).map(p => p.type) }
		}
	}

	return poisoned
}

const getReturnType = (ctx: TypeContext, { subject: _subject }: ReturnTypez): Type => {
	const subject = simplifyType(ctx, _subject)

	switch (subject.kind) {
		case 'function-type': {
			return subject.returns
		}
	}

	return poisoned
}

const getIfElseType = (ctx: TypeContext, { cases, defaultCase }: IfElseType): Type => {
	for (const { condition: _condition, outcome: _outcome } of cases) {
		const condition = simplifyType(ctx, _condition)
		const outcome = simplifyType(ctx, _outcome)

		if (subsumes(ctx, { to: literal(true), from: condition })) {
			return outcome
		} else if (!subsumes(ctx, { to: literal(false), from: condition })) {
			const allOutcomeTypes = cases.map(c => c.outcome)
			if (defaultCase) {
				allOutcomeTypes.push(defaultCase)
			} else {
				allOutcomeTypes.push(nil)
			}
			return union(...allOutcomeTypes)
		}
	}

	return defaultCase ?? nil
}

const compareRanges = (op: '<' | '>' | '<=' | '>=', _left: Range, _right: Range): boolean | undefined => {
	let left: Range, right: Range
	if (op === '<' || op === '<=') {
		left = _left
		right = _right
	} else {
		left = _right
		right = _left
	}

	switch (op) {
		case '<':
		case '>':
			if (left.end != null && right.start != null && left.end < right.start) {
				return true
			}
			if (left.start != null && right.start != null && left.start >= right.start) {
				return false
			}
			break
		case '<=':
		case '>=':
			if (left.end != null && right.start != null && left.end <= right.start) {
				return true
			}
			if (left.start != null && right.start != null && left.start > right.start) {
				return false
			}
			break
	}

	return undefined
}

const getBinaryOperationType = (ctx: TypeContext, { left: _left, op, right: _right }: BinaryOperationType): Type => {
	const left = simplifyType(ctx, _left)
	const right = simplifyType(ctx, _right)

	// special paths for computing exact literal types
	if (left.kind === 'number-type' && right.kind === 'number-type') {
		if (op === '+' || op === '-' || op === '*' || op === '/') {
			const value = opOnRange(op, left.value, right.value)

			if (value != null) {
				return literal(value)
			}
		}
	} else if (
		op === '+' &&
		(left.kind === 'string-type' || left.kind === 'number-type') &&
		(right.kind === 'string-type' || right.kind === 'number-type')
	) {
		// number + number is handled in previous path, this one is only strings

		// TODO: Once we support template strings we can do something meaningful here with number ranges
		if (typeof left.value !== 'object' && typeof right.value !== 'object' && left.value != null && right.value != null) {
			// @ts-expect-error we can add string | number together
			return literal(left.value + right.value)
		}
	}

	// default behavior
	switch (op) {
		case '+':
			if (subsumes(ctx, { to: number, from: left }) && subsumes(ctx, { to: number, from: right })) {
				return number
			}
			if (subsumes(ctx, { to: union(string, number), from: left }) && subsumes(ctx, { to: union(string, number), from: right })) {
				return string
			}
			break
		case '-':
		case '*':
		case '/':
			if (subsumes(ctx, { to: number, from: left }) && subsumes(ctx, { to: number, from: right })) {
				return number
			}
			break
		case '==':
		case '!=':
			if (
				(left.kind === 'string-type' || left.kind === 'number-type' || left.kind === 'boolean-type') &&
				left.kind === right.kind &&
				left.value != null && right.value != null &&
				left.value === right.value
			) {
				return literal(true)
			}

			if (intersect(ctx, left, right)) {
				return boolean
			} else {
				return literal(false)
			}
		case '<':
		case '>':
		case '<=':
		case '>=': {
			if (left.kind === 'number-type' && right.kind === 'number-type') {
				const leftRange = typeof left.value === 'number' ? { start: left.value, end: left.value } : left.value
				const rightRange = typeof right.value === 'number' ? { start: right.value, end: right.value } : right.value

				if (leftRange && rightRange) {
					const result = compareRanges(op, leftRange, rightRange)
					if (result) {
						return literal(result)
					} else {
						return boolean
					}
				}
			}

			const maybeNumber = union(number, nil)
			if (subsumes(ctx, { to: maybeNumber, from: left }) && subsumes(ctx, { to: maybeNumber, from: right })) {
				return boolean
			}
		} break
		case '&&':
		case '||': {
			const maybeBoolean = union(boolean, nil)
			if (subsumes(ctx, { to: maybeBoolean, from: left }) && subsumes(ctx, { to: maybeBoolean, from: right })) {
				return boolean
			}
		} break
		case '??':
			return union(
				{
					kind: 'exclude-type',
					subject: left,
					excluded: nil
				},
				right
			)
	}

	return poisoned
}

export type TypeContext = {
	typeScope: Record<string, Type>,
	valueScope: Record<string, Type>,
	preserveGenerics?: boolean,
	preserveValues?: boolean
}

export const simplifyType = (ctx: TypeContext, type: Type): Type => {
	const simplify = (type: Type) => simplifyType(ctx, type)

	switch (type.kind) {
		case 'invocation-type': {
			const subject = simplifyType({ ...ctx, preserveValues: true }, type.subject)

			if (subject.kind !== 'function-type') {
				return poisoned
			} else {
				const newCtx: TypeContext = {
					...ctx,
					valueScope: {
						...ctx.valueScope,
						...Object.fromEntries(
							zip(subject.params, type.args, 'truncate')
								.map(([param, arg]) =>
									param.kind === 'spread' || param.name == null
										? undefined
										: [(param as FunctionParam).name, simplify(arg)])
								.filter(exists)
						)
					},
				}

				return simplifyType(newCtx, subject.returns)
			}
		}
		case 'function-type': {
			const params = type.params.map(param =>
				param.kind === 'spread'
					? { ...param, spread: simplify(param.spread) }
					: { ...param, type: simplify(param.type) }
			)

			if (ctx.preserveValues) {
				return {
					...type,
					params,
				}
			} else {
				const newCtx: TypeContext = {
					...ctx,
					valueScope: {
						...ctx.valueScope,
						...Object.fromEntries(type.params
							.map(p =>
								p.kind !== 'spread' && p.name != null
									? [p.name, p.type]
									: undefined)
							.filter(exists))
					},
				}

				return {
					...type,
					params,
					returns: simplifyType(newCtx, type.returns),
				}
			}
		}
		case 'union-type':
			// TODO: collapse subsumed

			if (type.members.length === 1) {
				return simplify(type.members[0]!)
			}

			return {
				...type,
				members: type.members.map(simplify)
			}
		case 'object-type': return {
			kind: 'object-type',
			entries: (
				Array.isArray(type.entries)
					? type.entries
						.map(entry => {
							if (entry.kind === 'spread') {
								const s = simplify(entry.spread)

								if (s.kind === 'object-type' && Array.isArray(s.entries)) {
									return s.entries
								} else {
									return { kind: 'spread' as const, spread: s }
								}
							} else {
								return [{ kind: 'key-value-type' as const, key: simplify(entry.key), value: simplify(entry.value) }]
							}
						})
						.flat()
					: { kind: 'key-value-type', key: simplify(type.entries.key), value: simplify(type.entries.value) }
			)
		}
		case 'array-type': return {
			kind: 'array-type',
			elements: (
				Array.isArray(type.elements)
					? type.elements.map(element =>
						element.kind === 'spread'
							? todo()
							: simplify(element))
					: simplify(type.elements)
			)
		}
		case 'if-else-type': {
			const defaultCase = given(type.defaultCase, simplify)
			for (const { condition: _condition, outcome: _outcome } of type.cases) {
				const condition = simplify(_condition)
				const outcome = simplify(_outcome)

				if (subsumes(ctx, { to: literal(true), from: condition })) {
					return outcome
				} else if (!subsumes(ctx, { to: literal(false), from: condition })) {
					const allOutcomeTypes = type.cases.map(c => simplify(c.outcome))
					if (defaultCase) {
						allOutcomeTypes.push(defaultCase)
					} else {
						allOutcomeTypes.push(nil)
					}
					return union(...allOutcomeTypes)
				}
			}

			return defaultCase ?? nil
		}
		case 'binary-operation-type': return getBinaryOperationType(ctx, type)
		case 'property-type': return getPropertyType(ctx, type) ?? poisoned
		case 'values-type': return getValuesType(ctx, type)
		case 'keys-type': return getKeysType(ctx, type)
		case 'parameters-type': return getParametersType(ctx, type)
		case 'return-type': return getReturnType(ctx, type)
		case 'named-type': {
			const resolved = ctx.typeScope[type.identifier]
			if (resolved) {
				return simplify(resolved)
			} else {
				return type
			}
		}
		case 'local-identifier-type': {
			const resolved = ctx.valueScope[type.identifier]
			if (resolved) {
				return simplify(resolved)
			} else {
				return type
			}
		}
		case 'parameterized-type': {
			const inner = simplifyType({ ...ctx, preserveGenerics: true }, type.inner)

			if (inner.kind === 'generic-type') {
				return simplifyType(
					{
						...ctx,
						typeScope: {
							...ctx.typeScope,
							...Object.fromEntries(
								zip(inner.params, type.params, 'truncate')
									.map(([name, type]) => [name.name, simplify(type)])
							)
						}
					},
					inner.inner
				)
			} else {
				return poisoned
			}
		}
		case 'generic-type': {
			if (ctx.preserveGenerics) {
				return {
					...type,
					inner: simplify(type.inner)
				}
			} else {
				const newCtx: TypeContext = {
					...ctx,
					typeScope: {
						...ctx.typeScope,
						...Object.fromEntries(type.params
							.map(p => [p.name, p.extendz ?? unknown]))
					},
				}

				return simplifyType(newCtx, type.inner)
			}
		}
		case 'exclude-type':
		case 'string-type':
		case 'number-type':
		case 'boolean-type':
		case 'nil-type':
		case 'unknown-type':
		case 'poisoned-type':
		case 'switch-type':
			return type
	}
}

const basicSubsumationIssueMessage = ({ to, from }: { to: Type, from: Type }) => `Can't assign ${displayType({ typeScope: {}, valueScope: {} }, from)} into ${displayType({ typeScope: {}, valueScope: {} }, to)}`

export const displayType = (ctx: TypeContext, type: Type | SpreadType | KeyValueType | FunctionParam): string => {
	const display = (type: Type | SpreadType | KeyValueType | FunctionParam) => displayType(ctx, type)

	const simplified =
		type.kind === 'spread' || type.kind === 'key-value-type' || type.kind === 'function-param'
			? type
			: simplifyType(ctx, type)

	switch (simplified.kind) {
		case 'binary-operation-type': return `${display(simplified.left)} ${simplified.op} ${display(simplified.right)}`
		case 'property-type': return `${display(simplified.subject)}.${display(simplified.property)}`
		case 'keys-type': return `Keys<${display(simplified.subject)}>`
		case 'values-type': return `Values<${display(simplified.subject)}>`
		case 'parameters-type': return `Parameters<${display(simplified.subject)}>`
		case 'return-type': return `Return<${display(simplified.subject)}>`
		case 'function-type': return `(${simplified.params.map(display).join(', ')}) => ${display(simplified.returns)}`
		case 'function-param': return display(simplified.type)
		case 'union-type': return simplified.members.map(display).join(' | ')
		case 'exclude-type': return `Exclude<${display(simplified.subject)}, ${display(simplified.excluded)}>`
		case 'object-type': return `{ ${Array.isArray(simplified.entries)
			? simplified.entries.map(display).join(', ')
			: display(simplified.entries)} }`
		case 'key-value-type': {
			const keyName = simplified.key.kind === 'string-type' ? simplified.key.value : undefined
			return `${isValidIdentifier(keyName) ? keyName : display(simplified.key)}: ${display(simplified.value)}`
		}
		case 'array-type': return Array.isArray(simplified.elements) ? `[${simplified.elements.map(display).join(', ')}]` : display(simplified.elements) + '[]'
		case 'spread': return `...${display(simplified.spread)}`
		case 'string-type': return simplified.value != null ? `'${simplified.value}'` : 'string'
		case 'number-type': return simplified.value == null ? 'number' : typeof simplified.value === 'number' ? String(simplified.value) : `${simplified.value.start ?? ''}..${simplified.value.end ?? ''}`
		case 'boolean-type': return simplified.value != null ? String(simplified.value) : 'boolean'
		case 'generic-type': return `<${simplified.params.map(({ name, extendz }) => name + (extendz ? ` extends ${display(extendz)}` : '')).join(', ')}>${display(simplified.inner)}`
		case 'parameterized-type': return `${display(simplified.inner)}<${simplified.params.map(display).join(', ')}>`
		case 'if-else-type': return simplified.cases.map(({ condition, outcome }) => `if ${display(condition)} { ${display(outcome)} }`).join(' else ') + (simplified.defaultCase ? ` else { ${display(simplified.defaultCase)} }` : '')
		case 'switch-type': return todo()
		case 'invocation-type': return `${display(simplified.subject)}(${simplified.args.map(display).join(', ')})`
		case 'named-type':
		case 'local-identifier-type':
			return simplified.identifier
		case 'nil-type': return 'nil'
		case 'unknown-type': return 'unknown'
		case 'poisoned-type': return 'unknown'
	}
}

export const inferBodyType = (ctx: InferTypeContext, body: Expression | Statement[]): Type => {
	if (Array.isArray(body)) {
		return nil // TODO
	} else {
		return inferType(ctx, body)
	}
}

const globalsResult = parseModule(input(readFileSync(join(__dirname, '../../src/compiler/bagel-modules/lib', 'globals.bgl')).toString('utf-8')))
if (globalsResult?.kind !== 'success') throw Error()

export const globals = Object.fromEntries(
	globalsResult.parsed.declarations.map(decl =>
		[
			(decl as TypeDeclaration).name.identifier,
			resolveType({ platform: 'cross-platform' }, (decl as TypeDeclaration).type)
		])) as Record<'JS' | 'JSNode' | 'JSBrowser', Type>