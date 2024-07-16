import { ParseSource, Parser, Precedence, alphaChar, backtrack, char, exact, filter, input, many0, many1, manySep0, manySep1, manySep2, map, memo, numericChar, oneOf, optional, required, subParser, take0, take1, takeUntil, tuple, whitespace } from './parser-combinators'
import { ___memo } from './reactivity'
import { logE, profile } from './utils'

export type ASTInfo = Readonly<{ src: ParseSource, parent?: AST, precedingComments?: Comment[], context?: 'expression' | 'type-expression' }>

export type AST =
	| ModuleAST
	| Declaration
	| TypeExpression
	| KeyValue<TypeExpression>
	| Spread<TypeExpression>
	| Expression
	| KeyValue<Expression>
	| Spread<Expression>
	| ImportItem
	| IfElseExpressionCase
	| NameAndType
	| GenericTypeParameter
	| PlainIdentifier
	| Comment
	| BrokenSubtree

export type ModuleAST = {
	kind: 'module',
	declarations: Declaration[],
	endComments: Comment[]
} & ASTInfo

export type Declaration =
	| ImportDeclaration
	| TypeDeclaration
	| ConstDeclaration
	| BrokenSubtree

export type ImportDeclaration = Readonly<{ kind: 'import-declaration', uri: StringLiteral, imports: ImportItem[] } & ASTInfo>
export type ImportItem = Readonly<{ kind: 'import-item', name: PlainIdentifier, alias: PlainIdentifier | undefined } & ASTInfo>
export type TypeDeclaration = Readonly<{ kind: 'type-declaration', exported: boolean, name: PlainIdentifier, type: TypeExpression } & ASTInfo>
export type ConstDeclaration = Readonly<{ kind: 'const-declaration', exported: boolean, declared: NameAndType, value: Expression } & ASTInfo>

export type TypeExpression =
	| GenericTypeExpression
	| ParameterizedTypeExpression
	| TypeofTypeExpression
	| FunctionTypeExpression
	| UnionTypeExpression
	| ParenthesisTypeExpression
	| ObjectTypeExpression
	| ArrayTypeExpression
	| StringTypeExpression
	| NumberTypeExpression
	| BooleanTypeExpression
	| Range
	| StringLiteral
	| NumberLiteral
	| BooleanLiteral
	| NilLiteral
	| LocalIdentifier
	| UnknownTypeExpression
	| BrokenSubtree

export type GenericTypeExpression = Readonly<{ kind: 'generic-type-expression', inner: TypeExpression, params: GenericTypeParameter[] } & ASTInfo>
export type GenericTypeParameter = Readonly<{ kind: 'generic-type-parameter', name: PlainIdentifier, extendz: TypeExpression | undefined } & ASTInfo>
export type ParameterizedTypeExpression = Readonly<{ kind: 'parameterized-type-expression', inner: TypeExpression, params: TypeExpression[] } & ASTInfo>
export type ParenthesisTypeExpression = Readonly<{ kind: 'parenthesis', inner: TypeExpression } & ASTInfo>
export type ObjectTypeExpression = Readonly<{ kind: 'object-literal', entries: Array<Readonly<{ kind: 'key-value', key: TypeExpression, value: TypeExpression } & ASTInfo> | Readonly<{ kind: 'spread', spread: TypeExpression } & ASTInfo> | LocalIdentifier> } & ASTInfo>
export type ArrayTypeExpression = Readonly<{ kind: 'array-literal', elements: Array<TypeExpression | Readonly<{ kind: 'spread', spread: TypeExpression } & ASTInfo>> } & ASTInfo>
export type TypeofTypeExpression = Readonly<{ kind: 'typeof-type-expression', expression: Expression } & ASTInfo>
export type FunctionTypeExpression = Readonly<{ kind: 'function-type-expression', pure: boolean, params: TypeExpression[], returns: TypeExpression } & ASTInfo>
export type UnionTypeExpression = Readonly<{ kind: 'union-type-expression', members: TypeExpression[] } & ASTInfo>
export type StringTypeExpression = Readonly<{ kind: 'string-type-expression' } & ASTInfo>
export type NumberTypeExpression = Readonly<{ kind: 'number-type-expression' } & ASTInfo>
export type BooleanTypeExpression = Readonly<{ kind: 'boolean-type-expression' } & ASTInfo>
export type UnknownTypeExpression = Readonly<{ kind: 'unknown-type-expression' } & ASTInfo>

export type Expression =
	| PropertyAccessExpression
	| AsExpression
	| FunctionExpression
	| Invocation
	| BinaryOperationExpression
	| IfElseExpression
	| ParenthesisExpression
	| ObjectExpression
	| ArrayExpression
	| StringLiteral
	| NumberLiteral
	| BooleanLiteral
	| NilLiteral
	| LocalIdentifier
	| BrokenSubtree

export type ParenthesisExpression = Readonly<{ kind: 'parenthesis', inner: Expression } & ASTInfo>
export type ObjectExpression = Readonly<{ kind: 'object-literal', entries: Array<Readonly<{ kind: 'key-value', key: Expression, value: Expression } & ASTInfo> | Readonly<{ kind: 'spread', spread: Expression } & ASTInfo> | LocalIdentifier> } & ASTInfo>
export type ArrayExpression = Readonly<{ kind: 'array-literal', elements: Array<Expression | Readonly<{ kind: 'spread', spread: Expression } & ASTInfo>> } & ASTInfo>
export type PropertyAccessExpression = Readonly<{ kind: 'property-access-expression', subject: Expression, property: Expression } & ASTInfo>
export type AsExpression = Readonly<{ kind: 'as-expression', expression: Expression, type: TypeExpression } & ASTInfo>
export type FunctionExpression = Readonly<{ kind: 'function-expression', pure: boolean, params: NameAndType[], returnType: TypeExpression | undefined, body: Expression } & ASTInfo>
export type NameAndType = Readonly<{ kind: 'name-and-type', name: PlainIdentifier, type: TypeExpression | undefined } & ASTInfo>
export type Invocation = Readonly<{ kind: 'invocation', subject: Expression, args: Expression[] } & ASTInfo>
export type BinaryOperationExpression = Readonly<{ kind: 'binary-operation-expression', left: Expression, op: BinaryOperator, right: Expression } & ASTInfo>
export type BinaryOperator = '+' | '-' | '*' | '/' | '==' | '!=' | '<' | '>' | '<=' | '>=' | '&&' | '||' | '??'
export type IfElseExpression = Readonly<{ kind: 'if-else-expression', cases: IfElseExpressionCase[], defaultCase: Expression | undefined } & ASTInfo>
export type IfElseExpressionCase = Readonly<{ kind: 'if-else-expression-case', condition: Expression, outcome: Expression } & ASTInfo>
export type StringLiteral = Readonly<{ kind: 'string-literal', value: string } & ASTInfo>
export type NumberLiteral = Readonly<{ kind: 'number-literal', value: number } & ASTInfo>
export type BooleanLiteral = Readonly<{ kind: 'boolean-literal', value: boolean } & ASTInfo>
export type NilLiteral = Readonly<{ kind: 'nil-literal' } & ASTInfo>
export type LocalIdentifier = Readonly<{ kind: 'local-identifier', identifier: string } & ASTInfo>
export type Range = Readonly<{ kind: 'range', start: NumberLiteral | undefined, end: NumberLiteral | undefined } & ASTInfo>

export type Parenthesis<T> = Readonly<{ kind: 'parenthesis', inner: T } & ASTInfo>
export type ObjectLiteral<T> = Readonly<{ kind: 'object-literal', entries: Array<KeyValue<T> | Spread<T> | LocalIdentifier> } & ASTInfo>
export type ArrayLiteral<T> = Readonly<{ kind: 'array-literal', elements: Array<T | Spread<T>> } & ASTInfo>
export type KeyValue<T> = Readonly<{ kind: 'key-value', key: T, value: T } & ASTInfo>
export type Spread<T> = Readonly<{ kind: 'spread', spread: T } & ASTInfo>

export type PlainIdentifier = Readonly<{ kind: 'plain-identifier', identifier: string } & ASTInfo>

export type Comment = Readonly<{ kind: 'comment', comment: string, commentType: 'line' | 'block' } & ASTInfo>
export type BrokenSubtree = Readonly<{ kind: 'broken-subtree', error: string } & ASTInfo>

type BagelParser<T> = Parser<T, string>

const precedenceWithContext = <TParsers extends Parser<ASTInfo, unknown>[]>(
	context: ASTInfo['context'],
	...levels: TParsers
): Precedence<TParsers[number]> => {
	const memoLevels = levels.map(memo)

	const all = profile(context + '(0)', memo(map(
		oneOf(...memoLevels),
		parsed => ({ ...parsed, context })
	)))
	const byLevel = new Map<TParsers[number], TParsers[number]>()
	for (let i = 0; i < levels.length; i++) {
		byLevel.set(
			levels[i]!,
			profile(context + `(${i})`, map(
				oneOf(...memoLevels.slice(i + 1)),
				parsed => ({ ...parsed, context })
			))
		)
	}

	return startingAfter =>
		startingAfter
			? byLevel.get(startingAfter)!
			: all
}

const linesComment: BagelParser<Comment> = profile('linesComment', map(
	manySep1(
		map(
			tuple(
				exact('//'),
				optional(exact(' ')), // ignore first space if present
				takeUntil('\n')
			),
			([_0, _1, content]) => content.substring(0, content.length - 1)
		),
		whitespace
	),
	(lines, src) => ({
		kind: 'comment' as const,
		comment: lines.join('\n'),
		commentType: 'line' as const,
		src
	})
))

const blockComment: BagelParser<Comment> = profile('blockComment', map(
	tuple(
		exact('/*'),
		subParser(
			takeUntil('*/'),
			map(
				tuple(
					optional(exact('*')),
					whitespace,
					manySep0(
						map(
							tuple(
								optional(exact('*')), // ignore star if present
								optional(exact(' ')), // ignore first space if present
								takeUntil('\n')
							),
							([_0, _1, content]) => content.substring(0, content.length - 1)
						),
						whitespace
					),
					whitespace,
				),
				([_0, _1, lines, _3]) => lines
			)
		)
	),
	([_0, lines], src) => ({
		kind: 'comment' as const,
		comment: lines.join('\n'),
		commentType: 'block' as const,
		src
	})
))

const whitespaceAndComments: BagelParser<Comment[]> = map(
	tuple(
		whitespace,
		manySep0(
			oneOf(linesComment, blockComment),
			whitespace
		),
		whitespace
	),
	([_0, comments, _1]) => comments
)

const preceded = <TParsed extends ASTInfo>(parser: BagelParser<TParsed>): BagelParser<TParsed> => map(
	tuple(
		whitespaceAndComments,
		parser
	),
	([precedingComments, parsed]) => ({
		...parsed,
		precedingComments
	})
)

const expect = (str: string) => profile(`expect(${str})`, required(exact(str), () => `Expected "${str}"`))

const identifierRegex = /[a-zA-Z0-9_]/
const identifier: BagelParser<string> = profile('identifier', map(
	tuple(
		alphaChar,
		take0(filter(char, ch => identifierRegex.test(ch)))
	),
	(_, src) => src.code.substring(src.start, src.end)
))

export const isValidIdentifier = (str: string | undefined) => str && identifier(input(str))?.input.index === str.length

const localIdentifier: BagelParser<LocalIdentifier> = map(
	identifier,
	(parsed, src) => ({
		kind: 'local-identifier',
		identifier: parsed,
		src
	} as const)
)

const plainIdentifier: BagelParser<PlainIdentifier> = profile('plainIdentifier', map(
	identifier,
	(parsed, src) => ({
		kind: 'plain-identifier',
		identifier: parsed,
		src
	} as const)
))

const string = backtrack(
	map(
		tuple(
			exact('\''),
			take0(filter(char, ch => ch !== '\'')),
			expect('\'')
		),
		([_0, contents, _1]) => contents
	),
	takeUntil('\''),
	(error, src) => ({ kind: 'broken-subtree', error, src } as const)
)
const number = take1(numericChar)
const boolean = oneOf(
	exact('true'),
	exact('false')
)
const nil = exact('nil')

const optionalKeyword = (keyword: string) => profile('optionalKeyword', map(
	optional(tuple(exact(keyword), whitespace)),
	keyword => keyword != null
))

export const parseModule: BagelParser<ModuleAST> = profile('parseModule', input => {
	const parsed = map(
		tuple(
			whitespace,
			many0(preceded(declaration)),
			whitespaceAndComments
		),
		([_0, declarations, endComments], src) => {
			const module = {
				kind: 'module',
				declarations,
				endComments,
				src
			} as const

			parentChildren(module)

			return module
		}
	)(input)

	if (parsed?.kind === 'success' && parsed.input.index < parsed.input.code.length) {
		console.log('Failed to consume entire module source at index ' + parsed.input.index)
		return {
			kind: 'error',
			error: 'Failed to consume entire module source at index ' + parsed.input.index,
			input: parsed.input
		}
	} else {
		return parsed
	}
})

const importItem: BagelParser<ImportItem> = map(
	tuple(
		plainIdentifier,
		optional(
			map(
				tuple(
					exact(' '),
					whitespace,
					exact('as'),
					exact(' '),
					whitespace,
					plainIdentifier
				),
				([_0, _1, _2, _3, _4, alias]) => alias
			))
	),
	([name, alias], src) => ({
		kind: 'import-item' as const,
		name,
		alias,
		src
	})
)

const stringLiteral: BagelParser<StringLiteral | BrokenSubtree> = map(
	string,
	(value, src) =>
		typeof value === 'string'
			? {
				kind: 'string-literal',
				value,
				src
			} as const
			: value
)

const importDeclaration: BagelParser<ImportDeclaration | BrokenSubtree> = profile('importDeclaration', map(
	tuple(
		exact('from'),
		preceded(stringLiteral),
		expect('import'),
		expect('{'),
		manySep0(preceded(importItem), tuple(whitespace, exact(','))),
		expect('}')
	),
	([_0, uri, _1, _2, imports, _3], src) =>
		uri.kind === 'string-literal'
			? {
				kind: 'import-declaration' as const,
				uri,
				imports,
				src
			}
			: uri
))

const typeDeclaration: BagelParser<TypeDeclaration> = profile('typeDeclaration', input => map(
	tuple(
		optionalKeyword('export '),
		exact('type '),
		whitespace,
		required(plainIdentifier, () => 'Expected name'),
		whitespace,
		expect('='),
		whitespace,
		required(typeExpression(), () => 'Expected type'),
	),
	([exported, _0, _1, name, _2, _3, _4, type], src) => ({
		kind: 'type-declaration' as const,
		exported,
		name,
		type,
		src
	})
)(input))

const constDeclaration: BagelParser<ConstDeclaration> = profile('constDeclaration', input => map(
	tuple(
		optionalKeyword('export '),
		exact('const '),
		whitespace,
		required(nameAndType, () => 'Expected name'),
		whitespace,
		expect('='),
		whitespace,
		required(expression(), () => 'Expected value'),
	),
	([exported, _0, _1, declared, _3, _4, _5, value], src) => ({
		kind: 'const-declaration',
		exported,
		declared,
		value,
		src
	} as const)
)(input))

const declaration: BagelParser<Declaration> = profile('declaration', oneOf(
	importDeclaration,
	typeDeclaration,
	constDeclaration
))

const nameAndType: BagelParser<NameAndType> = profile('nameAndType', input => map(
	tuple(
		plainIdentifier,
		whitespace,
		optional(
			map(
				tuple(
					exact(':'),
					whitespace,
					required(typeExpression(), () => 'Expected type')
				),
				([_0, _1, type]) => type
			)
		),
	),
	([name, _0, type], src) => ({
		kind: 'name-and-type',
		name,
		type,
		src
	} as const)
)(input))

const genericTypeExpression: BagelParser<GenericTypeExpression | BrokenSubtree> = input => backtrack(
	map(
		tuple(
			exact('<'),
			whitespace,
			manySep0(genericTypeParameter, tuple(whitespace, exact(','), whitespace)), // TODO: spreads
			whitespace,
			optional(exact(',')),
			whitespace,
			expect('>'),
			whitespace,
			typeExpression()
		),
		([_0, _1, params, _2, _3, _4, _5, _6, inner], src) => ({
			kind: 'generic-type-expression' as const,
			inner,
			params,
			src
		})
	),
	takeUntil('>'),
	(error, src) => ({ kind: 'broken-subtree', error, src } as const)
)(input)

const genericTypeParameter: BagelParser<GenericTypeParameter> = input => map(
	tuple(
		plainIdentifier,
		whitespace,
		optional(map(
			tuple(
				exact('extends'),
				whitespace,
				typeExpression()
			),
			([_0, _1, extendz]) => extendz
		))
	),
	([name, _0, extendz], src) => ({
		kind: 'generic-type-parameter' as const,
		name,
		extendz,
		src
	})
)(input)

const parameterizedTypeExpression: BagelParser<ParameterizedTypeExpression | BrokenSubtree> = input => backtrack(
	map(
		tuple(
			typeExpression(parameterizedTypeExpression),
			whitespace,
			exact('<'),
			whitespace,
			manySep0(typeExpression(), tuple(whitespace, exact(','), whitespace)), // TODO: spreads
			whitespace,
			optional(exact(',')),
			whitespace,
			expect('>'),
		),
		([inner, _0, _1, _2, params, _3, _4, _5, _6], src) => ({
			kind: 'parameterized-type-expression' as const,
			inner,
			params,
			src
		})
	),
	takeUntil('>'),
	(error, src) => ({ kind: 'broken-subtree', error, src } as const)
)(input)

const typeofTypeExpression: BagelParser<TypeofTypeExpression> = input => map(
	tuple(
		exact('typeof'),
		whitespace,
		expression()
	),
	([_0, _1, expression], src) => ({
		kind: 'typeof-type-expression',
		expression,
		src
	} as const)
)(input)

const functionTypeExpression: BagelParser<FunctionTypeExpression> = input => map(
	tuple(
		optionalKeyword('pure'),
		whitespace,
		exact('('),
		whitespace,
		manySep0(typeExpression(), tuple(whitespace, exact(','), whitespace)),
		whitespace,
		optional(exact(',')),
		whitespace,
		exact(')'),
		whitespace,
		exact('=>'),
		whitespace,
		typeExpression()
	),
	([pure, _0, _1, _2, params, _3, _4, _5, _6, _7, _8, _9, returns], src) => ({
		kind: 'function-type-expression',
		pure,
		params,
		returns,
		src
	} as const)
)(input)

const unionTypeExpression: BagelParser<UnionTypeExpression> = input => map(
	tuple(
		optional(exact('|')),
		whitespace,
		manySep2(typeExpression(unionTypeExpression), tuple(whitespace, exact('|'), whitespace))
	),
	([_0, _1, members], src) => ({
		kind: 'union-type-expression',
		members,
		src
	} as const)
)(input)

const keyValue = <T extends TypeExpression | Expression>(inner: BagelParser<T>): BagelParser<KeyValue<T>> => map(
	tuple(
		oneOf(plainIdentifier, inner),
		whitespace,
		exact(':'),
		whitespace,
		required(inner, () => 'Expected value')
	),
	([key, _0, _1, _2, value], src) => ({
		kind: 'key-value',
		key: (
			key.kind === 'plain-identifier'
				? { kind: 'string-literal' as const, value: key.identifier, src: key.src } as T
				: key
		),
		value,
		src
	} as const)
)

const parenthesis = <T>(inner: BagelParser<T>): BagelParser<Parenthesis<T> | BrokenSubtree> => backtrack(
	map(
		tuple(
			exact('('),
			whitespace,
			inner,
			whitespace,
			expect(')')
		),
		([_0, _1, inner, _2, _3], src) => ({
			kind: 'parenthesis',
			inner,
			src
		})
	),
	takeUntil(')'),
	(error, src) => ({ kind: 'broken-subtree', error, src })
)

const objectLiteral = <T extends TypeExpression | Expression>(inner: BagelParser<T>): BagelParser<ObjectLiteral<T> | BrokenSubtree> => backtrack(
	map(
		tuple(
			exact('{'),
			whitespace,
			manySep0<KeyValue<T> | Spread<T> | LocalIdentifier, string, string>(
				oneOf(preceded(spread(inner)), preceded(keyValue(inner)), preceded(localIdentifier)),
				tuple(whitespace, exact(','), whitespace)
			),
			whitespace,
			optional(exact(',')),
			whitespace,
			expect('}')
			// TODO: {[key]: value}
		),
		([_0, _1, entries, _2, _3], src) => ({
			kind: 'object-literal',
			entries,
			src
		}),
	),
	takeUntil('}'),
	(error, src) => ({ kind: 'broken-subtree', error, src })
)

const arrayLiteral = <T extends TypeExpression | Expression>(inner: BagelParser<T>): BagelParser<ArrayLiteral<T> | BrokenSubtree> => backtrack(
	map(
		tuple(
			exact('['),
			manySep0<T | Spread<T>, string, string>(oneOf(preceded(spread(inner)), preceded(inner)), tuple(whitespace, exact(','))),
			whitespace,
			optional(exact(',')),
			whitespace,
			expect(']')
		),
		([_0, elements, _1, _2], src) => ({
			kind: 'array-literal',
			elements,
			src
		} as const)
	),
	takeUntil(']'),
	(error, src) => ({ kind: 'broken-subtree', error, src })
)

const numberLiteral: BagelParser<NumberLiteral> = map(
	number,
	(parsed, src) => ({
		kind: 'number-literal',
		value: Number(parsed),
		src
	} as const)
)

const booleanLiteral: BagelParser<BooleanLiteral> = map(
	boolean,
	(parsed, src) => ({
		kind: 'boolean-literal',
		value: parsed === 'true',
		src
	} as const)
)

const nilLiteral: BagelParser<NilLiteral> = map(
	nil,
	(_, src) => ({
		kind: 'nil-literal',
		src
	} as const)
)

const range: BagelParser<Range> = map(
	filter(
		tuple(
			optional(numberLiteral),
			exact('..'),
			optional(numberLiteral)
		),
		([start, _0, end]) => start != null || end != null
	),
	([start, _0, end], src) => ({
		kind: 'range',
		start,
		end,
		src
	})
)

const stringTypeExpression: BagelParser<StringTypeExpression> = map(
	exact('string'),
	(_0, src) => ({
		kind: 'string-type-expression',
		src
	} as const)
)

const numberTypeExpression: BagelParser<NumberTypeExpression> = map(
	exact('number'),
	(_0, src) => ({
		kind: 'number-type-expression',
		src
	} as const)
)

const booleanTypeExpression: BagelParser<BooleanTypeExpression> = map(
	exact('boolean'),
	(_0, src) => ({
		kind: 'boolean-type-expression',
		src
	} as const)
)

const unknownTypeExpression: BagelParser<UnknownTypeExpression> = map(
	exact('unknown'),
	(_0, src) => ({
		kind: 'unknown-type-expression',
		src
	})
)

// @ts-expect-error dfsgdsgh
const parenthesisTypeExpression = input => parenthesis(typeExpression())(input)
// @ts-expect-error dfsgdsgh
const objectLiteralTypeExpression = input => objectLiteral(typeExpression())(input)
// @ts-expect-error dfsgdsgh
const arrayLiteralTypeExpression = input => arrayLiteral(typeExpression())(input)

// @ts-expect-error sdfjhg
const typeExpression: Precedence<BagelParser<TypeExpression>> = precedenceWithContext(
	'type-expression',
	genericTypeExpression,
	parameterizedTypeExpression,
	typeofTypeExpression,
	functionTypeExpression,
	unionTypeExpression,
	parenthesisTypeExpression,
	objectLiteralTypeExpression,
	arrayLiteralTypeExpression,
	stringTypeExpression,
	numberTypeExpression,
	booleanTypeExpression,
	unknownTypeExpression,
	range,
	stringLiteral,
	numberLiteral,
	booleanLiteral,
	nilLiteral,
	localIdentifier,
)

const propertyAccessExpression: BagelParser<PropertyAccessExpression> = input => map(
	tuple(
		expression(propertyAccessExpression),
		many1(
			oneOf(
				preceded(map(tuple(exact('.'), required(plainIdentifier, () => 'Expected property name')), ([_0, property]) => ({
					kind: 'string-literal' as const,
					value: property.identifier,
					src: property.src
				}))),
				preceded(map(tuple(exact('['), whitespace, required(expression(), () => 'Expected key'), whitespace, expect(']')), ([_0, _1, expression, _2, _3]) => expression))
			)
		),
	),
	([subject, [firstProperty, ...rest]], src) => {
		let current = {
			kind: 'property-access-expression' as const,
			subject,
			property: firstProperty!,
			src
		}

		for (const property of rest) {
			current = {
				kind: 'property-access-expression' as const,
				subject: current,
				property,
				src: {
					...property.src,
					start: property.src.start - 1 // HACK
				}
			}
		}

		return current
	}
)(input)

const asExpression: BagelParser<AsExpression> = input => map(
	tuple(
		expression(asExpression),
		whitespace,
		exact('as'),
		whitespace,
		required(typeExpression(), () => 'Expected type')
	),
	([expression, _0, _1, _2, type], src) => ({
		kind: 'as-expression',
		expression,
		type,
		src
	} as const)
)(input)

const functionExpression: BagelParser<FunctionExpression> = input => map(
	tuple(
		optionalKeyword('pure'),
		oneOf(
			map(plainIdentifier, (name, src) => [{ kind: 'name-and-type' as const, name, type: undefined, src }]),
			map(
				tuple(
					exact('('),
					whitespace,
					manySep0(nameAndType, tuple(whitespace, exact(','), whitespace)),
					whitespace,
					optional(exact(',')),
					whitespace,
					exact(')'),
				),
				([_0, _1, params, _2, _3]) => params
			)
		),
		whitespace,
		optional(
			map(
				tuple(exact(':'), whitespace, typeExpression()),
				([_0, _1, returnType]) => returnType
			)
		),
		whitespace,
		exact('=>'),
		whitespace,
		expression()
	),
	([pure, params, _5, returnType, _6, _7, _8, body], src) => ({
		kind: 'function-expression' as const,
		pure,
		params,
		returnType,
		body,
		src
	} as const)
)(input)

const invocation: BagelParser<Invocation> = input => map(
	tuple(
		expression(invocation),
		exact('('),
		whitespace,
		manySep0(expression(), tuple(whitespace, exact(','), whitespace)), // TODO: spreads
		whitespace,
		optional(exact(',')),
		whitespace,
		exact(')')
	),
	([subject, _0, _1, args, _2, _3], src) => ({
		kind: 'invocation',
		subject,
		args,
		src
	} as const)
)(input)

const binaryOpPrecedence = (ops: BinaryOperator[]) => {
	const exactOps = oneOf(...ops.map(exact))
	const fn: BagelParser<BinaryOperationExpression> = input => map(
		tuple(expression(fn), whitespace, exactOps, whitespace, expression(fn)),
		([left, _0, op, _1, right], src) => ({
			kind: 'binary-operation-expression',
			left,
			op,
			right,
			src
		} as const)
	)(input)

	return fn
}

const fallback = binaryOpPrecedence(['??'])
const or = binaryOpPrecedence(['||'])
const and = binaryOpPrecedence(['&&'])
const equals = binaryOpPrecedence(['==', '!='])
const ltgt = binaryOpPrecedence(['<=', '>=', '<', '>'])
const plusOrMinus = binaryOpPrecedence(['+', '-'])
const timesOrDiv = binaryOpPrecedence(['*', '/'])

const ifElseExpression: BagelParser<IfElseExpression> = input => map(
	tuple(
		manySep1(ifCase, tuple(whitespace, exact('else '), whitespace)),
		whitespace,
		optional(
			map(
				tuple(
					exact('else'),
					whitespace,
					exact('{'),
					whitespace,
					expression(),
					whitespace,
					exact('}')
				),
				([_0, _1, _2, _3, outcome, _4, _5]) => outcome
			)
		)
	),
	([cases, _0, defaultCase], src) => ({
		kind: 'if-else-expression',
		cases,
		defaultCase,
		src
	} as const)
)(input)

const ifCase: BagelParser<IfElseExpressionCase> = input => map(
	tuple(
		exact('if '), // at least one space
		whitespace,
		expression(),
		whitespace,
		exact('{'),
		whitespace,
		expression(),
		whitespace,
		exact('}'),
	),
	([_0, _1, condition, _2, _3, _4, outcome, _5, _6], src) => ({
		kind: 'if-else-expression-case',
		condition,
		outcome,
		src
	} as const)
)(input)

const spread = <T>(inner: BagelParser<T>): BagelParser<Spread<T>> => map(
	tuple(
		exact('...'),
		required(inner, () => 'Expected spread expression')
	),
	([_0, spread], src) => ({
		kind: 'spread',
		spread,
		src
	} as const)
)

// @ts-expect-error dfsgdsgh
const parenthesisExpression = input => parenthesis(expression())(input)
// @ts-expect-error dfsgdsgh
const objectLiteralExpression = input => objectLiteral(expression())(input)
// @ts-expect-error dfsgdsgh
const arrayLiteralExpression = input => arrayLiteral(expression())(input)

// @ts-expect-error sdfjhg
export const expression: Precedence<BagelParser<Expression>> = precedenceWithContext(
	'expression',
	asExpression,
	invocation,
	fallback,
	or,
	and,
	equals,
	ltgt,
	plusOrMinus,
	timesOrDiv,
	propertyAccessExpression,
	ifElseExpression,
	functionExpression,
	parenthesisExpression,
	objectLiteralExpression,
	arrayLiteralExpression,
	stringLiteral,
	numberLiteral,
	booleanLiteral,
	nilLiteral,
	localIdentifier,
)

const parentChildren = (ast: AST) => {
	for (const key in ast as any) {
		// @ts-expect-error sdfgsdfg
		const value = ast[key as any] as any

		if (key !== 'parent' && value != null && typeof value === 'object') {
			if (Array.isArray(value)) {
				for (const el of value) {
					el.parent = ast
					parentChildren(el)
				}
			} else {
				value.parent = ast
				parentChildren(value)
			}
		}
	}
}
