import { ParseSource, Parser, alphaChar, char, exact, filter, input, many0, many1, manySep0, manySep1, manySep2, map, numericChar, oneOf, optional, precedence, required, take0, take1, tuple, whitespace } from './parser-combinators'
import { KeyValueType, SpreadType } from './types'
import { todo } from './utils'

export type ASTInfo = { src: ParseSource, parent?: AST }

export type AST =
	| ModuleAST
	| Declaration
	| TypeExpression
	| KeyValueTypeExpression
	| Spread<TypeExpression>
	| Expression
	| KeyValueExpression
	| Spread<Expression>
	| IfElseExpressionCase
	| NameAndType
	| PlainIdentifier

export type ModuleAST = {
	kind: 'module',
	declarations: Declaration[]
} & ASTInfo

export type Declaration =
	| ConstDeclaration

export type ConstDeclaration = Readonly<{ kind: 'const-declaration', declared: NameAndType, value: Expression } & ASTInfo>

export type TypeExpression =
	| TypeofTypeExpression
	| FunctionTypeExpression
	| UnionTypeExpression
	| ObjectTypeExpression
	| ArrayTypeExpression
	| StringTypeExpression
	| NumberTypeExpression
	| BooleanTypeExpression
	| NilTypeExpression
	| UnknownTypeExpression

export type TypeofTypeExpression = Readonly<{ kind: 'typeof-type-expression', expression: Expression } & ASTInfo>
export type FunctionTypeExpression = Readonly<{ kind: 'function-type-expression', params: TypeExpression[], returns: TypeExpression } & ASTInfo>
export type UnionTypeExpression = Readonly<{ kind: 'union-type-expression', members: TypeExpression[] } & ASTInfo>
export type ObjectTypeExpression = Readonly<{ kind: 'object-type-expression', entries: Array<KeyValueTypeExpression | Spread<TypeExpression>> | KeyValueTypeExpression } & ASTInfo>
export type KeyValueTypeExpression = Readonly<{ kind: 'key-value-type-expression', key: TypeExpression, value: TypeExpression } & ASTInfo>
export type ArrayTypeExpression = Readonly<{ kind: 'array-type-expression', elements: Array<TypeExpression | Spread<TypeExpression>> | TypeExpression } & ASTInfo>
export type StringTypeExpression = Readonly<{ kind: 'string-type-expression', value: string | undefined } & ASTInfo>
export type NumberTypeExpression = Readonly<{ kind: 'number-type-expression', value: Range | number | undefined } & ASTInfo>
export type BooleanTypeExpression = Readonly<{ kind: 'boolean-type-expression', value: boolean | undefined } & ASTInfo>
export type NilTypeExpression = Readonly<{ kind: 'nil-type-expression' } & ASTInfo>
export type UnknownTypeExpression = Readonly<{ kind: 'unknown-type-expression' } & ASTInfo>

export type Range =
	| { start: number, end: number }
	| { start: number, end: number | undefined }
	| { start: number | undefined, end: number }

export type Expression =
	| PropertyAccessExpression
	| AsExpression
	| FunctionExpression
	| Invocation
	| BinaryOperationExpression
	| IfElseExpression
	| ObjectLiteral
	| ArrayLiteral
	| StringLiteral
	| NumberLiteral
	| BooleanLiteral
	| NilLiteral
	| LocalIdentifier

export type PropertyAccessExpression = Readonly<{ kind: 'property-access-expression', subject: Expression, property: Expression } & ASTInfo>
export type AsExpression = Readonly<{ kind: 'as-expression', expression: Expression, type: TypeExpression } & ASTInfo>
export type FunctionExpression = Readonly<{ kind: 'function-expression', args: NameAndType[], returnType: TypeExpression | undefined, body: Expression } & ASTInfo>
export type NameAndType = Readonly<{ kind: 'name-and-type', name: PlainIdentifier, type: TypeExpression | undefined } & ASTInfo>
export type Invocation = Readonly<{ kind: 'invocation', subject: Expression, args: Expression[] } & ASTInfo>
export type BinaryOperationExpression = Readonly<{ kind: 'binary-operation-expression', left: Expression, op: '+' | '-' | '*' | '/', right: Expression } & ASTInfo>
export type IfElseExpression = Readonly<{ kind: 'if-else-expression', cases: IfElseExpressionCase[], defaultCase: Expression | undefined } & ASTInfo>
export type IfElseExpressionCase = Readonly<{ kind: 'if-else-expression-case', condition: Expression, outcome: Expression } & ASTInfo>
export type ObjectLiteral = Readonly<{ kind: 'object-literal', entries: Array<KeyValueExpression | Spread<Expression>> } & ASTInfo>
export type KeyValueExpression = Readonly<{ kind: 'key-value-expression', key: StringLiteral, value: Expression } & ASTInfo>
export type ArrayLiteral = Readonly<{ kind: 'array-literal', elements: Array<Expression | Spread<Expression>> } & ASTInfo>
export type StringLiteral = Readonly<{ kind: 'string-literal', value: string } & ASTInfo>
export type NumberLiteral = Readonly<{ kind: 'number-literal', value: number } & ASTInfo>
export type BooleanLiteral = Readonly<{ kind: 'boolean-literal', value: boolean } & ASTInfo>
export type NilLiteral = Readonly<{ kind: 'nil-literal' } & ASTInfo>
export type LocalIdentifier = Readonly<{ kind: 'local-identifier', identifier: string } & ASTInfo>

export type Spread<T> = Readonly<{ kind: 'spread', spread: T } & ASTInfo>

export type PlainIdentifier = Readonly<{ kind: 'plain-identifier', identifier: string } & ASTInfo>

type Err = string

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

export const parseModule: Parser<ModuleAST, Err> = input => map(
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

export const declaration: Parser<Declaration, Err> = input => oneOf(
	constDeclaration
)(input)

export const constDeclaration: Parser<ConstDeclaration, Err> = input => map(
	tuple(
		exact('const'),
		whitespace,
		required(nameAndType, () => 'Expected name'),
		whitespace,
		required(exact('='), () => 'Expected ='),
		whitespace,
		required(expression() as Parser<Expression, Err>, () => 'Expected value'),
	),
	([_0, _1, declared, _3, _4, _5, value], src) => ({
		kind: 'const-declaration',
		declared,
		value,
		src
	} as const)
)(input)

export const nameAndType: Parser<NameAndType, Err> = input => map(
	tuple(
		plainIdentifier,
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
	),
	([name, _0, type], src) => ({
		kind: 'name-and-type',
		name,
		type,
		src
	} as const)
)(input)

export const typeofTypeExpression: Parser<TypeofTypeExpression, Err> = input => map(
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

export const functionTypeExpression: Parser<FunctionTypeExpression, Err> = input => map(
	tuple(
		exact('('),
		manySep0(typeExpression() as Parser<TypeExpression, Err>, tuple(whitespace, exact(','), whitespace)),
		exact(')'),
		whitespace,
		exact('=>'),
		whitespace,
		typeExpression()
	),
	([_0, params, _1, _2, _3, _4, returns], src) => ({
		kind: 'function-type-expression',
		params,
		returns,
		src
	} as const)
)(input)

export const unionTypeExpression: Parser<UnionTypeExpression, Err> = input => map(
	manySep2(typeExpression(unionTypeExpression) as Parser<TypeExpression, Err>, tuple(whitespace, exact('|'), whitespace)),
	(members, src) => ({
		kind: 'union-type-expression',
		members,
		src
	} as const)
)(input)

// const object = <TValue>(value: Parser<T, Err>) => map(
// 	tuple(
// 		exact('{'),
// 		whitespace,
// 		manySep0<KeyValueTypeExpression | SpreadTypeExpression, string, Err>(
// 			oneOf(
// 				spread(value),
// 				map(
// 					tuple(
// 						oneOf(
// 							plainIdentifier,
// 							map(string, (value, src) => ({ kind: 'string-type-expression' as const, value, src }))
// 						),
// 						whitespace,
// 						exact(':'),
// 						whitespace,
// 						value
// 					),
// 					([key, _0, _1, _2, value], src) => ({
// 						kind: 'key-value-type-expression',
// 						key: (
// 							key.kind === 'plain-identifier'
// 								? { kind: 'string-type-expression', value: key.identifier, src: key.src } as const
// 								: key
// 						),
// 						value,
// 						src
// 					} as const)
// 				)
// 			),
// 			tuple(whitespace, exact(','), whitespace)
// 		),
// 		whitespace,
// 		required(exact('}'), () => 'Expected \'}\'')
// 		// TODO: {[key]: value}
// 	),
// 	([_0, _1, entries, _2, _3], src) => ({
// 		kind: 'object-type-expression',
// 		entries,
// 		src
// 	})
// )

const objectTypeExpression: Parser<ObjectTypeExpression, Err> = input => map(
	tuple(
		exact('{'),
		whitespace,
		manySep0<KeyValueTypeExpression | Spread<TypeExpression>, string, Err>(
			oneOf(
				spread(typeExpression() as Parser<TypeExpression, Err>),
				map(
					tuple(
						oneOf(
							plainIdentifier,
							map(string, (value, src) => ({ kind: 'string-type-expression' as const, value, src }))
						),
						whitespace,
						exact(':'),
						whitespace,
						typeExpression()
					),
					([key, _0, _1, _2, value], src) => ({
						kind: 'key-value-type-expression',
						key: (
							key.kind === 'plain-identifier'
								? { kind: 'string-type-expression', value: key.identifier, src: key.src } as const
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
		// TODO: {[key]: value}
	),
	([_0, _1, entries, _2, _3], src) => ({
		kind: 'object-type-expression',
		entries,
		src
	} as const)
)(input)

const arrayTypeExpression: Parser<ArrayTypeExpression, Err> = input => map(
	tuple(
		exact('['),
		whitespace,
		manySep0<TypeExpression | Spread<TypeExpression>, string, Err>(oneOf(spread(typeExpression() as Parser<TypeExpression, Err>), typeExpression()), tuple(whitespace, exact(','), whitespace)),
		whitespace,
		required(exact(']'), () => 'Expected \'}\'')
		// TODO: element[length?]
	),
	([_0, _1, elements, _2, _3], src) => ({
		kind: 'array-type-expression',
		elements,
		src
	} as const)
)(input)

export const stringTypeExpression: Parser<StringTypeExpression, Err> = map(
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

const range: Parser<Range, Err> = map(
	filter(
		tuple(
			optional(map(number, Number)),
			exact('..'),
			optional(map(number, Number))
		),
		([start, _0, end]) => start != null || end != null
	),
	([start, _0, end]) => ({
		start,
		end,
	} as Range)
)

export const numberTypeExpression: Parser<NumberTypeExpression, Err> = map(
	oneOf(
		range,
		map(number, n => Number(n)),
		map(exact('number'), () => undefined),
	) as Parser<NumberTypeExpression['value']>,
	(value, src) => ({
		kind: 'number-type-expression',
		value,
		src
	} as const)
)

export const booleanTypeExpression: Parser<BooleanTypeExpression, Err> = map(
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

export const nilTypeExpression: Parser<NilTypeExpression, Err> = map(
	nil,
	(_, src) => ({
		kind: 'nil-type-expression',
		src
	} as const)
)

export const unknownTypeExpression: Parser<UnknownTypeExpression, Err> = map(
	exact('unknown'),
	(_, src) => ({
		kind: 'unknown-type-expression',
		src
	})
)

export const typeExpression = precedence(
	typeofTypeExpression,
	functionTypeExpression,
	unionTypeExpression,
	objectTypeExpression,
	arrayTypeExpression,
	stringTypeExpression,
	numberTypeExpression,
	booleanTypeExpression,
	nilTypeExpression
)

const propertyAccessExpression: Parser<PropertyAccessExpression, Err> = input => map(
	tuple(
		expression(propertyAccessExpression),
		many1(map(
			tuple(
				exact('.'),
				oneOf(
					plainIdentifier,
					map(tuple(exact('['), whitespace, expression(), whitespace, exact(']')), ([_0, _1, expression, _2, _3]) => expression)
				)),
			([_0, property]) =>
				property.kind === 'plain-identifier'
					? { kind: 'string-literal' as const, value: property.identifier, src: property.src }
					: property
		)),
	),
	([subject, [firstProperty, ...rest]], src) => {
		const first = {
			kind: 'property-access-expression' as const,
			subject,
			property: firstProperty!,
			src
		}

		let current = first

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

		return first
	}
)(input)

const asExpression: Parser<AsExpression, Err> = input => map(
	tuple(
		expression(asExpression),
		whitespace,
		exact('as'),
		whitespace,
		typeExpression()
	),
	([expression, _0, _1, _2, type], src) => ({
		kind: 'as-expression',
		expression,
		type,
		src
	} as const)
)(input)

const functionExpression: Parser<FunctionExpression, Err> = input => map(
	tuple(
		exact('('),
		whitespace,
		manySep0(nameAndType, tuple(whitespace, exact(','), whitespace)),
		whitespace,
		exact(')'),
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
	([_0, _1, args, _3, _4, _5, returnType, _6, _7, _8, body], src) => ({
		kind: 'function-expression',
		args,
		returnType,
		body,
		src
	} as const)
)(input)

const invocation: Parser<Invocation, Err> = input => map(
	tuple(
		expression(invocation),
		exact('('),
		whitespace,
		manySep0(expression() as Parser<Expression, Err>, tuple(whitespace, exact(','), whitespace)), // TODO: spreads
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

const plusOrMinusOperation: Parser<BinaryOperationExpression, Err> = input => map(
	tuple(expression(plusOrMinusOperation), whitespace, oneOf(exact('+'), exact('-')), whitespace, expression(plusOrMinusOperation)),
	([left, _0, op, _1, right], src) => ({
		kind: 'binary-operation-expression',
		left,
		op,
		right,
		src
	} as const)
)(input)

const timesOrDivOperation: Parser<BinaryOperationExpression, Err> = input => map(
	tuple(expression(timesOrDivOperation), whitespace, oneOf(exact('*'), exact('/')), whitespace, expression(timesOrDivOperation)),
	([left, _0, op, _1, right], src) => ({
		kind: 'binary-operation-expression',
		left,
		op,
		right,
		src
	} as const)
)(input)

export const ifElseExpression: Parser<IfElseExpression, Err> = input => map(
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

const ifCase: Parser<IfElseExpressionCase, Err> = input => map(
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

export const objectLiteral: Parser<ObjectLiteral, Err> = input => map(
	tuple(
		exact('{'),
		whitespace,
		manySep0<KeyValueExpression | Spread<Expression>, string, Err>(
			oneOf(
				spread(expression() as Parser<Expression, Err>),
				map(
					tuple(
						oneOf(plainIdentifier, stringLiteral),
						whitespace,
						exact(':'),
						whitespace,
						expression()
					),
					([key, _0, _1, _2, value], src) => ({
						kind: 'key-value-expression',
						key: (
							key.kind === 'plain-identifier'
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
		optional(exact(',')),
		whitespace,
		required(exact('}'), () => 'Expected \'}\'')
	),
	([_0, _1, entries, _2, _3], src) => ({
		kind: 'object-literal' as const,
		entries,
		src
	})
)(input)

export const arrayLiteral: Parser<ArrayLiteral, Err> = input => map(
	tuple(
		exact('['),
		whitespace,
		manySep0<Expression | Spread<Expression>, string, Err>(oneOf(spread(expression() as Parser<Expression, Err>), expression()), tuple(whitespace, exact(','), whitespace)),
		whitespace,
		required(exact(']'), () => 'Expected \'}\'')
	),
	([_0, _1, elements, _2, _3], src) => ({
		kind: 'array-literal',
		elements,
		src
	} as const)
)(input)

const spread = <T>(inner: Parser<T, Err>): Parser<Spread<T>, Err> => map(
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

export const stringLiteral: Parser<StringLiteral, Err> = map(
	string,
	(value, src) => ({
		kind: 'string-literal',
		value,
		src
	} as const)
)

export const numberLiteral: Parser<NumberLiteral, Err> = map(
	number,
	(parsed, src) => ({
		kind: 'number-literal',
		value: Number(parsed),
		src
	} as const)
)

export const booleanLiteral: Parser<BooleanLiteral, Err> = map(
	boolean,
	(parsed, src) => ({
		kind: 'boolean-literal',
		value: parsed === 'true',
		src
	} as const)
)

export const nilLiteral: Parser<NilLiteral, Err> = map(
	nil,
	(_, src) => ({
		kind: 'nil-literal',
		src
	} as const)
)

const identifier = take1(alphaChar)

export const localIdentifier: Parser<LocalIdentifier, Err> = map(
	identifier,
	(parsed, src) => ({
		kind: 'local-identifier',
		identifier: parsed,
		src
	} as const)
)

export const plainIdentifier: Parser<PlainIdentifier, Err> = map(
	identifier,
	(parsed, src) => ({
		kind: 'plain-identifier',
		identifier: parsed,
		src
	} as const)
)

export const expression = precedence(
	propertyAccessExpression,
	asExpression,
	invocation,
	plusOrMinusOperation,
	timesOrDivOperation,
	ifElseExpression,
	functionExpression,
	objectLiteral,
	arrayLiteral,
	stringLiteral,
	numberLiteral,
	booleanLiteral,
	nilLiteral,
	localIdentifier
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
