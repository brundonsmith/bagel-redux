import { AST, BinaryOperationExpression, ConstDeclaration, Declaration, Expression, Identifier, TypeExpression, identifier } from './parser'
import { todo } from './utils'

export type Type =
	| { kind: 'union-type', members: Type[] }
	| { kind: 'object-type', entries: Array<KeyValueType | SpreadType> | KeyValueType }
	| { kind: 'array-type', elements: Array<Type | SpreadType> | Type }
	| { kind: 'string-type', value: string | undefined }
	| { kind: 'number-type', value: number | undefined }
	| { kind: 'boolean-type', value: boolean | undefined }
	| { kind: 'nil-type' }
	| { kind: 'unknown-type' }
	| { kind: 'poisoned-type' } // poisoned is the same as unknown, except it suppresses any further errors it would otherwise cause

// convenience
export const union = (...members: Type[]): Type => ({ kind: 'union-type', members } as const)
export const literal = (value: string | number | boolean): Type => (
	typeof value === 'string' ? { kind: 'string-type', value } :
		typeof value === 'number' ? { kind: 'number-type', value } :
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
export type SpreadType = { kind: 'spread-type', spread: Type }

export const inferType = (expression: Expression): Type => {
	switch (expression.kind) {
		case 'binary-operation-expression': {
			const leftType = inferType(expression.left)
			const rightType = inferType(expression.right)

			// special paths for computing exact literal types
			if (
				expression.op === '+'
			) {
				if (
					(leftType.kind === 'string-type' || leftType.kind === 'number-type') &&
					leftType.value != null &&
					(rightType.kind === 'string-type' || rightType.kind === 'number-type') &&
					rightType.value != null
				) {
					// @ts-expect-error we can add string | number together
					const value: string | number = leftType.value + rightType.value
					return literal(value)
				}
			} else if (
				leftType.kind === 'number-type' &&
				leftType.value != null &&
				rightType.kind === 'number-type' &&
				rightType.value != null
			) {
				switch (expression.op) {
					case '-': return literal(leftType.value - rightType.value)
					case '*': return literal(leftType.value * rightType.value)
					case '/': return literal(leftType.value / rightType.value)
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
				entry.kind === 'spread-expression'
					? { kind: 'spread-type', spread: inferType(entry.spread) }
					: { kind: 'key-value-type', key: inferType(entry.key), value: inferType(entry.value) }
			)
		}
		case 'array-literal': return {
			kind: 'array-type', elements: expression.elements.map(element =>
				element.kind === 'spread-expression'
					? { kind: 'spread-type', spread: inferType(element.spread) } as const
					: inferType(element)
			)
		}
		case 'string-literal': return { kind: 'string-type', value: expression.value }
		case 'number-literal': return { kind: 'number-type', value: expression.value }
		case 'boolean-literal': return { kind: 'boolean-type', value: expression.value }
		case 'nil-literal': return { kind: 'nil-type' }
		case 'identifier': return declarationType(resolveDeclaration(expression.identifier, expression))
	}
}

const declarationType = (declaration: ReturnType<typeof resolveDeclaration>): Type => {
	switch (declaration?.kind) {
		case 'const-declaration': return inferType(declaration.value)
		default: return poisoned
	}
}

export const resolveDeclaration = (name: string, at: AST | undefined): ConstDeclaration | undefined => {
	if (at == null) {
		return undefined
	}

	switch (at.parent?.kind) {
		case 'module': {
			const thisDeclarationIndex = at.parent.declarations.indexOf(at as Declaration)
			return at.parent.declarations.find((d, i) => d.name.identifier === name && i < thisDeclarationIndex)
		}
	}

	return resolveDeclaration(name, at?.parent)
}

export const resolveType = (typeExpression: TypeExpression): Type => {
	switch (typeExpression.kind) {
		case 'union-type-expression': return {
			kind: 'union-type',
			members: typeExpression.members.map(resolveType)
		}
		case 'object-type-expression': return {
			kind: 'object-type',
			entries: (
				Array.isArray(typeExpression.entries)
					? typeExpression.entries.map(entry =>
						entry.kind === 'spread-type-expression'
							? { kind: 'spread-type', spread: resolveType(entry.spread) } as const
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
						element.kind === 'spread-type-expression'
							? { kind: 'spread-type', spread: resolveType(element.spread) } as const
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

	if (from.kind === 'poisoned-type') {
		return NO_ISSUES
	}

	switch (to.kind) {
		case 'union-type': return to.members.map(to => subsumationIssues({ to, from })).flat()
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
							to.kind === 'spread-type'
								? todo()
								: from.kind === 'spread-type'
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
						from.kind === 'spread-type'
							? todo()
							: subsumationIssues({ to: toElements, from })
					).flat()
				} else {
					return subsumationIssues({ to: to.elements, from: from.elements })
				}
			}
		}
		case 'string-type':
		case 'number-type':
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
		case 'unknown-type': return NO_ISSUES
		case 'poisoned-type': return NO_ISSUES
	}
}

const CANONICAL_TYPE_SYMBOL = Symbol('CANONICAL_TYPE_SYMBOL')
export type CanonicalType = Type// & { [CANONICAL_TYPE_SYMBOL]: undefined }

export const canonicalizeType = (type: Type): CanonicalType => {
	switch (type.kind) {
		case 'union-type':
			// TODO: collapse subsumed
			// TODO: unbox singleton unions
			return {
				...type,
				members: type.members.map(canonicalizeType)
			} as CanonicalType
		case 'object-type': return {
			...type,
			elements: (
				Array.isArray(type.entries)
					? type.entries.map(entry =>
						entry.kind === 'spread-type'
							? { ...entry, spread: canonicalizeType(entry.spread) }
							: { ...entry, key: canonicalizeType(entry.key), value: canonicalizeType(entry.value) }
					)
					: { key: canonicalizeType(type.entries.key), value: canonicalizeType(type.entries.value) }
			)
		} as CanonicalType
		case 'array-type': return {
			...type,
			elements: (
				Array.isArray(type.elements)
					? type.elements.map(element =>
						element.kind === 'spread-type'
							? todo()
							: canonicalizeType(element))
					: canonicalizeType(type.elements)
			)
		} as CanonicalType
		case 'string-type':
		case 'number-type':
		case 'boolean-type':
		case 'nil-type':
		case 'unknown-type':
		case 'poisoned-type':
			return type as CanonicalType
	}
}

const basicSubsumationIssueMessage = ({ to, from }: { to: Type, from: Type }) => `Can't assign ${displayType(from)} into ${displayType(to)}`

export const displayType = (type: Type | SpreadType | KeyValueType): string => {
	switch (type.kind) {
		case 'union-type': return type.members.map(displayType).join(' | ')
		case 'object-type': return `{ ${Array.isArray(type.entries)
			? type.entries.map(displayType).join(', ')
			: displayType(type.entries)} }`
		case 'key-value-type': return `${displayType(type.key)}: ${displayType(type.value)}`
		case 'array-type': return Array.isArray(type.elements) ? `[${type.elements.map(displayType).join(', ')}]` : displayType(type.elements) + '[]'
		case 'spread-type': return `...${displayType(type)}`
		case 'string-type': return type.value != null ? `'${type.value}'` : 'string'
		case 'number-type': return type.value != null ? String(type.value) : 'number'
		case 'boolean-type': return type.value != null ? String(type.value) : 'boolean'
		case 'nil-type': return 'nil'
		case 'unknown-type': return 'unknown'
		case 'poisoned-type': return 'unknown'
	}
}