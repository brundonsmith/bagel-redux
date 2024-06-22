import test from 'ava'
import { parseModule } from './parser'
import { CheckerError, check } from './checker'

const printExpectedErrors = true

function testCheck(code: string, expectError: boolean) {
	test(code, t => {
		const parseResult = parseModule({ code, index: 0 })
		if (parseResult?.kind !== 'success') {
			throw Error('Failed to parse code: ' + code)
		}

		const errors: CheckerError[] = []

		check({ error: err => errors.push(err) }, parseResult.parsed)

		if (expectError) {
			t.notDeepEqual(errors, [], 'Expected Bagel error, but received none')

			if (printExpectedErrors) {
				console.log('\nreceived expected error(s)\nCODE: ' + code + '\n' + errors.map(e => 'ERROR: ' + e.message).join('\n') + '\n')
			}
		} else {
			t.deepEqual(errors, [], 'Expected no Bagel errors, but received some')
		}
	})
}

testCheck('const x: number = 12', false)
testCheck('const x: number = \'hello world\'', true)
testCheck('const x: number = if true { 12 } else { \'foo\' }', false)
testCheck('const x: number = if false { 12 } else { \'foo\' }', true)