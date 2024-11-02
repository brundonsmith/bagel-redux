import { ParseSource, Parser, Precedence, alphaChar, backtrack, char, drop, exact, filter, input, many0, many1, manySep0, manySep1, manySep2, map, memo, numericChar, oneOf, optional, required, subParser, take0, take1, takeUntil, tuple, whitespace } from './parser-combinators'
import { ___memo } from './reactivity'
import { logE, profile, todo } from './utils'

export type ASTInfo = { src: ParseSource, parent?: AST, precedingComments?: Comment[], context?: 'expression' | 'type-expression' }

export type AST =
	| ModuleAST
	| Declaration
	| TypeExpression
	| KeyValue<TypeExpression>
	| Spread<TypeExpression>
	| Expression
	| KeyValue<Expression>
	| Spread<Expression>
	| Statement
	| ImportItem
	| SwitchCase<Expression>
	| SwitchCase<StatementBlock>
	| IfElseCase<Expression>
	| IfElseCase<StatementBlock>
	| NameAndType
	| GenericTypeParameter
	| StatementBlock
	| PlainIdentifier
	| Comment
	| MarkupKeyValue
	| BrokenSubtree

export type ModuleAST = {
	kind: 'module',
	declarations: Declaration[],
	endComments: Comment[]
} & ASTInfo

export type Declaration =
	| ImportDeclaration
	| TypeDeclaration
	| VariableDeclaration
	| BrokenSubtree

export type ImportDeclaration = { kind: 'import-declaration', uri: StringLiteral, imports: ImportItem[] } & ASTInfo
export type ImportItem = { kind: 'import-item', name: PlainIdentifier, alias: PlainIdentifier | undefined } & ASTInfo
export type TypeDeclaration = { kind: 'type-declaration', exported: boolean, name: PlainIdentifier, type: TypeExpression } & ASTInfo
export type VariableDeclaration = { kind: 'variable-declaration', exported: boolean, isConst: boolean, declared: NameAndType, value: Expression } & ASTInfo

export type TypeExpression =
	| GenericTypeExpression
	| ParameterizedTypeExpression
	| TypeofTypeExpression
	| FunctionTypeExpression
	| UnionTypeExpression
	| ParenthesisTypeExpression
	| ObjectLiteralTypeExpression
	| ArrayLiteralTypeExpression
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

export type GenericTypeExpression = { kind: 'generic-type-expression', inner: TypeExpression, params: GenericTypeParameter[] } & ASTInfo
export type GenericTypeParameter = { kind: 'generic-type-parameter', name: PlainIdentifier, extendz: TypeExpression | undefined } & ASTInfo
export type ParameterizedTypeExpression = { kind: 'parameterized-type-expression', inner: TypeExpression, params: TypeExpression[] } & ASTInfo
export type ParenthesisTypeExpression = { kind: 'parenthesis', inner: TypeExpression } & ASTInfo
export type ObjectLiteralTypeExpression = { kind: 'object-literal', entries: Array<({ kind: 'key-value', key: TypeExpression, value: TypeExpression } & ASTInfo) | ({ kind: 'spread', spread: TypeExpression } & ASTInfo) | LocalIdentifier> } & ASTInfo
export type ArrayLiteralTypeExpression = { kind: 'array-literal', elements: Array<TypeExpression | { kind: 'spread', spread: TypeExpression } & ASTInfo> } & ASTInfo
export type ArrayTypeExpression = { kind: 'array-type-expression', element: TypeExpression, length: TypeExpression | undefined } & ASTInfo
export type TypeofTypeExpression = { kind: 'typeof-type-expression', expression: Expression } & ASTInfo
export type FunctionTypeExpression = { kind: 'function-type-expression', purity: 'async' | 'pure' | undefined, params: TypeExpression[], returns: TypeExpression } & ASTInfo
export type UnionTypeExpression = { kind: 'union-type-expression', members: TypeExpression[] } & ASTInfo
export type StringTypeExpression = { kind: 'string-type-expression' } & ASTInfo
export type NumberTypeExpression = { kind: 'number-type-expression' } & ASTInfo
export type BooleanTypeExpression = { kind: 'boolean-type-expression' } & ASTInfo
export type UnknownTypeExpression = { kind: 'unknown-type-expression' } & ASTInfo

export type Expression =
	| MarkupExpression
	| PropertyAccessExpression
	| AsExpression
	| FunctionExpression
	| Invocation
	| BinaryOperationExpression
	| SwitchExpression
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

export type MarkupExpression = { kind: 'markup-expression', tag: PlainIdentifier, closingTag: PlainIdentifier, props: MarkupKeyValue[], children: Expression[] } & ASTInfo
export type MarkupKeyValue = { kind: 'markup-key-value', key: PlainIdentifier, value: Expression } & ASTInfo
export type ParenthesisExpression = { kind: 'parenthesis', inner: Expression } & ASTInfo
export type ObjectExpression = { kind: 'object-literal', entries: Array<({ kind: 'key-value', key: Expression, value: Expression } & ASTInfo) | ({ kind: 'spread', spread: Expression } & ASTInfo) | LocalIdentifier> } & ASTInfo
export type ArrayExpression = { kind: 'array-literal', elements: Array<Expression | { kind: 'spread', spread: Expression } & ASTInfo> } & ASTInfo
export type PropertyAccessExpression = { kind: 'property-access-expression', subject: Expression, property: Expression } & ASTInfo
export type AsExpression = { kind: 'as-expression', expression: Expression, type: TypeExpression } & ASTInfo
export type FunctionExpression = { kind: 'function-expression', purity: 'async' | 'pure' | undefined, params: NameAndType[], returnType: TypeExpression | undefined, body: Expression | StatementBlock } & ASTInfo
export type NameAndType = { kind: 'name-and-type', name: PlainIdentifier, type: TypeExpression | undefined } & ASTInfo
export type Invocation = { kind: 'invocation', subject: Expression, args: Expression[], awaitOrDetach: 'await' | 'detach' | undefined } & ASTInfo
export type BinaryOperationExpression = { kind: 'binary-operation-expression', left: Expression, op: BinaryOperator, right: Expression } & ASTInfo
export type BinaryOperator = '+' | '-' | '*' | '/' | '==' | '!=' | '<' | '>' | '<=' | '>=' | '&&' | '||' | '??'
export type SwitchExpression = { kind: 'switch', value: Expression, cases: SwitchExpressionCase[], defaultCase: Expression | undefined } & ASTInfo
export type SwitchExpressionCase = { kind: 'switch-case', condition: TypeExpression, outcome: Expression } & ASTInfo
export type IfElseExpression = { kind: 'if-else', cases: IfElseExpressionCase[], defaultCase: Expression | undefined } & ASTInfo
export type IfElseExpressionCase = { kind: 'if-else-case', condition: Expression, outcome: Expression } & ASTInfo
export type StringLiteral = { kind: 'string-literal', value: string } & ASTInfo
export type NumberLiteral = { kind: 'number-literal', value: number } & ASTInfo
export type BooleanLiteral = { kind: 'boolean-literal', value: boolean } & ASTInfo
export type NilLiteral = { kind: 'nil-literal' } & ASTInfo
export type LocalIdentifier = { kind: 'local-identifier', identifier: string } & ASTInfo
export type Range = { kind: 'range', start: NumberLiteral | undefined, end: NumberLiteral | undefined } & ASTInfo

export type Switch<T> = { kind: 'switch', value: Expression, cases: SwitchCase<T>[], defaultCase: T | undefined } & ASTInfo
export type SwitchCase<T> = { kind: 'switch-case', condition: TypeExpression, outcome: T } & ASTInfo
export type IfElse<T> = { kind: 'if-else', cases: IfElseCase<T>[], defaultCase: T | undefined } & ASTInfo
export type IfElseCase<T> = { kind: 'if-else-case', condition: Expression, outcome: T } & ASTInfo
export type Parenthesis<T> = { kind: 'parenthesis', inner: T } & ASTInfo
export type ObjectLiteral<T> = { kind: 'object-literal', entries: Array<KeyValue<T> | Spread<T> | LocalIdentifier> } & ASTInfo
export type ArrayLiteral<T> = { kind: 'array-literal', elements: Array<T | Spread<T>> } & ASTInfo
export type KeyValue<T> = { kind: 'key-value', key: T, value: T } & ASTInfo
export type Spread<T> = { kind: 'spread', spread: T } & ASTInfo

export type Statement =
	| Invocation
	| VariableDeclaration
	| AssignmentStatement
	| ReturnStatement
	| SwitchStatement
	| IfElseStatement
	| ForLoopStatement

export type AssignmentStatement = { kind: 'assignment-statement', target: LocalIdentifier | PropertyAccessExpression, value: Expression } & ASTInfo
export type ReturnStatement = { kind: 'return-statement', value: Expression } & ASTInfo
export type SwitchStatement = { kind: 'switch', value: Expression, cases: SwitchStatementCase[], defaultCase: StatementBlock | undefined } & ASTInfo
export type SwitchStatementCase = { kind: 'switch-case', condition: TypeExpression, outcome: StatementBlock } & ASTInfo
export type IfElseStatement = { kind: 'if-else', cases: IfElseStatementCase[], defaultCase: StatementBlock | undefined } & ASTInfo
export type IfElseStatementCase = { kind: 'if-else-case', condition: Expression, outcome: StatementBlock } & ASTInfo
export type ForLoopStatement = { kind: 'for-loop-statement', element: PlainIdentifier, iterable: Expression, body: StatementBlock } & ASTInfo

export type StatementBlock = { kind: 'statement-block', statements: Statement[] } & ASTInfo

export type PlainIdentifier = { kind: 'plain-identifier', identifier: string } & ASTInfo

export type Comment = { kind: 'comment', comment: string, commentType: 'line' | 'block' } & ASTInfo
export type BrokenSubtree = { kind: 'broken-subtree', error: string } & ASTInfo

type BagelParser<T> = Parser<T, string>

export const source = (src: ParseSource) => src.code.substring(src.start, src.end)

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
			profile(context + `(${i})`, memo(map(
				oneOf(...memoLevels.slice(i + 1)),
				parsed => ({ ...parsed, context })
			)))
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

const whitespaceNoLinebreak: Parser<undefined> = profile('whitespace', drop(take0(filter(char, ch => ch === ' ' || ch === '\t'))))

const whitespaceAndCommentsNoLinebreak: BagelParser<Comment[]> = map(
	tuple(
		whitespaceNoLinebreak,
		manySep0(
			oneOf(linesComment, blockComment),
			whitespaceNoLinebreak
		),
		whitespaceNoLinebreak
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
		whitespace,
		expect('import'),
		whitespace,
		expect('{'),
		manySep0(preceded(importItem), tuple(whitespace, exact(','))),
		whitespace,
		expect('}')
	),
	([_0, uri, _1, _2, _3, _4, imports, _5, _6], src) =>
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

const variableDeclaration: BagelParser<VariableDeclaration> = profile('constDeclaration', input => map(
	tuple(
		optionalKeyword('export '), // TODO: Forbid in statement context
		oneOf(
			exact('const '),
			exact('let ')
		),
		whitespace,
		required(nameAndType, () => 'Expected name'),
		whitespace,
		expect('='),
		whitespace,
		required(expression(), () => 'Expected value'),
	),
	([exported, keyword, _0, declared, _3, _4, _5, value], src) => ({
		kind: 'variable-declaration',
		exported,
		isConst: keyword === 'const ',
		declared,
		value,
		src
	} as const)
)(input))

const declaration: BagelParser<Declaration> = profile('declaration', oneOf(
	importDeclaration,
	typeDeclaration,
	variableDeclaration
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
		optional(
			oneOf(
				map(exact('pure '), () => 'pure' as const),
				map(exact('async '), () => 'async' as const),
			)
		),
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
	([purity, _0, _1, _2, params, _3, _4, _5, _6, _7, _8, _9, returns], src) => ({
		kind: 'function-type-expression',
		purity,
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

const arrayTypeExpression: BagelParser<ArrayTypeExpression> = input => map(
	tuple(
		typeExpression(arrayTypeExpression),
		exact('['),
		whitespace,
		optional(typeExpression(arrayTypeExpression)),
		whitespace,
		exact(']')
	),
	([element, _0, _1, length, _2, _3], src) => ({
		kind: 'array-type-expression',
		element,
		length,
		src
	} as const)
)(input)

// @ts-expect-error sdfjhg
const typeExpression: Precedence<BagelParser<TypeExpression>> = precedenceWithContext(
	'type-expression',
	genericTypeExpression,
	parameterizedTypeExpression,
	typeofTypeExpression,
	functionTypeExpression,
	unionTypeExpression,
	arrayTypeExpression,
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
		optional(
			oneOf(
				map(exact('pure '), () => 'pure' as const),
				map(exact('async '), () => 'async' as const),
			)
		),
		whitespace,
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
		oneOf(
			statementBlock,
			expression(),
		)
	),
	([purity, _4, params, _5, returnType, _6, _7, _8, body], src) => ({
		kind: 'function-expression',
		purity,
		params,
		returnType,
		body,
		src
	} as const)
)(input)

const statement: BagelParser<Statement> = input => oneOf(
	filter(propertyAccessInvocationChain, parsed => parsed.kind === 'invocation') as BagelParser<Invocation>,
	variableDeclaration,
	assignmentStatement,
	returnStatement,
	switchStatement,
	ifElseStatement,
	forLoopStatement
)(input)

const statementBlock: BagelParser<StatementBlock> = map(
	tuple(
		exact('{'),
		manySep1(
			preceded(statement),
			tuple(whitespaceAndCommentsNoLinebreak, exact('\n'))
		),
		whitespaceAndComments,
		exact('}'),
	),
	([_0, statements, _2, _3], src) => ({
		kind: 'statement-block',
		statements,
		src
	})
)

const assignmentStatement: BagelParser<AssignmentStatement> = input => map(
	tuple(
		oneOf(
			localIdentifier,
			filter(propertyAccessInvocationChain, p => p.kind === 'property-access-expression')
		),
		whitespace,
		exact('='),
		whitespace,
		expression()
	),
	([target, _0, _1, _2, value], src) => ({
		kind: 'assignment-statement' as const,
		target: target as PropertyAccessExpression,
		value,
		src
	})
)(input)

const returnStatement: BagelParser<ReturnStatement> = input => map(
	tuple(
		exact('return '),
		whitespace,
		expression()
	),
	([_0, _1, value], src) => ({
		kind: 'return-statement' as const,
		value,
		src
	})
)(input)

const switchStatement: BagelParser<Switch<StatementBlock>> = input => zwitch(statementBlock)(input)

const ifElseStatement: BagelParser<IfElse<StatementBlock>> = input => ifElse(statementBlock)(input)

const forLoopStatement: BagelParser<ForLoopStatement> = input => map(
	tuple(
		exact('for '),
		whitespace,
		plainIdentifier,
		exact(' '),
		whitespace,
		exact('of '),
		whitespace,
		expression(),
		whitespace,
		statementBlock
	),
	([_0, _1, element, _2, _3, _4, _5, iterable, _7, body], src) => ({
		kind: 'for-loop-statement' as const,
		element,
		iterable,
		body,
		src
	})
)(input)

const markupExpression: BagelParser<MarkupExpression> = input => map(
	tuple(
		exact('<'),
		plainIdentifier,
		whitespace,
		manySep0(
			map(
				tuple(
					plainIdentifier,
					exact('='),
					exact('{'),
					expression(),
					exact('}')
				),
				([key, _0, _1, value, _2], src) => ({ kind: 'markup-key-value' as const, key, value, src })
			),
			whitespace,
		),
		exact('>'),
		manySep0(
			oneOf(
				markupExpression,
				map(tuple(exact('{'), whitespace, expression(), whitespace, exact('}')), ([_0, _1, expression, _2, _3]) => expression)
			),
			whitespace
		),
		exact('</'),
		plainIdentifier,
		exact('>')
	),
	([_0, tag, _1, props, _2, children, _3, closingTag, _4], src) => ({
		kind: 'markup-expression',
		tag,
		closingTag,
		props,
		children,
		src
	} as const)
)(input)

const propertyAccessInvocationChain: BagelParser<Invocation | PropertyAccessExpression> = input => map(
	tuple(
		optional(
			map(
				tuple(
					oneOf(exact('await'), exact('detach')),
					whitespace
				),
				([keyword, _0]) => keyword
			)
		),
		expression(propertyAccessInvocationChain),
		many1(
			// @ts-expect-error dsfjkgh
			oneOf(
				map(
					tuple(
						exact('('),
						whitespace,
						manySep0(expression(), tuple(whitespace, exact(','), whitespace)), // TODO: spreads
						whitespace,
						optional(exact(',')),
						whitespace,
						exact(')')
					),
					([_0, _1, args, _2, _3, _4, _5], src) => ({
						kind: 'invocation',
						args,
						src
					} as const)
				),
				oneOf(
					preceded(map(
						tuple(exact('.'), required(plainIdentifier, () => 'Expected property name')),
						([_0, property], src) => ({
							kind: 'property-access',
							property,
							src
						} as const)
					)),
					preceded(map(
						tuple(exact('['), whitespace, required(expression(), () => 'Expected key'), whitespace, expect(']')),
						([_0, _1, property, _2, _3], src) => ({
							kind: 'property-access',
							property,
							src
						} as const)
					))
				)
			),
		)
	),
	([awaitOrDetach, subject, _applications], src) => {
		const applications = _applications as Array<{ kind: 'invocation', args: Expression[], src: ParseSource } | { kind: 'property-access', property: Expression | PlainIdentifier, src: ParseSource }>
		const applyToSubject = (subject: Expression, application: (typeof applications)[number]): Invocation | PropertyAccessExpression =>
			application.kind === 'invocation'
				? {
					kind: 'invocation',
					subject,
					args: application.args,
					awaitOrDetach: undefined,
					src: {
						code: application.src.code,
						start: subject.src.start,
						end: application.src.end
					}
				}
				: {
					kind: 'property-access-expression',
					subject,
					property:
						application.property.kind === 'plain-identifier'
							? { kind: 'string-literal', value: application.property.identifier, src: application.property.src }
							: application.property,
					src: {
						code: application.src.code,
						start: subject.src.start,
						end: application.src.end
					}
				}

		const [first, ...rest] = applications

		let current = applyToSubject(subject, first!)
		for (const next of rest) {
			current = applyToSubject(current, next)
		}
		current.src = src

		// HACK
		if (current.kind === 'invocation') {
			current.awaitOrDetach = awaitOrDetach
		}

		return current

	}
)(input)

const binaryOpPrecedence = (ops: BinaryOperator[]) => {
	const exactOps = oneOf(...ops.map(exact))
	const fn: BagelParser<BinaryOperationExpression> = input => map(
		tuple(
			expression(fn),
			many1(
				map(tuple(whitespace, exactOps, whitespace, expression(fn)), ([_0, op, _1, right]) => ({ op, right }))
			),
		),
		([_left, applied]) => {
			let left = _left

			for (const { op, right } of applied) {
				left = {
					kind: 'binary-operation-expression' as const,
					left,
					op,
					right,
					src: span(left.src, right.src)
				}
			}

			return left as BinaryOperationExpression
		}
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

const zwitch = <T extends Expression | StatementBlock>(inner: BagelParser<T>): BagelParser<Switch<T>> => input => map(
	tuple(
		exact('switch '),
		whitespace,
		expression(),
		whitespace,
		exact('{'),
		whitespace,
		manySep1(switchCase(inner), whitespace),
		whitespace,
		optional(
			map(
				tuple(
					exact('default:'),
					whitespace,
					inner
				),
				([_0, _1, outcome]) => outcome
			)
		),
		whitespace,
		exact('}')
	),
	([_0, _1, value, _3, _4, _5, cases, _6, defaultCase, _7, _8], src) => ({
		kind: 'switch' as const,
		value,
		cases,
		defaultCase,
		src
	} as const)
)(input)

const switchCase = <T extends Expression | StatementBlock>(inner: BagelParser<T>): BagelParser<SwitchCase<T>> => map(
	tuple(
		exact('case '), // at least one space
		preceded(typeExpression()),
		whitespace,
		exact(':'),
		whitespace,
		inner,
	),
	([_0, condition, _1, _2, _3, outcome], src) => ({
		kind: 'switch-case',
		condition,
		outcome,
		src
	} as const)
)

const switchExpression: BagelParser<Switch<Expression>> = input => zwitch(expression())(input)

const ifElse = <T extends Expression | StatementBlock>(inner: BagelParser<T>): BagelParser<IfElse<T>> => input => map(
	tuple(
		manySep1(ifCase(inner), tuple(whitespace, exact('else '), whitespace)),
		whitespace,
		optional(
			map(
				tuple(
					exact('else'),
					whitespace,
					inner
				),
				([_0, _1, outcome]) => outcome
			)
		)
	),
	([cases, _0, defaultCase], src) => ({
		kind: 'if-else' as const,
		cases,
		defaultCase,
		src
	} as const)
)(input)

const ifCase = <T extends Expression | StatementBlock>(inner: BagelParser<T>): BagelParser<IfElseCase<T>> => map(
	tuple(
		exact('if '), // at least one space
		preceded(expression()),
		whitespace,
		inner,
	),
	([_0, condition, _1, outcome], src) => ({
		kind: 'if-else-case',
		condition,
		outcome,
		src
	} as const)
)

const ifElseExpression: BagelParser<IfElse<Expression>> = input => ifElse(
	map(
		tuple(
			exact('{'),
			preceded(expression()),
			whitespace,
			exact('}')
		),
		([_0, outcome, _1, _2]) => outcome
	)
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
	markupExpression,
	asExpression,
	fallback,
	or,
	and,
	equals,
	ltgt,
	plusOrMinus,
	timesOrDiv,
	propertyAccessInvocationChain,
	switchExpression,
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

export const methodInvocationToInvocation = (ast: Invocation): Invocation => {
	if (ast.subject.kind !== 'property-access-expression' || ast.subject.property.kind !== 'string-literal') {
		return ast
	}

	const functionName = ast.subject.property.value

	return {
		...ast,
		subject: { ...ast.subject.property, kind: 'local-identifier', identifier: functionName },
		args: [ast.subject.subject, ...ast.args]
	}
}

export const span = (...s: ParseSource[]): ParseSource => {
	const [first, ...rest] = s
	if (first == null) throw Error('No sources passed to span()')

	const code = first.code
	let start = first.start
	let end = first.end

	for (const src of rest) {
		start = Math.min(start, src.start)
		end = Math.max(end, src.end)

		if (src.code !== code) {
			throw Error('Sources from different modules passed together to span()')
		}
	}

	return {
		code,
		start,
		end
	}
}