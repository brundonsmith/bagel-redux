import { profile } from './utils'

/**
 * The input to a given parse function
 */
export type ParseInput = {

	/**
	 * Entire original code string
	 */
	code: string,

	/**
	 * Current index within the code string
	 */
	index: number
}

/**
 * Source location in the original code string; useful for error output
 */
export type ParseSource = {

	/**
	 * Entire original code string
	 */
	code: string,

	/**
	 * Index in the code string where this entity starts
	 */
	start: number,

	/**
	 * Index in the code string where this entity ends
	 */
	end: number
}

/**
 * The outcome of a parse attempt. `undefined` means the expected thing wasn't
 * found, but nothing was necessarily malformed
 */
export type ParseResult<TParsed, TError = never> =
	| {
		kind: 'success',

		/**
		 * The remaining input after having parsed this
		 */
		input: ParseInput,

		/**
		 * The span of the source string occupied by this parsed value; useful when outputting AST nodes
		 */
		src: ParseSource,

		parsed: TParsed,
	}
	| {
		kind: 'error',

		/**
		 * The remaining input after having parsed this (for errors, should be the same as original input)
		 */
		input: ParseInput,

		error: TError
	}
	| undefined

/**
 * A function that takes an input and attempts to parse from the front of it
 */
export type Parser<TParsed, TError = never> = (input: ParseInput) => ParseResult<TParsed, TError>

/**
 * Given an array of Parsers, get the array of their TParsed types
 */
export type ParsedOf<TParsers extends Parser<unknown, unknown>[]> = {
	[Index in keyof TParsers]: TParsers[Index] extends Parser<infer TParsed, unknown> ? TParsed : never;
}

/**
 * Given an array of Parsers, get the array of their TError types
 */
export type ErrorsOf<TParsers extends Parser<unknown, unknown>[]> = {
	[Index in keyof TParsers]: TParsers[Index] extends Parser<unknown, infer TError> ? TError : never;
}

export const memo = <TArg, TReturn>(fn: (arg: TArg) => TReturn): (arg: TArg) => TReturn => {
	const outputs = new Map<TArg, TReturn>()

	return (arg: TArg): TReturn => {
		const cached = outputs.get(arg)

		if (cached) {
			return cached
		} else {
			const res = fn(arg)
			outputs.set(arg, res)
			return res
		}
	}
}

/**
 * Create an initial `ParseInput` from just a code string
 */
export const input = (code: string): ParseInput => ({ code, index: 0 })

/**
 * Don't progress input, return a successful parse of `undefined`
 */
export const nothing: Parser<undefined, never> = input => ({ kind: 'success', parsed: undefined, input, src: { code: input.code, start: input.index, end: input.index } })

/**
 * Parse an exact string
 */
export const exact = <T extends string>(str: T): Parser<T, never> => profile('exact', input => {
	if (input.code.substring(input.index).startsWith(str)) {
		const end = input.index + str.length
		return { kind: 'success', parsed: str, input: { ...input, index: end }, src: { code: input.code, start: input.index, end } }
	} else {
		return undefined
	}
})

export const endOfFile: Parser<undefined> = ({ code, index }) => {
	if (index === code.length) {
		return { kind: 'success', parsed: undefined, input: { code, index }, src: { code, start: index, end: index } }
	} else {
		return undefined
	}
}

/**
 * If parsed value doesn't match `pred`, convert it to a none-result
 */
export const filter = <TParsed, TError>(
	parser: Parser<TParsed, TError>,
	pred: (res: TParsed, input: ParseInput) => boolean
): Parser<TParsed, TError> => input => {
	const res = parser(input)

	if (res?.kind === 'success' && !pred(res.parsed, input)) {
		return undefined
	} else {
		return res
	}
}

/**
 * If parsed value, transform it using `fn`
 */
export const map = <TParsed, TError, TMapped>(
	parser: Parser<TParsed, TError>,
	fn: (res: TParsed, src: ParseSource) => TMapped
): Parser<TMapped, TError> => input => {
	const res = parser(input)

	if (res?.kind === 'success') {
		return { ...res, parsed: fn(res.parsed, res.src) }
	} else {
		return res
	}
}

export const subParser = <TParsed, TError>(
	parser: Parser<string, TError>,
	mapped: Parser<TParsed, TError>
): Parser<TParsed, TError> => input => {
	const res = parser(input)

	if (res?.kind === 'success') {
		const mappedRes = mapped({ code: res.parsed, index: 0 })

		if (mappedRes != null) {
			return { ...mappedRes, input: res.input, src: res.src }
		} else {
			return mappedRes
		}
	} else {
		return res
	}
}

/**
 * Require that the parser finds something and not nothing, erroring if nothing
 * is parsed. `error` callback is passed to generate error messages.
 */
export const required = <TParsed, TError1, TError2>(
	parser: Parser<TParsed, TError1>,
	error: (input: ParseInput) => TError2
): Parser<TParsed, TError1 | TError2> => profile('required(_)', input => {
	const res = parser(input)

	if (res == null) {
		return { kind: 'error', input, error: error(input) }
	} else {
		return res
	}
})

// --- Characters ---

/**
 * Parse a single (any) character, if the input is non-empty
 */
export const char: Parser<string, never> = input => (
	input.index >= 0 && input.index < input.code.length
		? {
			kind: 'success',
			parsed: input.code[input.index]!,
			input: { ...input, index: input.index + 1 },
			src: {
				code: input.code,
				start: input.index,
				end: input.index + 1
			}
		}
		: undefined
)

/**
 * Parse a single whitespace character
 */
export const whitespaceChar: Parser<string, never> = filter(char, ch => whitespaceRegex.test(ch))
export const whitespaceRegex = /[\s]/

/**
 * Parse a single numeric character
 */
export const numericChar: Parser<string, never> = filter(char, ch => numericRegex.test(ch))
export const numericRegex = /[0-9]/

/**
 * Parse a single alphabetic character
 */
export const alphaChar: Parser<string, never> = filter(char, ch => alphaRegex.test(ch))
export const alphaRegex = /[A-Za-z]/

// --- Combinators ---

/**
 * If `parser` doesn't find anything, succeed anyway with an `undefined` value
 */
export const optional = <TParsed, TError>(parser: Parser<TParsed, TError>): Parser<TParsed | undefined, TError> => input =>
	parser(input) ?? nothing(input)

/**
 * Try each parser in sequence and return the first successful or erroneous result
 */
export const oneOf = <TParsers extends Parser<unknown, unknown>[]>(...possibilities: TParsers): TParsers[number] => input => {
	for (const possibility of possibilities) {
		const res = possibility(input)

		if (res != null) {
			return res
		}
	}
}

/**
 * Parse a sequence of things, one after the other
 */
export const tuple = <
	TParsers extends Parser<unknown, unknown>[]
>(
	...pieces: TParsers
): Parser<ParsedOf<TParsers>, ErrorsOf<TParsers>[number]> => input => {
	let nextInput = input
	const items: unknown[] = []

	for (const piece of pieces) {
		const pieceResult = piece(nextInput)

		if (pieceResult?.kind === 'success') {
			nextInput = pieceResult.input
			items.push(pieceResult.parsed)
		} else {
			return pieceResult as ParseResult<ParsedOf<TParsers>, ErrorsOf<TParsers>[number]>
		}
	}

	return { kind: 'success', parsed: items as ParsedOf<TParsers>, input: nextInput, src: { code: input.code, start: input.index, end: nextInput.index } }
}

const manySep = (n: number) => <TParsed, TError1, TError2>(item: Parser<TParsed, TError1>, sep: Parser<unknown, TError2> | undefined): Parser<TParsed[], TError1 | TError2> => input => {
	let nextInputBeforeSep = input
	let nextInput = input
	const items: TParsed[] = []

	// eslint-disable-next-line no-constant-condition
	while (true) {
		nextInputBeforeSep = nextInput

		if (items.length > 0 && sep != null) {
			const sepResult = sep(nextInput)

			if (sepResult == null) {
				if (items.length < n) {
					return undefined
				} else {
					return { kind: 'success', parsed: items, input: nextInput, src: { code: input.code, start: input.index, end: nextInput.index } }
				}
			} else if (sepResult.kind === 'error') {
				return sepResult
			} else {
				nextInput = sepResult.input
				// do nothing, move on to item
			}
		}

		const itemResult = item(nextInput)

		if (itemResult == null) {
			if (items.length < n) {
				return undefined
			} else {
				return { kind: 'success', parsed: items, input: nextInputBeforeSep, src: { code: input.code, start: input.index, end: nextInputBeforeSep.index } }
			}
		} else if (itemResult.kind === 'error') {
			return itemResult
		} else {
			nextInput = itemResult.input
			items.push(itemResult.parsed)
		}
	}
}

/**
 * Parse 0 or more instances of `item`, separated by `sep` (if provided)
 * - Only `item`s are actually returned, not `sep`s
 * - Succeeds even if nothing is found
 */
export const manySep0 = manySep(0)

/**
 * Parse 1 or more instances of `item`, separated by `sep` (if provided)
 * - Only `item`s are actually returned, not `sep`s
 * - Returns `undefined` if no `item`s are found
 */
export const manySep1 = manySep(1)

export const manySep2 = manySep(2)

/**
 * Parse 0 or more instances of `item`. Succeeds even if nothing is found.
 */
export const many0 = <TParsed, TError>(item: Parser<TParsed, TError>): Parser<TParsed[], TError> => manySep0(item, undefined)

/**
 * Parse 1 or more instances of `item`. Returns `undefined` if no `item`s are found.
 */
export const many1 = <TParsed, TError>(item: Parser<TParsed, TError>): Parser<TParsed[], TError> => manySep1(item, undefined)

/**
 * Parse 0 or more characters, where `chParser` is a 1-character parser, returned as a single string
 */
const take = (n: number) => <TError>(parser: Parser<string, TError>): Parser<string, TError> => input => {
	let nextInput = input
	let res = ''

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const charResult = parser(nextInput)

		if (charResult == null) {
			if (res.length < n) {
				return undefined
			} else {
				return { kind: 'success', parsed: res, input: nextInput, src: { code: input.code, start: input.index, end: nextInput.index } }
			}
		} else if (charResult.kind === 'error') {
			return charResult
		} else {
			nextInput = charResult.input
			res += charResult.parsed
		}
	}
}

export const take0 = take(0)

/**
 * Parse 1 or more characters, where `chParser` is a 1-character parser, returned as a single string
 */
export const take1 = take(1)

export type Precedence<T> = (startingAfter?: T) => T

export const drop = (parser: Parser<unknown>) => map(parser, () => undefined)

/**
 * Any amount of whitespace (or none)
 */
export const whitespace: Parser<undefined> = profile('whitespace', drop(take0(whitespaceChar)))

export const backtrack = <TParsed, TBroken, TError>(inner: Parser<TParsed, TError>, rest: Parser<unknown, TError>, broken: (error: TError, src: ParseSource) => TBroken): Parser<TParsed | TBroken, TError> => input => {
	const result = inner(input)

	if (result?.kind === 'error') {
		return map(rest, (_, src): TBroken => broken(result.error, { code: input.code, start: input.index, end: src.end }))(result.input)
	} else {
		return result
	}
}

export const takeUntil = (terminator: string) => map(
	tuple(
		take0(filter(char, (_, { code, index }) => !code.substring(index).startsWith(terminator))),
		exact(terminator)
		// oneOf(exact(terminator), endOfFile)
	),
	([content, terminator]) => content + terminator
)