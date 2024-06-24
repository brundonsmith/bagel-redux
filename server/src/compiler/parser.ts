import { ParseSource, Parser, Precedence, alphaChar, char, exact, filter, many1, manySep0, manySep1, manySep2, map, numericChar, oneOf, optional, precedence, required, take0, take1, tuple, whitespace } from './parser-combinators'

export type ASTInfo = { src: ParseSource, parent?: AST }

export type AST =
	| ModuleAST
	| Declaration
	| TypeExpression
	| KeyValue<TypeExpression>
	| Spread<TypeExpression>
	| Expression
	| KeyValue<Expression>
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
	| Range
	| StringLiteral
	| NumberLiteral
	| BooleanLiteral
	| NilLiteral
	| UnknownTypeExpression

export type ObjectTypeExpression = Readonly<{ kind: 'object-literal', entries: Array<Readonly<{ kind: 'key-value', key: TypeExpression, value: TypeExpression } & ASTInfo> | Readonly<{ kind: 'spread', spread: TypeExpression } & ASTInfo>> } & ASTInfo>
export type ArrayTypeExpression = Readonly<{ kind: 'array-literal', elements: Array<TypeExpression | Readonly<{ kind: 'spread', spread: TypeExpression } & ASTInfo>> } & ASTInfo>
export type TypeofTypeExpression = Readonly<{ kind: 'typeof-type-expression', expression: Expression } & ASTInfo>
export type FunctionTypeExpression = Readonly<{ kind: 'function-type-expression', params: TypeExpression[], returns: TypeExpression } & ASTInfo>
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
	| ObjectExpression
	| ArrayExpression
	| StringLiteral
	| NumberLiteral
	| BooleanLiteral
	| NilLiteral
	| LocalIdentifier

export type ObjectExpression = Readonly<{ kind: 'object-literal', entries: Array<Readonly<{ kind: 'key-value', key: Expression, value: Expression } & ASTInfo> | Readonly<{ kind: 'spread', spread: Expression } & ASTInfo>> } & ASTInfo>
export type ArrayExpression = Readonly<{ kind: 'array-literal', elements: Array<Expression | Readonly<{ kind: 'spread', spread: Expression } & ASTInfo>> } & ASTInfo>
export type PropertyAccessExpression = Readonly<{ kind: 'property-access-expression', subject: Expression, property: Expression } & ASTInfo>
export type AsExpression = Readonly<{ kind: 'as-expression', expression: Expression, type: TypeExpression } & ASTInfo>
export type FunctionExpression = Readonly<{ kind: 'function-expression', params: NameAndType[], returnType: TypeExpression | undefined, body: Expression } & ASTInfo>
export type NameAndType = Readonly<{ kind: 'name-and-type', name: PlainIdentifier, type: TypeExpression | undefined } & ASTInfo>
export type Invocation = Readonly<{ kind: 'invocation', subject: Expression, args: Expression[] } & ASTInfo>
export type BinaryOperationExpression = Readonly<{ kind: 'binary-operation-expression', left: Expression, op: '+' | '-' | '*' | '/', right: Expression } & ASTInfo>
export type IfElseExpression = Readonly<{ kind: 'if-else-expression', cases: IfElseExpressionCase[], defaultCase: Expression | undefined } & ASTInfo>
export type IfElseExpressionCase = Readonly<{ kind: 'if-else-expression-case', condition: Expression, outcome: Expression } & ASTInfo>
export type StringLiteral = Readonly<{ kind: 'string-literal', value: string } & ASTInfo>
export type NumberLiteral = Readonly<{ kind: 'number-literal', value: number } & ASTInfo>
export type BooleanLiteral = Readonly<{ kind: 'boolean-literal', value: boolean } & ASTInfo>
export type NilLiteral = Readonly<{ kind: 'nil-literal' } & ASTInfo>
export type LocalIdentifier = Readonly<{ kind: 'local-identifier', identifier: string } & ASTInfo>
export type Range = Readonly<{ kind: 'range', start: number | undefined, end: number | undefined } & ASTInfo>

export type ObjectLiteral<T> = Readonly<{ kind: 'object-literal', entries: Array<KeyValue<T> | Spread<T>> } & ASTInfo>
export type ArrayLiteral<T> = Readonly<{ kind: 'array-literal', elements: Array<T | Spread<T>> } & ASTInfo>
export type KeyValue<T> = Readonly<{ kind: 'key-value', key: T, value: T } & ASTInfo>
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
		required(expression(), () => 'Expected value'),
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
		manySep0(typeExpression(), tuple(whitespace, exact(','), whitespace)),
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
	manySep2(typeExpression(unionTypeExpression), tuple(whitespace, exact('|'), whitespace)),
	(members, src) => ({
		kind: 'union-type-expression',
		members,
		src
	} as const)
)(input)

const keyValue = <T extends TypeExpression | Expression>(inner: Parser<T, Err>): Parser<KeyValue<T>, Err> => map(
	tuple(
		oneOf(plainIdentifier, inner),
		whitespace,
		exact(':'),
		whitespace,
		inner
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

export const objectLiteral = <T extends TypeExpression | Expression>(inner: Parser<T, Err>): Parser<ObjectLiteral<T>, Err> => map(
	tuple(
		exact('{'),
		whitespace,
		manySep0<KeyValue<T> | Spread<T>, string, Err>(
			oneOf(spread(inner), keyValue(inner)),
			tuple(whitespace, exact(','), whitespace)
		),
		whitespace,
		optional(exact(',')),
		whitespace,
		required(exact('}'), () => 'Expected \'}\'')
		// TODO: {[key]: value}
	),
	([_0, _1, entries, _2, _3], src) => ({
		kind: 'object-literal',
		entries,
		src
	})
)

export const arrayLiteral = <T extends TypeExpression | Expression>(inner: Parser<T, Err>): Parser<ArrayLiteral<T>, Err> => map(
	tuple(
		exact('['),
		whitespace,
		manySep0<T | Spread<T>, string, Err>(oneOf(spread(inner), inner), tuple(whitespace, exact(','), whitespace)),
		whitespace,
		optional(exact(',')),
		whitespace,
		required(exact(']'), () => 'Expected \'}\'')
	),
	([_0, _1, elements, _2, _3], src) => ({
		kind: 'array-literal',
		elements,
		src
	} as const)
)

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
	([start, _0, end], src) => ({
		kind: 'range',
		start,
		end,
		src
	})
)

export const numberTypeExpression: Parser<NumberTypeExpression, Err> = map(
	exact('number'),
	(_0, src) => ({
		kind: 'number-type-expression',
		src
	} as const)
)

export const booleanTypeExpression: Parser<BooleanTypeExpression, Err> = map(
	exact('boolean'),
	(_0, src) => ({
		kind: 'boolean-type-expression',
		src
	} as const)
)

export const unknownTypeExpression: Parser<UnknownTypeExpression, Err> = map(
	exact('unknown'),
	(_0, src) => ({
		kind: 'unknown-type-expression',
		src
	})
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

export const typeExpression: Precedence<Parser<TypeExpression, Err>> = startingAfter => input => precedence(
	typeofTypeExpression,
	functionTypeExpression,
	unionTypeExpression,
	objectLiteral(typeExpression()),
	arrayLiteral(typeExpression()),
	stringTypeExpression,
	numberTypeExpression,
	booleanTypeExpression,
	range,
	stringLiteral,
	numberLiteral,
	booleanLiteral,
	nilLiteral
)(startingAfter as any)(input)

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
	([_0, _1, params, _3, _4, _5, returnType, _6, _7, _8, body], src) => ({
		kind: 'function-expression',
		params,
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

export const expression: Precedence<Parser<Expression, Err>> = startingAfter => input => precedence(
	propertyAccessExpression,
	asExpression,
	invocation,
	plusOrMinusOperation,
	timesOrDivOperation,
	ifElseExpression,
	functionExpression,
	objectLiteral(expression()),
	arrayLiteral(expression()),
	stringLiteral,
	numberLiteral,
	booleanLiteral,
	nilLiteral,
	localIdentifier
)(startingAfter as any)(input)

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

export const findASTNodeAtPosition = (position: number, ast: AST): AST | undefined => {
	if (position < ast.src.start || position >= ast.src.end) {
		return undefined
	}

	const findIn = (ast: AST) => findASTNodeAtPosition(position, ast)

	switch (ast.kind) {
		case 'spread': return [findIn(ast.spread), ast].filter(exists)[0]
		case 'module': return [...ast.declarations.map(findIn), ast].filter(exists)[0]
		case 'const-declaration': return [findIn(ast.declared), findIn(ast.value), ast].filter(exists)[0]
		case 'typeof-type-expression': return [findIn(ast.expression), ast].filter(exists)[0]
		case 'function-type-expression': return [...ast.params.map(findIn), findIn(ast.returns), ast].filter(exists)[0]
		case 'union-type-expression': return [...ast.members.map(findIn), ast].filter(exists)[0]
		case 'object-literal': return [...ast.entries.map(findIn), ast].filter(exists)[0]
		case 'array-literal': return [...ast.elements.map(findIn), ast].filter(exists)[0]
		case 'key-value': return [findIn(ast.key), findIn(ast.value), ast].filter(exists)[0]
		case 'property-access-expression': return [findIn(ast.subject), findIn(ast.property), ast].filter(exists)[0]
		case 'as-expression': return [findIn(ast.expression), findIn(ast.type), ast].filter(exists)[0]
		case 'function-expression': return [...ast.params.map(findIn), ast.returnType && findIn(ast.returnType), findIn(ast.body), ast].filter(exists)[0]
		case 'invocation': return [findIn(ast.subject), ...ast.args.map(findIn), ast].filter(exists)[0]
		case 'binary-operation-expression': return [findIn(ast.left), findIn(ast.right), ast].filter(exists)[0]
		case 'if-else-expression': return [...ast.cases.map(findIn), ast.defaultCase && findIn(ast.defaultCase), ast].filter(exists)[0]
		case 'if-else-expression-case': return [findIn(ast.condition), findIn(ast.outcome), ast].filter(exists)[0]
		case 'name-and-type': return [findIn(ast.name), ast.type && findIn(ast.type), ast].filter(exists)[0]

		// atomic; we've gotten there
		case 'range':
		case 'string-type-expression':
		case 'number-type-expression':
		case 'boolean-type-expression':
		case 'string-literal':
		case 'number-literal':
		case 'boolean-literal':
		case 'nil-literal':
		case 'unknown-type-expression':
		case 'local-identifier':
		case 'plain-identifier':
			return ast
	}
}

const exists = <T>(x: T | null | undefined): x is T => x != null