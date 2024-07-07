import { AST, BinaryOperator, ConstDeclaration, Expression, ImportDeclaration, ImportItem, NameAndType, TypeDeclaration, TypeExpression, isValidIdentifier } from './parser'
import { todo, zip, profile, log } from './utils'

export type Type =
	| Readonly<{ kind: 'function-type', params: Array<Type | SpreadType>, returns: Type, pure: boolean }>
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
	| Readonly<{ kind: 'named-type', identifier: string, ast: AST }>
	| Readonly<{ kind: 'generic-type', inner: Type, params: GenericParam[] }>
	| Readonly<{ kind: 'parameterized-type', inner: Type, params: Type[] }>
	| PropertyType
	| KeysType
	| ValuesType
	| ParametersType
	| ReturnTypez

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

export const inferType = profile('inferType', (expression: Expression): Type => {
	switch (expression.kind) {
		case 'property-access-expression': return {
			kind: 'property-type',
			subject: inferType(expression.subject),
			property: inferType(expression.property)
		}
		case 'as-expression': return resolveType(expression.type)
		case 'function-expression': {
			return {
				kind: 'function-type',
				params: expression.params.map(a => a.type ? resolveType(a.type) : unknown),
				returns: inferType(expression.body),
				pure: false // TODO
			}
		}
		case 'invocation': return { kind: 'invocation-type', subject: inferType(expression.subject), args: expression.args.map(inferType) }
		case 'binary-operation-expression': return { kind: 'binary-operation-type', left: inferType(expression.left), op: expression.op, right: inferType(expression.right) }
		case 'if-else-expression': return {
			kind: 'if-else-type',
			cases: expression.cases.map(({ condition, outcome }) => ({ condition: inferType(condition), outcome: inferType(outcome) })),
			defaultCase: expression.defaultCase ? inferType(expression.defaultCase) : undefined
		}
		case 'parenthesis': return inferType(expression.inner)
		case 'object-literal': return {
			kind: 'object-type', entries: expression.entries.map(entry =>
				entry.kind === 'spread'
					? { kind: 'spread', spread: inferType(entry.spread) }
					: { kind: 'key-value-type', key: inferType(entry.key), value: inferType(entry.value) }
			)
		}
		case 'array-literal': return {
			kind: 'array-type', elements: expression.elements.map(element =>
				element.kind === 'spread'
					? { kind: 'spread', spread: inferType(element.spread) } as const
					: inferType(element)
			)
		}
		case 'string-literal': return { kind: 'string-type', value: expression.value }
		case 'number-literal': return { kind: 'number-type', value: expression.value }
		case 'boolean-literal': return { kind: 'boolean-type', value: expression.value }
		case 'nil-literal': return { kind: 'nil-type' }
		case 'local-identifier': return declarationType(resolveValueDeclaration(expression.identifier, expression))
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

const declarationType = (declaration: ReturnType<typeof resolveValueDeclaration>): Type => {
	switch (declaration?.kind) {
		case 'import-item': return todo()
		case 'const-declaration': return inferType(declaration.value)
		case 'name-and-type': return declaration.type ? resolveType(declaration.type) : unknown
		case undefined: return poisoned
	}
}

export const resolveValueDeclaration = (name: string, at: AST | undefined): LocalIdentifierDeclaration | undefined =>
	valueDeclarationsInScope(at).find(decl => {
		switch (decl.kind) {
			case 'import-item': return (decl.alias ?? decl.name).identifier === name
			case 'const-declaration': return decl.declared.name.identifier === name
			case 'name-and-type': return decl.name.identifier === name
		}
	})

export const valueDeclarationsInScope = (at: AST | undefined): Array<LocalIdentifierDeclaration> => {
	if (at == null) {
		return []
	}

	const declarationsInParentScopes = valueDeclarationsInScope(at?.parent)

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
			return [
				...at.parent.params,
				...declarationsInParentScopes
			]
		}
	}

	return declarationsInParentScopes
}

export const resolveType = (typeExpression: TypeExpression): Type => {
	switch (typeExpression.kind) {
		case 'typeof-type-expression': return inferType(typeExpression.expression)
		case 'function-type-expression': return {
			kind: 'function-type',
			params: typeExpression.params.map(resolveType),
			returns: resolveType(typeExpression.returns),
			pure: typeExpression.pure
		}
		case 'union-type-expression': return {
			kind: 'union-type',
			members: typeExpression.members.map(resolveType)
		}
		case 'generic-type-expression': return {
			kind: 'generic-type',
			inner: resolveType(typeExpression.inner),
			params: typeExpression.params.map(({ name, extendz }) => ({ name: name.identifier, extendz: extendz ? resolveType(extendz) : undefined }))
		}
		case 'parameterized-type-expression': return {
			kind: 'parameterized-type',
			inner: resolveType(typeExpression.inner),
			params: typeExpression.params.map(resolveType)
		}
		case 'parenthesis': return resolveType(typeExpression.inner)
		case 'object-literal': return {
			kind: 'object-type',
			entries: (
				typeExpression.entries.map(entry =>
					entry.kind === 'spread'
						? { kind: 'spread', spread: resolveType(entry.spread) } as const
						: { kind: 'key-value-type', key: resolveType(entry.key), value: resolveType(entry.value) } as const
				)
			)
		}
		// : { kind: 'key-value-type', key: resolveType(typeExpression.entries.key), value: resolveType(typeExpression.entries.value) }
		case 'array-literal': return {
			kind: 'array-type',
			elements: (
				typeExpression.elements.map(element =>
					element.kind === 'spread'
						? { kind: 'spread', spread: resolveType(element.spread) } as const
						: resolveType(element)
				)
			)
		}
		// : resolveType(typeExpression.elements)
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
		case 'local-identifier': {
			const declaration = resolveTypeDeclaration(typeExpression.identifier, typeExpression)
			return declaration == null ? poisoned : resolveType(declaration.type)
		}
		case 'unknown-type-expression': return unknown
		case 'broken-subtree': return poisoned
	}
}

type LocalIdentifierDeclaration = ImportItem | ConstDeclaration | NameAndType

export const resolveTypeDeclaration = (name: string, at: AST | undefined): TypeDeclaration | undefined =>
	typeDeclarationsInScope(at).find(decl => {
		switch (decl.kind) {
			case 'type-declaration': return decl.name.identifier === name
		}
	})

export const typeDeclarationsInScope = (at: AST | undefined): Array<TypeDeclaration> => {
	if (at == null) {
		return []
	}

	const declarationsInParentScopes = typeDeclarationsInScope(at?.parent)

	switch (at?.parent?.kind) {
		case 'module': {
			return [
				...at.parent.declarations
					.map(d =>
						d.kind === 'type-declaration'
							? [d]
							: [])
					.flat(),
				...declarationsInParentScopes
			]
		}
	}

	return declarationsInParentScopes
}

export const subsumes = (types: { to: Type, from: Type }): boolean => subsumationIssues(types).length === 0
export const intersect = (type1: Type, type2: Type) =>
	// TODO: this doesn't cover partial intersection yet
	subsumes({ to: type1, from: type2 }) || subsumes({ to: type2, from: type1 })

export type SubsumationIssue = string

// return poisoned
export const subsumationIssues = ({ to: _to, from: _from }: { to: Type, from: Type }): readonly SubsumationIssue[] => {
	const NO_ISSUES = [] as const

	const to = simplifyType(_to)
	const from = simplifyType(_from)

	// indirect types that require evaluation/recursion
	switch (to.kind) {
		case 'union-type': {
			const memberIssues = to.members.map(to => subsumationIssues({ to, from }))

			if (memberIssues.some(i => i.length === 0)) {
				return NO_ISSUES
			} else {
				return memberIssues.flat()
			}
		}
		case 'unknown-type': return NO_ISSUES
		case 'poisoned-type': return NO_ISSUES
	}
	switch (from.kind) {
		case 'union-type': return todo()
		case 'poisoned-type': return NO_ISSUES
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
					issues.push(...subsumationIssues({ to: fromParam as Type, from: toParam as Type })) // TODO
				}

				issues.push(...subsumationIssues({ to: to.returns, from: from.returns }))

				return [basicSubsumationIssueMessage({ to, from }), ...issues]
			}
		}
		case 'object-type': return todo()
		case 'array-type': {
			if (from.kind !== 'array-type') {
				return [basicSubsumationIssueMessage({ to, from })]
			} else if (Array.isArray(to.elements)) {
				if (Array.isArray(from.elements)) {
					if (from.elements.length < to.elements.length) {
						return [`Array type ${displayType(from)} has fewer elements than destination array type ${displayType(to)}`]
					}

					const fromElements = from.elements
					return to.elements.map((to, i) => {
						const from = fromElements[i]!
						return (
							to.kind === 'spread'
								? todo()
								: from.kind === 'spread'
									? todo()
									: subsumationIssues({ to, from })
						)
					}).flat()
				} else {
					return [basicSubsumationIssueMessage({ to, from })]
				}
			} else {
				if (Array.isArray(from.elements)) {
					const toElements = to.elements
					return from.elements.map(from =>
						from.kind === 'spread'
							? todo()
							: subsumationIssues({ to: toElements, from })
					).flat()
				} else {
					return subsumationIssues({ to: to.elements, from: from.elements })
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
		case 'named-type':
		case 'generic-type':
		case 'parameterized-type':
		case 'property-type':
		case 'keys-type':
		case 'values-type':
		case 'parameters-type':
		case 'return-type':
			return todo()
	}
}

const getPropertyType = ({ subject: _subject, property: _property }: PropertyType): Type | undefined => {
	const subject = simplifyType(_subject)
	const property = simplifyType(_property)

	switch (subject.kind) {
		case 'object-type': {
			if (Array.isArray(subject.entries)) {
				const found = subject.entries.find(e =>
					e.kind === 'key-value-type' && subsumes({ to: e.key, from: property })) as KeyValueType | undefined

				if (found) {
					return found.value
				} else {
					// TODO: Search spreads

					return undefined
				}
			} else if (subsumes({ to: subject.entries.key, from: property })) {
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

const getKeysType = ({ subject }: KeysType): Type => {
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

const getValuesType = ({ subject }: ValuesType): Type => {
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

const getParametersType = ({ subject }: ParametersType): Type => {
	switch (subject.kind) {
		case 'function-type': {
			return { kind: 'array-type', elements: subject.params as Type[] }
		}
	}

	return poisoned
}

const getReturnType = ({ subject }: ReturnTypez): Type => {
	switch (subject.kind) {
		case 'function-type': {
			return subject.returns
		}
	}

	return poisoned
}

const getIfElseType = ({ cases, defaultCase }: IfElseType): Type => {
	for (const { condition, outcome } of cases) {
		if (subsumes({ to: literal(true), from: condition })) {
			return outcome
		} else if (!subsumes({ to: literal(false), from: condition })) {
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

const getInvocationType = ({ subject }: InvocationType): Type => {
	if (subject.kind !== 'function-type') {
		return poisoned
	} else {
		return subject.returns
	}
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

const getBinaryOperationType = ({ left: _left, op, right: _right }: BinaryOperationType): Type => {
	const left = simplifyType(_left)
	const right = simplifyType(_right)

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
			if (subsumes({ to: number, from: left }) && subsumes({ to: number, from: right })) {
				return number
			}
			if (subsumes({ to: union(string, number), from: left }) && subsumes({ to: union(string, number), from: right })) {
				return string
			}
			break
		case '-':
		case '*':
		case '/':
			if (subsumes({ to: number, from: left }) && subsumes({ to: number, from: right })) {
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

			if (intersect(left, right)) {
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
			if (subsumes({ to: maybeNumber, from: left }) && subsumes({ to: maybeNumber, from: right })) {
				return boolean
			}
		} break
		case '&&':
		case '||': {
			const maybeBoolean = union(boolean, nil)
			if (subsumes({ to: maybeBoolean, from: left }) && subsumes({ to: maybeBoolean, from: right })) {
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

export const simplifyType = (type: Type): Type => {
	switch (type.kind) {
		case 'function-type':
			return {
				kind: 'function-type',
				pure: type.pure,
				params: type.params.map(param =>
					param.kind === 'spread'
						? { ...param, spread: simplifyType(param.spread) }
						: simplifyType(param)
				),
				returns: simplifyType(type.returns),
			}
		case 'union-type':
			// TODO: collapse subsumed

			if (type.members.length === 1) {
				return simplifyType(type.members[0]!)
			}

			return {
				...type,
				members: type.members.map(simplifyType)
			}
		case 'object-type': return {
			kind: 'object-type',
			entries: (
				Array.isArray(type.entries)
					? type.entries
						.map(entry => {
							if (entry.kind === 'spread') {
								const s = simplifyType(entry.spread)

								if (s.kind === 'object-type' && Array.isArray(s.entries)) {
									return s.entries
								} else {
									return { kind: 'spread' as const, spread: s }
								}
							} else {
								return [{ kind: 'key-value-type' as const, key: simplifyType(entry.key), value: simplifyType(entry.value) }]
							}
						})
						.flat()
					: { kind: 'key-value-type', key: simplifyType(type.entries.key), value: simplifyType(type.entries.value) }
			)
		}
		case 'array-type': return {
			kind: 'array-type',
			elements: (
				Array.isArray(type.elements)
					? type.elements.map(element =>
						element.kind === 'spread'
							? todo()
							: simplifyType(element))
					: simplifyType(type.elements)
			)
		}
		case 'if-else-type': return getIfElseType(type)
		case 'invocation-type': return getInvocationType(type)
		case 'binary-operation-type': return getBinaryOperationType(type)
		case 'property-type': return getPropertyType(type) ?? poisoned
		case 'values-type': return getValuesType(type)
		case 'keys-type': return getKeysType(type)
		case 'parameters-type': return getParametersType(type)
		case 'return-type': return getReturnType(type)
		case 'named-type': {
			const declaration = resolveTypeDeclaration(type.identifier, type.ast)

			if (declaration) {
				return resolveType(declaration.type)
			} else {
				return poisoned
			}
		}
		case 'exclude-type':
		case 'string-type':
		case 'number-type':
		case 'boolean-type':
		case 'nil-type':
		case 'unknown-type':
		case 'poisoned-type':
		case 'generic-type':
		case 'parameterized-type':
		case 'switch-type':
			return type
	}
}

const basicSubsumationIssueMessage = ({ to, from }: { to: Type, from: Type }) => `Can't assign ${displayType(from)} into ${displayType(to)}`

export const displayType = (type: Type | SpreadType | KeyValueType): string => {
	const simplified =
		type.kind === 'spread' || type.kind === 'key-value-type'
			? type
			: simplifyType(type)

	switch (simplified.kind) {
		case 'binary-operation-type': return `${displayType(simplified.left)} ${simplified.op} ${displayType(simplified.right)}`
		case 'property-type': return `${displayType(simplified.subject)}.${displayType(simplified.property)}`
		case 'keys-type': return `Keys<${displayType(simplified.subject)}>`
		case 'values-type': return `Values<${displayType(simplified.subject)}>`
		case 'parameters-type': return `Parameters<${displayType(simplified.subject)}>`
		case 'return-type': return `Return<${displayType(simplified.subject)}>`
		case 'function-type': return `(${simplified.params.map(displayType).join(', ')}) => ${displayType(simplified.returns)}`
		case 'union-type': return simplified.members.map(displayType).join(' | ')
		case 'exclude-type': return `Exclude<${displayType(simplified.subject)}, ${displayType(simplified.excluded)}>`
		case 'object-type': return `{ ${Array.isArray(simplified.entries)
			? simplified.entries.map(displayType).join(', ')
			: displayType(simplified.entries)} }`
		case 'key-value-type': {
			const keyName = simplified.key.kind === 'string-type' ? simplified.key.value : undefined
			return `${isValidIdentifier(keyName) ? keyName : displayType(simplified.key)}: ${displayType(simplified.value)}`
		}
		case 'array-type': return Array.isArray(simplified.elements) ? `[${simplified.elements.map(displayType).join(', ')}]` : displayType(simplified.elements) + '[]'
		case 'spread': return `...${displayType(simplified.spread)}`
		case 'string-type': return simplified.value != null ? `'${simplified.value}'` : 'string'
		case 'number-type': return simplified.value == null ? 'number' : typeof simplified.value === 'number' ? String(simplified.value) : `${simplified.value.start ?? ''}..${simplified.value.end ?? ''}`
		case 'boolean-type': return simplified.value != null ? String(simplified.value) : 'boolean'
		case 'generic-type': return `<${simplified.params.map(({ name, extendz }) => name + (extendz ? ` extends ${displayType(extendz)}` : '')).join(', ')}>${displayType(simplified.inner)}`
		case 'parameterized-type': return `${displayType(simplified.inner)}<${simplified.params.map(displayType).join(', ')}>`
		case 'if-else-type': return simplified.cases.map(({ condition, outcome }) => `if ${displayType(condition)} { ${displayType(outcome)} }`).join(' else ') + (simplified.defaultCase ? ` else { ${displayType(simplified.defaultCase)} }` : '')
		case 'switch-type': return todo()
		case 'invocation-type': return `${displayType(simplified.subject)}(${simplified.args.map(displayType).join(', ')})`
		case 'named-type': return simplified.identifier
		case 'nil-type': return 'nil'
		case 'unknown-type': return 'unknown'
		case 'poisoned-type': return 'unknown'
	}
}
