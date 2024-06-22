import { ParseSource, Parser, alphaChar, char, exact, filter, input, many0, many1, manySep0, manySep1, manySep2, map, numericChar, oneOf, optional, precedence, required, take0, take1, tuple, whitespace } from './parser-combinators'

export type ASTInfo = { src: ParseSource, parent?: AST }

export type AST =
	| Module
	| Declaration
	| TypeExpression
	| KeyValueTypeExpression
	| SpreadTypeExpression
	| Expression
	| KeyValueExpression
	| SpreadExpression
	| IfElseExpressionCase

export type Module = {
	kind: 'module',
	declarations: Declaration[]
} & ASTInfo

export type Declaration =
	| ConstDeclaration

export type ConstDeclaration = { kind: 'const-declaration', name: Identifier, type: TypeExpression | undefined, value: Expression } & ASTInfo

export type TypeExpression =
	| UnionTypeExpression
	| ObjectTypeExpression
	| ArrayTypeExpression
	| StringTypeExpression
	| NumberTypeExpression
	| BooleanTypeExpression
	| NilTypeExpression
	| UnknownTypeExpression

export type UnionTypeExpression = { kind: 'union-type-expression', members: TypeExpression[] } & ASTInfo
export type ObjectTypeExpression = { kind: 'object-type-expression', entries: Array<KeyValueTypeExpression | SpreadTypeExpression> | KeyValueTypeExpression } & ASTInfo
export type KeyValueTypeExpression = { kind: 'key-value-type-expression', key: TypeExpression, value: TypeExpression } & ASTInfo
export type ArrayTypeExpression = { kind: 'array-type-expression', elements: Array<TypeExpression | SpreadTypeExpression> | TypeExpression } & ASTInfo
export type SpreadTypeExpression = { kind: 'spread-type-expression', spread: TypeExpression } & ASTInfo
export type StringTypeExpression = { kind: 'string-type-expression', value: string | undefined } & ASTInfo
export type NumberTypeExpression = { kind: 'number-type-expression', value: number | undefined } & ASTInfo
export type BooleanTypeExpression = { kind: 'boolean-type-expression', value: boolean | undefined } & ASTInfo
export type NilTypeExpression = { kind: 'nil-type-expression' } & ASTInfo
export type UnknownTypeExpression = { kind: 'unknown-type-expression' } & ASTInfo

export type Expression =
	| BinaryOperationExpression
	| IfElseExpression
	| ObjectLiteral
	| ArrayLiteral
	| StringLiteral
	| NumberLiteral
	| BooleanLiteral
	| NilLiteral
	| Identifier

export type BinaryOperationExpression = { kind: 'binary-operation-expression', left: Expression, op: '+' | '-' | '*' | '/', right: Expression } & ASTInfo
export type IfElseExpression = { kind: 'if-else-expression', cases: IfElseExpressionCase[], defaultCase: Expression | undefined } & ASTInfo
export type IfElseExpressionCase = { kind: 'if-else-expression-case', condition: Expression, outcome: Expression } & ASTInfo
export type ObjectLiteral = { kind: 'object-literal', entries: Array<KeyValueExpression | SpreadExpression> } & ASTInfo
export type KeyValueExpression = { kind: 'key-value-expression', key: StringLiteral, value: Expression } & ASTInfo
export type ArrayLiteral = { kind: 'array-literal', elements: Array<Expression | SpreadExpression> } & ASTInfo
export type SpreadExpression = { kind: 'spread-expression', spread: Expression } & ASTInfo
export type StringLiteral = { kind: 'string-literal', value: string } & ASTInfo
export type NumberLiteral = { kind: 'number-literal', value: number } & ASTInfo
export type BooleanLiteral = { kind: 'boolean-literal', value: boolean } & ASTInfo
export type NilLiteral = { kind: 'nil-literal' } & ASTInfo
export type Identifier = { kind: 'identifier', identifier: string } & ASTInfo

type BagelParseError = string

const string = map(
	tuple(
		exact('\''),
		take0(filter(char, ch => ch !== '\'')),
		exact('\''),
	),
	([_0, contents, _1]) => contents
)
const number = take1(numericChar)
const boolean = oneOf(
	exact('true'),
	exact('false')
)
const nil = exact('nil')

export const parseModule: Parser<Module, BagelParseError> = input => map(
	tuple(whitespace, manySep0(declaration, whitespace), whitespace),
	([_0, declarations, _1], src) => {
		const module = {
			kind: 'module',
			declarations,
			src
		} as const

		parentChildren(module)

		return module
	}
)(input)

export const declaration: Parser<Declaration, BagelParseError> = input => oneOf(
	constDeclaration
)(input)

export const constDeclaration: Parser<ConstDeclaration, BagelParseError> = input => map(
	tuple(
		exact('const'),
		whitespace,
		required(identifier, () => 'Expected identifier'),
		whitespace,
		optional(
			map(
				tuple(
					exact(':'),
					whitespace,
					typeExpression()
				),
				([_0, _1, type]) => type
			)
		),
		whitespace,
		required(exact('='), () => 'Expected ='),
		whitespace,
		required(expression() as Parser<Expression, BagelParseError>, () => 'Expected value'),
	),
	([_0, _1, name, _2, type, _3, _4, _5, value], src) => ({
		kind: 'const-declaration',
		name,
		type,
		value,
		src
	} as const)
)(input)

export const unionTypeExpression: Parser<UnionTypeExpression, BagelParseError> = input => map(
	manySep2(typeExpression(unionTypeExpression) as Parser<TypeExpression, BagelParseError>, tuple(whitespace, exact('|'), whitespace)),
	(members, src) => ({
		kind: 'union-type-expression',
		members,
		src
	} as const)
)(input)

export const stringTypeExpression: Parser<StringTypeExpression, BagelParseError> = map(
	oneOf(
		map(exact('string'), () => undefined),
		string
	),
	(value, src) => ({
		kind: 'string-type-expression',
		value,
		src
	} as const)
)

export const numberTypeExpression: Parser<NumberTypeExpression, BagelParseError> = map(
	oneOf(
		map(exact('number'), () => undefined),
		map(number, n => Number(n))
	),
	(value, src) => ({
		kind: 'number-type-expression',
		value,
		src
	} as const)
)

export const booleanTypeExpression: Parser<BooleanTypeExpression, BagelParseError> = map(
	oneOf(
		map(exact('boolean'), () => undefined),
		map(boolean, b => b === 'true')
	),
	(value, src) => ({
		kind: 'boolean-type-expression',
		value,
		src
	} as const)
)

export const nilTypeExpression: Parser<NilTypeExpression, BagelParseError> = map(
	nil,
	(_, src) => ({
		kind: 'nil-type-expression',
		src
	} as const)
)

export const unknownTypeExpression: Parser<UnknownTypeExpression, BagelParseError> = map(
	exact('unknown'),
	(_, src) => ({
		kind: 'unknown-type-expression',
		src
	})
)

export const typeExpression = precedence(
	unionTypeExpression,
	stringTypeExpression,
	numberTypeExpression,
	booleanTypeExpression,
	nilTypeExpression
)

const plusOrMinusOperation: Parser<BinaryOperationExpression, BagelParseError> = input => map(
	tuple(expression(plusOrMinusOperation), whitespace, oneOf(exact('+'), exact('-')), whitespace, expression(plusOrMinusOperation)),
	([left, _0, op, _1, right], src) => ({
		kind: 'binary-operation-expression',
		left,
		op,
		right,
		src
	} as const)
)(input)

const timesOrDivOperation: Parser<BinaryOperationExpression, BagelParseError> = input => map(
	tuple(expression(timesOrDivOperation), whitespace, oneOf(exact('*'), exact('/')), whitespace, expression(timesOrDivOperation)),
	([left, _0, op, _1, right], src) => ({
		kind: 'binary-operation-expression',
		left,
		op,
		right,
		src
	} as const)
)(input)

export const ifElseExpression: Parser<IfElseExpression, BagelParseError> = input => map(
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

const ifCase: Parser<IfElseExpressionCase, BagelParseError> = input => map(
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

export const objectLiteral: Parser<ObjectLiteral, BagelParseError> = input => map(
	tuple(
		exact('{'),
		whitespace,
		manySep0<KeyValueExpression | SpreadExpression, string, BagelParseError>(
			oneOf(
				spreadExpression,
				map(
					tuple(
						oneOf(identifier, stringLiteral),
						whitespace,
						exact(':'),
						whitespace,
						expression()
					),
					([key, _0, _1, _2, value], src) => ({
						kind: 'key-value-expression',
						key: (
							key.kind === 'identifier'
								? { kind: 'string-literal', value: key.identifier, src: key.src } as const
								: key
						),
						value,
						src
					} as const)
				)
			),
			tuple(whitespace, exact(','), whitespace)
		),
		whitespace,
		required(exact('}'), () => 'Expected \'}\'')
	),
	([_0, _1, entries, _2, _3], src) => ({
		kind: 'object-literal',
		entries: entries,
		src
	} as const)
)(input)

export const arrayLiteral: Parser<ArrayLiteral, BagelParseError> = input => map(
	tuple(
		exact('['),
		whitespace,
		manySep0<Expression | SpreadExpression, string, BagelParseError>(oneOf(spreadExpression, expression()), tuple(whitespace, exact(','), whitespace)),
		whitespace,
		required(exact(']'), () => 'Expected \'}\'')
	),
	([_0, _1, elements, _2, _3], src) => ({
		kind: 'array-literal',
		elements,
		src
	} as const)
)(input)

export const spreadExpression: Parser<SpreadExpression, BagelParseError> = input => map(
	tuple(
		exact('...'),
		required(expression() as Parser<Expression, BagelParseError>, () => 'Expected spread expression')
	),
	([_0, spread], src) => ({
		kind: 'spread-expression',
		spread,
		src
	} as const)
)(input)

export const stringLiteral: Parser<StringLiteral, BagelParseError> = map(
	string,
	(value, src) => ({
		kind: 'string-literal',
		value,
		src
	} as const)
)

export const numberLiteral: Parser<NumberLiteral, BagelParseError> = map(
	number,
	(parsed, src) => ({
		kind: 'number-literal',
		value: Number(parsed),
		src
	} as const)
)

export const booleanLiteral: Parser<BooleanLiteral, BagelParseError> = map(
	boolean,
	(parsed, src) => ({
		kind: 'boolean-literal',
		value: parsed === 'true',
		src
	} as const)
)

export const nilLiteral: Parser<NilLiteral, BagelParseError> = map(
	nil,
	(_, src) => ({
		kind: 'nil-literal',
		src
	} as const)
)

export const identifier: Parser<Identifier, BagelParseError> = map(
	take1(alphaChar),
	(parsed, src) => ({
		kind: 'identifier',
		identifier: parsed,
		src
	} as const)
)

export const expression = precedence(
	plusOrMinusOperation,
	timesOrDivOperation,
	ifElseExpression,
	objectLiteral,
	arrayLiteral,
	stringLiteral,
	numberLiteral,
	booleanLiteral,
	nilLiteral,
	identifier
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
