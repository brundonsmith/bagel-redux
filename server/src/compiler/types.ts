import { AST, BinaryOperationExpression, ConstDeclaration, Declaration, Expression, NameAndType, Range, TypeExpression } from './parser'
import { todo, zip } from './utils'

export type Type =
	| { kind: 'function-type', params: Array<Type | SpreadType>, returns: Type }
	| { kind: 'union-type', members: Type[] }
	| { kind: 'object-type', entries: Array<KeyValueType | SpreadType> | KeyValueType }
	| { kind: 'array-type', elements: Array<Type | SpreadType> | Type }
	| { kind: 'string-type', value: string | undefined }
	| { kind: 'number-type', value: Range | number | undefined }
	| { kind: 'boolean-type', value: boolean | undefined }
	| { kind: 'nil-type' }
	| { kind: 'unknown-type' }
	| { kind: 'poisoned-type' } // poisoned is the same as unknown, except it suppresses any further errors it would otherwise cause
	| PropertyType
	| KeysType
	| ValuesType
	| ParametersType
	| ReturnTypez

type PropertyType = { kind: 'property-type', subject: Type, property: Type }
type KeysType = { kind: 'keys-type', subject: Type }
type ValuesType = { kind: 'values-type', subject: Type }
type ParametersType = { kind: 'parameters-type', subject: Type }
type ReturnTypez = { kind: 'return-type', subject: Type }

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

export const opSignatures = {
	'+': [
		{ requiredLeft: number, requiredRight: number, result: number },
		{ requiredLeft: string, requiredRight: string, result: string },
		{ requiredLeft: string, requiredRight: number, result: string },
		{ requiredLeft: number, requiredRight: string, result: string },
	],
	'-': [
		{ requiredLeft: number, requiredRight: number, result: number },
	],
	'*': [
		{ requiredLeft: number, requiredRight: number, result: number },
	],
	'/': [
		{ requiredLeft: number, requiredRight: number, result: number },
	]
} as const satisfies Record<BinaryOperationExpression['op'], { requiredLeft: Type, requiredRight: Type, result: Type }[]>

export type KeyValueType = { kind: 'key-value-type', key: Type, value: Type }
export type SpreadType = { kind: 'spread', spread: Type }

const opOnRange = (operator: '+' | '-' | '*' | '/', left: Range | number | undefined, right: Range | number | undefined): Range | number | undefined => {
	if (left == null || right == null) {
		return undefined
	}

	const op = tolerantOp(baseOperatorFns[operator])

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

const tolerantOp = <T>(fn: (left: T, right: T) => T) => (left: T | undefined, right: T | undefined): T | undefined => {
	if (left == null || right == null) {
		return undefined
	} else {
		return fn(left, right)
	}
}

const baseOperatorFns = {
	// @ts-expect-error we can add string | number together
	'+': (left: number | string, right: number | string) => left + right,
	'-': (left: number, right: number) => left - right,
	'*': (left: number, right: number) => left * right,
	'/': (left: number, right: number) => left / right,
} as const

export const inferType = (expression: Expression): Type => {
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
				params: expression.args.map(a => a.type ? resolveType(a.type) : unknown),
				returns: inferType(expression.body)
			}
		}
		case 'invocation': {
			const functionType = inferType(expression.subject)
			if (functionType.kind !== 'function-type') {
				return poisoned
			} else {
				return functionType.returns
			}
		}
		case 'binary-operation-expression': {
			const leftType = inferType(expression.left)
			const rightType = inferType(expression.right)

			// special paths for computing exact literal types
			if (leftType.kind === 'number-type' && rightType.kind === 'number-type') {
				if (expression.op === '+' || expression.op === '-' || expression.op === '*' || expression.op === '/') {
					const value = opOnRange(expression.op, leftType.value, rightType.value)

					if (value != null) {
						return literal(value)
					}
				}
			} else if (
				expression.op === '+' &&
				(leftType.kind === 'string-type' || leftType.kind === 'number-type') &&
				(rightType.kind === 'string-type' || rightType.kind === 'number-type')
			) {
				// number + number is handled in previous path, this one is only strings

				// TODO: Once we support template strings we can do something meaningful here with number ranges
				if (typeof leftType.value !== 'object' && typeof rightType.value !== 'object') {
					const value = tolerantOp(baseOperatorFns['+'])(leftType.value, rightType.value)

					if (value != null) {
						return literal(value)
					}
				}
			}

			// default behavior
			const opSignature = opSignatures[expression.op].find(({ requiredLeft, requiredRight }) =>
				subsumes({ to: requiredLeft, from: leftType }) && subsumes({ to: requiredRight, from: rightType }))

			if (opSignature == null) {
				return poisoned
			} else {
				return opSignature.result
			}
		}
		case 'if-else-expression': {
			for (const c of expression.cases) {
				const conditionType = inferType(c.condition)
				if (subsumes({ to: literal(true), from: conditionType })) {
					return inferType(c.outcome)
				} else if (!subsumes({ to: literal(false), from: conditionType })) {
					const allOutcomeTypes = expression.cases.map(c => inferType(c.outcome))
					if (expression.defaultCase) {
						allOutcomeTypes.push(inferType(expression.defaultCase))
					} else {
						allOutcomeTypes.push(nil)
					}
					return union(...allOutcomeTypes)
				}
			}

			if (expression.defaultCase) {
				return inferType(expression.defaultCase)
			} else {
				return nil
			}
		}
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
		case 'local-identifier': return declarationType(resolveDeclaration(expression.identifier, expression))
	}
}

const declarationType = (declaration: ReturnType<typeof resolveDeclaration>): Type => {
	switch (declaration?.kind) {
		case 'const-declaration': return inferType(declaration.value)
		case 'name-and-type': return declaration.type ? resolveType(declaration.type) : unknown
		case undefined: return poisoned
	}
}

export const resolveDeclaration = (name: string, at: AST | undefined): ConstDeclaration | NameAndType | undefined => {
	if (at == null) {
		return undefined
	}

	switch (at.parent?.kind) {
		case 'module': {
			const thisDeclarationIndex = at.parent.declarations.indexOf(at as Declaration)
			const found = at.parent.declarations.find((d, i) => d.declared.name.identifier === name && i < thisDeclarationIndex)
			if (found) {
				return found
			}
		} break
		case 'function-expression': {
			const found = at.parent.args.find(arg => arg.name.identifier === name)
			if (found) {
				return found
			}
		} break
	}

	return resolveDeclaration(name, at?.parent)
}

export const resolveType = (typeExpression: TypeExpression): Type => {
	switch (typeExpression.kind) {
		case 'typeof-type-expression': return inferType(typeExpression.expression)
		case 'function-type-expression': return {
			kind: 'function-type',
			params: typeExpression.params.map(resolveType),
			returns: resolveType(typeExpression.returns)
		}
		case 'union-type-expression': return {
			kind: 'union-type',
			members: typeExpression.members.map(resolveType)
		}
		case 'object-type-expression': return {
			kind: 'object-type',
			entries: (
				Array.isArray(typeExpression.entries)
					? typeExpression.entries.map(entry =>
						entry.kind === 'spread'
							? { kind: 'spread', spread: resolveType(entry.spread) } as const
							: { kind: 'key-value-type', key: resolveType(entry.key), value: resolveType(entry.value) } as const
					)
					: { kind: 'key-value-type', key: resolveType(typeExpression.entries.key), value: resolveType(typeExpression.entries.value) }
			)
		}
		case 'array-type-expression': return {
			kind: 'array-type',
			elements: (
				Array.isArray(typeExpression.elements)
					? typeExpression.elements.map(element =>
						element.kind === 'spread'
							? { kind: 'spread', spread: resolveType(element.spread) } as const
							: resolveType(element)
					)
					: resolveType(typeExpression.elements)
			)
		}
		case 'string-type-expression': return { kind: 'string-type', value: typeExpression.value }
		case 'number-type-expression': return { kind: 'number-type', value: typeExpression.value }
		case 'boolean-type-expression': return { kind: 'boolean-type', value: typeExpression.value }
		case 'nil-type-expression': return { kind: 'nil-type' }
		case 'unknown-type-expression': return { kind: 'unknown-type' }
	}
}

export const subsumes = (types: { to: Type, from: Type }): boolean => subsumationIssues(types).length === 0

export type SubsumationIssue = string

export const subsumationIssues = ({ to, from }: { to: Type, from: Type }): readonly SubsumationIssue[] => {
	const NO_ISSUES = [] as const

	// indirect types that require evaluation/recursion
	switch (to.kind) {
		case 'property-type': return subsumationIssues({ to: getPropertyType(to), from })
		case 'keys-type': return subsumationIssues({ to: getKeysType(to), from })
		case 'values-type': return subsumationIssues({ to: getValuesType(to), from })
		case 'parameters-type': return subsumationIssues({ to: getParametersType(to), from })
		case 'return-type': return subsumationIssues({ to: getReturnType(to), from })
		case 'union-type': return to.members.map(to => subsumationIssues({ to, from })).flat()
		case 'unknown-type': return NO_ISSUES
		case 'poisoned-type': return NO_ISSUES
	}
	switch (from.kind) {
		case 'property-type': return subsumationIssues({ to, from: getPropertyType(from) })
		case 'keys-type': return subsumationIssues({ to, from: getKeysType(from) })
		case 'values-type': return subsumationIssues({ to, from: getValuesType(from) })
		case 'parameters-type': return subsumationIssues({ to, from: getParametersType(from) })
		case 'return-type': return subsumationIssues({ to, from: getReturnType(from) })
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
	}
}

const getPropertyType = ({ subject, property }: PropertyType): Type => {
	switch (subject.kind) {
		case 'object-type': {
			if (Array.isArray(subject.entries)) {
				const found = subject.entries.find(e =>
					e.kind === 'key-value-type' && subsumes({ to: e.key, from: property })) as KeyValueType | undefined

				if (found) {
					return found.value
				} else {
					// TODO: Search spreads
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
						case 'number': return (subject.elements[property.value] ?? poisoned) as Type
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
	}

	return poisoned
}

const getKeysType = ({ subject }: KeysType): Type => {
	switch (subject.kind) {
		case 'object-type': {
			if (Array.isArray(subject.entries)) {
				// TODO: Combine with spreads
				return union(...subject.entries.map(e => (e as KeyValueType).key))
			} else {
				return subject.entries.key
			}
		}
		case 'array-type': {
			if (Array.isArray(subject.elements)) {
				// TODO: Combine with spreads
				return union(literal({ start: 0, end: subject.elements.length }), literal('length'))
			} else {
				return union(number, literal('length'))
			}
		}
	}

	return poisoned
}

const getValuesType = ({ subject }: ValuesType): Type => {
	switch (subject.kind) {
		case 'object-type': {
			if (Array.isArray(subject.entries)) {
				// TODO: Combine with spreads
				return union(...subject.entries.map(e => (e as KeyValueType).value))
			} else {
				return subject.entries.value
			}
		}
		case 'array-type': {
			if (Array.isArray(subject.elements)) {
				// TODO: Combine with spreads
				return union(...subject.elements as Type[], literal('length'))
			} else {
				return union(subject.elements, literal('length'))
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

// export const simplifyType = (type: Type): Type => {
// 	switch (type.kind) {
// 		case 'function-type':
// 			return {
// 				...type,
// 				args: type.args.map(arg =>
// 					arg.kind === 'spread'
// 						? { ...arg, spread: simplifyType(arg.spread) }
// 						: simplifyType(arg)
// 				),
// 				returns: simplifyType(type.returns)
// 			}
// 		case 'union-type':
// 			// TODO: collapse subsumed
// 			// TODO: unbox singleton unions
// 			return {
// 				...type,
// 				members: type.members.map(simplifyType)
// 			}
// 		case 'object-type': return {
// 			...type,
// 			elements: (
// 				Array.isArray(type.entries)
// 					? type.entries.map(entry =>
// 						entry.kind === 'spread'
// 							? { ...entry, spread: simplifyType(entry.spread) }
// 							: { ...entry, key: simplifyType(entry.key), value: simplifyType(entry.value) }
// 					)
// 					: { key: simplifyType(type.entries.key), value: simplifyType(type.entries.value) }
// 			)
// 		}
// 		case 'array-type': return {
// 			...type,
// 			elements: (
// 				Array.isArray(type.elements)
// 					? type.elements.map(element =>
// 						element.kind === 'spread'
// 							? todo()
// 							: simplifyType(element))
// 					: simplifyType(type.elements)
// 			)
// 		}
// 		case 'string-type':
// 		case 'number-type':
// 		case 'boolean-type':
// 		case 'nil-type':
// 		case 'unknown-type':
// 		case 'poisoned-type':
// 			return type
// 	}
// }

const basicSubsumationIssueMessage = ({ to, from }: { to: Type, from: Type }) => `Can't assign ${displayType(from)} into ${displayType(to)}`

export const displayType = (type: Type | SpreadType | KeyValueType): string => {
	switch (type.kind) {
		case 'property-type': return `${displayType(type.subject)}.${displayType(type.property)}`
		case 'keys-type': return `Keys<${displayType(type.subject)}>`
		case 'values-type': return `Values<${displayType(type.subject)}>`
		case 'parameters-type': return `Parameters<${displayType(type.subject)}>`
		case 'return-type': return `Return<${displayType(type.subject)}>`
		case 'function-type': return `(${type.params.map(displayType).join(', ')}) => ${displayType(type.returns)}`
		case 'union-type': return type.members.map(displayType).join(' | ')
		case 'object-type': return `{ ${Array.isArray(type.entries)
			? type.entries.map(displayType).join(', ')
			: displayType(type.entries)} }`
		case 'key-value-type': return `${displayType(type.key)}: ${displayType(type.value)}`
		case 'array-type': return Array.isArray(type.elements) ? `[${type.elements.map(displayType).join(', ')}]` : displayType(type.elements) + '[]'
		case 'spread': return `...${displayType(type)}`
		case 'string-type': return type.value != null ? `'${type.value}'` : 'string'
		case 'number-type': return type.value == null ? 'number' : typeof type.value === 'number' ? String(type.value) : `${type.value.start ?? ''}..${type.value.end ?? ''}`
		case 'boolean-type': return type.value != null ? String(type.value) : 'boolean'
		case 'nil-type': return 'nil'
		case 'unknown-type': return 'unknown'
		case 'poisoned-type': return 'unknown'
	}
}