import test from 'ava'
import { AST, expression } from './parser'
import { Parser } from './parser-combinators'

function testCompleteParse<T extends AST>(fn: Parser<T, unknown>, code: string, parsed: T) {
  test(code, t => {
    const result = fn({ code, index: 0 })

    if (result?.kind === 'success') {
      stripParents(result.parsed)
    }

    t.deepEqual(
      result,
      {
        kind: 'success',
        parsed,
        input: { code, index: code.length },
        src: src(code)
      }
    )
  })
}

const src = (code: string) => ({ code, start: 0, end: code.length })

testCompleteParse(expression(), 'a', { kind: 'local-identifier', identifier: 'a', src: src('a') })
testCompleteParse(expression(), 'nil', { kind: 'nil-literal', src: src('nil') })
testCompleteParse(expression(), 'false', { kind: 'boolean-literal', value: false, src: src('false') })
testCompleteParse(expression(), 'true', { kind: 'boolean-literal', value: true, src: src('true') })
testCompleteParse(expression(), '12345', { kind: 'number-literal', value: 12345, src: src('12345') })
testCompleteParse(expression(), '\'hello world\'', { kind: 'string-literal', value: 'hello world', src: src('\'hello world\'') })
testCompleteParse(expression(), '[true,\n// foo\n 12, nil]', {
  kind: 'array-literal',
  elements: [
    { kind: 'boolean-literal', value: true, src: { code: '[true,\n// foo\n 12, nil]', start: 1, end: 5 }, precedingComments: [] },
    {
      kind: 'number-literal', value: 12, src: { code: '[true,\n// foo\n 12, nil]', start: 15, end: 17 }, precedingComments: [
        {
          kind: 'comment',
          comment: 'foo',
          commentType: 'line',
          src: { code: '[true,\n// foo\n 12, nil]', end: 14, start: 7, },
        },
      ],
    },
    { kind: 'nil-literal', src: { code: '[true,\n// foo\n 12, nil]', start: 19, end: 22 }, precedingComments: [] }
  ],
  src: src('[true,\n// foo\n 12, nil]')
})
testCompleteParse(expression(), '{ a: true, b: 12, c: nil }', {
  kind: 'object-literal',
  entries: [
    {
      kind: 'key-value',
      key: { kind: 'string-literal', value: 'a', src: { code: '{ a: true, b: 12, c: nil }', start: 2, end: 3 } },
      value: { kind: 'boolean-literal', value: true, src: { code: '{ a: true, b: 12, c: nil }', start: 5, end: 9 } },
      src: { code: '{ a: true, b: 12, c: nil }', start: 2, end: 9 }
    },
    {
      kind: 'key-value',
      key: { kind: 'string-literal', value: 'b', src: { code: '{ a: true, b: 12, c: nil }', start: 11, end: 12 } },
      value: { kind: 'number-literal', value: 12, src: { code: '{ a: true, b: 12, c: nil }', start: 14, end: 16 } },
      src: { code: '{ a: true, b: 12, c: nil }', start: 11, end: 16 }
    },
    {
      kind: 'key-value',
      key: { kind: 'string-literal', value: 'c', src: { code: '{ a: true, b: 12, c: nil }', start: 18, end: 19 } },
      value: { kind: 'nil-literal', src: { code: '{ a: true, b: 12, c: nil }', start: 21, end: 24 } },
      src: { code: '{ a: true, b: 12, c: nil }', start: 18, end: 24 }
    }
  ],
  src: src('{ a: true, b: 12, c: nil }')
})

function stripParents(ast: AST) {
  for (const key in ast as any) {
    // @ts-expect-error sdfgsdfg
    const value = ast[key as any] as any

    if (value != null && typeof value === 'object') {
      if (Array.isArray(value)) {
        for (const el of value) {
          delete el.parent
          stripParents(el)
        }
      } else {
        delete value.parent
        stripParents(value)
      }
    }
  }
}
