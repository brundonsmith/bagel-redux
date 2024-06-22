import { Expression, TypeExpression } from './parser'

export type Type =
	| { kind: 'union-type', members: Type[] }
	| { kind: 'object-type', entries: { key: Type, value: Type }[] | { key: Type, value: Type } }
	| { kind: 'array-type', elements: Type[] | Type }
	| { kind: 'string-type', value: string | undefined }
	| { kind: 'number-type', value: number | undefined }
	| { kind: 'boolean-type', value: boolean | undefined }
	| { kind: 'nil-type' }
	| { kind: 'unknown-type' }

export const inferType = (expression: Expression): Type => {
	switch (expression.kind) {
		case 'object-literal': return { kind: 'object-type', entries: expression.entries.map(({ key, value }) => ({ key: inferType(key), value: inferType(value) })) }
		case 'array-literal': return { kind: 'array-type', elements: expression.elements.map(inferType) }
		case 'string-literal': return { kind: 'string-type', value: expression.value }
		case 'number-literal': return { kind: 'number-type', value: expression.value }
		case 'boolean-literal': return { kind: 'boolean-type', value: expression.value }
		case 'nil-literal': return { kind: 'nil-type' }
		case 'identifier': throw Error('TODO')
	}
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
					? typeExpression.entries.map(e =>
						({ key: resolveType(e.key), value: resolveType(e.value) }))
					: { key: resolveType(typeExpression.entries.key), value: resolveType(typeExpression.entries.value) }

			)
		}
		case 'array-type-expression': return {
			kind: 'array-type',
			elements: (
				Array.isArray(typeExpression.elements)
					? typeExpression.elements.map(resolveType)
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

export type SubsumationIssue = string

export const subsumationIssues = ({ to, from }: { to: Type, from: Type }): readonly SubsumationIssue[] => {
	const NO_ISSUES = [] as const

	switch (to.kind) {
		case 'union-type': return to.members.map(to => subsumationIssues({ to, from })).flat()
		case 'object-type': throw Error('TODO')
		case 'array-type': {
			if (from.kind !== 'array-type') {
				return [basicSubsumationIssueMessage({ to, from })]
			} else if (Array.isArray(to.elements)) {
				if (Array.isArray(from.elements)) {
					if (from.elements.length < to.elements.length) {
						return [`Array type ${displayType(from)} has fewer elements than destination array type ${displayType(to)}`]
					}

					const fromElements = from.elements
					return to.elements.map((to, i) => subsumationIssues({ to, from: fromElements[i]! })).flat()
				} else {
					return [basicSubsumationIssueMessage({ to, from })]
				}
			} else {
				if (Array.isArray(from.elements)) {
					const toElements = to.elements
					return from.elements.map(from => subsumationIssues({ to: toElements, from })).flat()
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
	}
}

const CANONICAL_TYPE_SYMBOL = Symbol('CANONICAL_TYPE_SYMBOL')
export type CanonicalType = Type// & { [CANONICAL_TYPE_SYMBOL]: undefined }

export const canonicalizeType = (type: Type): CanonicalType => {
	switch (type.kind) {
		case 'union-type': return {
			...type,
			members: type.members.map(canonicalizeType)
		} as CanonicalType
		case 'object-type': return {
			...type,
			elements: (
				Array.isArray(type.entries)
					? type.entries.map(({ key, value }) => ({ key: canonicalizeType(key), value: canonicalizeType(value) }))
					: { key: canonicalizeType(type.entries.key), value: canonicalizeType(type.entries.value) }
			)
		} as CanonicalType
		case 'array-type': return {
			...type,
			elements: (
				Array.isArray(type.elements)
					? type.elements.map(canonicalizeType)
					: canonicalizeType(type.elements)
			)
		} as CanonicalType
		case 'string-type':
		case 'number-type':
		case 'boolean-type':
		case 'nil-type':
		case 'unknown-type':
			return type as CanonicalType
	}
}

const basicSubsumationIssueMessage = ({ to, from }: { to: Type, from: Type }) => `Can't assign ${displayType(from)} into ${displayType(to)}`

export const displayType = (type: Type): string => {
	switch (type.kind) {
		case 'union-type': return type.members.map(displayType).join(' | ')
		case 'object-type': return `{ ${Array.isArray(type.entries) ? type.entries.map(({ key, value }) => `${displayType(key)}: ${displayType(value)}`).join(', ') : `{[${displayType(type.entries.key)}]: ${displayType(type.entries.value)}}`} }`
		case 'array-type': return Array.isArray(type.elements) ? `[${type.elements.map(displayType).join(', ')}]` : displayType(type.elements) + '[]'
		case 'string-type': return type.value != null ? `'${type.value}'` : 'string'
		case 'number-type': return type.value != null ? String(type.value) : 'number'
		case 'boolean-type': return type.value != null ? String(type.value) : 'boolean'
		case 'nil-type': return 'nil'
		case 'unknown-type': return 'unknown'
	}
}