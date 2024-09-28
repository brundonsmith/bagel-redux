import test from 'ava'
import { expression } from './parser'
import { Type, inferType } from './types'

function testInferType(code: string, expectedType: Type) {
	test(code, t => {
		const parseResult = expression()({ code, index: 0 })
		if (parseResult?.kind !== 'success') {
			throw Error('Failed to parse code: ' + code)
		}

		const inferredType = inferType({ target: 'cross-platform', resolveModule: () => undefined }, parseResult.parsed)

		t.deepEqual(
			inferredType,
			expectedType
		)
	})
}

testInferType('nil', { kind: 'nil-type' })
testInferType('true', { kind: 'boolean-type', value: true })
testInferType('12', { kind: 'number-type', value: 12 })
testInferType('\'hello world\'', { kind: 'string-type', value: 'hello world' })
testInferType('[true, 12, nil]', {
	kind: 'array-type', elements: [
		{ kind: 'boolean-type', value: true },
		{ kind: 'number-type', value: 12 },
		{ kind: 'nil-type' }
	]
})
testInferType('{ a: true, b: 12, c: nil }', {
	kind: 'object-type', entries: [
		{
			kind: 'key-value-type',
			key: { kind: 'string-type', value: 'a' },
			value: { kind: 'boolean-type', value: true }
		},
		{
			kind: 'key-value-type',
			key: { kind: 'string-type', value: 'b' },
			value: { kind: 'number-type', value: 12 }
		},
		{
			kind: 'key-value-type',
			key: { kind: 'string-type', value: 'c' },
			value: { kind: 'nil-type' }
		}
	]
})