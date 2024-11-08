import { AST, Spread, StatementBlock, TypeExpression } from './parser'
import { inferType, purity, resolveType, simplifyType } from './types'
import { profile, todo } from './utils'

export type TranspileContext = {
	outputTypes: boolean,
	minify: boolean,
	testMode: boolean,
	forBundle: boolean,
}

export const transpileInner = (ctx: TranspileContext, ast: AST): string => {
	const trans = (ast: AST) => transpileInner(ctx, ast)

	const comments = ast.precedingComments?.map(trans).join('\n\n') ?? ''

	switch (ast.kind) {
		case 'module': return comments + ast.declarations.map(trans).join('\n\n')
		case 'import-declaration': {
			if (!ctx.forBundle) {
				return comments + `const { ${ast.imports.map(trans).join(', ')} } = require(${trans(ast.uri)})`
			} else {
				return ''
			}
		}
		case 'import-item': return comments + `${trans(ast.name)}${ast.alias ? `: ${trans(ast.alias)}` : ''}`
		case 'type-declaration': {
			let name = trans(ast.name)
			let typ = ast.type
			if (ast.type.kind === 'generic-type-expression') {
				name += `<${ast.type.params.map(trans).join(', ')}>`
				typ = ast.type.inner
			}

			return comments + `${ast.exported && !ctx.forBundle ? 'export ' : ''}type ${name} = ${trans(typ)}`
		}
		case 'variable-declaration': return comments + `${ast.exported && !ctx.forBundle ? 'export ' : ''}${ast.isConst ? 'const' : 'let'} ${trans(ast.declared)} = ${trans(ast.value)}`
		case 'typeof-type-expression': return comments + `typeof ${trans(ast.expression)}`
		case 'function-type-expression': return comments + `(${ast.params.map((p, i) => `_${i}: ${trans(p)}`).join(', ')}) => ${trans(ast.returns)}`
		case 'union-type-expression': return comments + ast.members.map(trans).join(' | ')
		case 'generic-type-expression': return comments + `<${ast.params.map(trans).join(', ')}>${trans(ast.inner)}`
		case 'generic-type-parameter': return comments + `${trans(ast.name)}${ast.extendz ? ` extends ${trans(ast.extendz)}` : ''}`
		case 'parameterized-type-expression': return comments + `${trans(ast.inner)}<${ast.params.map(trans).join(', ')}>`
		case 'key-value': return comments + `${trans(ast.key)}: ${trans(ast.value)}`
		case 'spread': return comments + `...${trans(ast.spread)}`
		case 'array-type-expression': return comments + trans(ast.element) + '[]'
		case 'string-type-expression': return comments + 'string'
		case 'number-type-expression': return comments + 'number'
		case 'boolean-type-expression': return comments + 'boolean'
		case 'unknown-type-expression': return comments + 'unknown'
		case 'assignment-statement': return comments + `${trans(ast.target)} = ${trans(ast.value)}`
		case 'return-statement': return comments + `return ${trans(ast.value)}`
		case 'for-loop-statement': return `for (const ${trans(ast.element)} of ${trans(ast.iterable)}) ${trans(ast.body)}`
		case 'statement-block': return comments + '{\n' + ast.statements.map(trans).join(';\n') + '\n}'
		case 'markup-expression': {
			return `{
				tag: '${ast.tag.identifier}',
				props: {${ast.props.map(trans).join(', ')}},
				children: [${ast.children.map(trans).join(', ')}]
			}`
		}
		case 'markup-key-value': return `${ast.key.identifier}: ${trans(ast.value)}`
		case 'property-access-expression':
			return comments + (
				ast.subject.kind === 'local-identifier' && ast.subject.identifier === 'js' && ast.property.kind === 'string-literal'
					? `globalThis.${ast.property.value}`
					: `${trans(ast.subject)}[${trans(ast.property)}]`
			)
		case 'as-expression': return comments + `${trans(ast.expression)} as ${trans(ast.type)}`
		case 'function-expression': {
			const isAsync = (ast.purity ?? purity(inferType({ target: 'cross-platform', resolveModule: () => undefined }, ast))) === 'async'
			return comments + (isAsync ? 'async ' : '') + `(${ast.params.map(trans).join(', ')})${ast.returnType && ctx.outputTypes ? `: ${trans(ast.returnType)}` : ''} => ${Array.isArray(ast.body)
				? '{\n' + ast.body.map(trans).join('\n') + '\n}'
				: ast.body.kind === 'object-literal' || ast.body.kind === 'markup-expression'
					? '(' + trans(ast.body) + ')'
					: trans(ast.body)}`
		}
		case 'name-and-type': return comments + trans(ast.name) + (ast.type && ctx.outputTypes ? `: ${trans(ast.type)}` : '')
		case 'invocation': return comments + (ast.awaitOrDetach === 'await' ? 'await ' : '') + `${trans(ast.subject)}(${ast.args.map(trans).join(', ')})`
		case 'binary-operation-expression': return comments + `${trans(ast.left)} ${ast.op} ${trans(ast.right)}`
		case 'switch': {
			// TODO: lots
			const typeJson = (condition: TypeExpression) => JSON.stringify(simplifyType({ typeScope: {}, valueScope: {} }, resolveType({ target: 'cross-platform', resolveModule: () => undefined }, condition)))

			if (ast.context === 'expression') {
				return comments + `${ast.cases.map(({ condition, outcome }) => `___fits(${typeJson(condition)}, ${trans(ast.value)}) ? ${trans(outcome)} :`).join('')} ${ast.defaultCase ? trans(ast.defaultCase) : NIL}`
			} else {
				return comments +
					ast.cases.map(({ condition, outcome }) => 'if (___fits(' + typeJson(condition) + ', ' + trans(ast.value) + ')) {\n' + (outcome as StatementBlock).statements.map(trans).join(';\n') + '\n}').join(' else ') +
					(ast.defaultCase ? ' else ' + trans(ast.defaultCase) : '')
			}
		}
		case 'switch-case': {
			return todo()
		}
		case 'if-else': {
			if (ast.context === 'expression') {
				return comments + `${ast.cases.map(trans).join('')} ${ast.defaultCase ? trans(ast.defaultCase) : NIL}`
			} else {
				return comments + ast.cases.map(trans).join(' else ') + (ast.defaultCase ? ' else ' + trans(ast.defaultCase) : '')
			}
		}
		case 'if-else-case': {
			if (ast.context === 'expression') {
				return comments + `${trans(ast.condition)} ? ${trans(ast.outcome)} :`
			} else {
				return comments + 'if (' + trans(ast.condition) + ') {\n' + (ast.outcome as StatementBlock).statements.map(trans).join(';\n') + '\n}'
			}
		}
		case 'parenthesis': return comments + `(${trans(ast.inner)})`
		case 'object-literal': {
			if (ast.context === 'type-expression') {
				const spreads = ast.entries.filter(s => s.kind === 'spread')
				const keyValues = ast.entries.filter(s => s.kind === 'key-value')
				return comments + spreads.map(s => trans((s as Spread<TypeExpression>).spread) + ' & ').join('') + `{ ${keyValues.map(trans).join(', ')} }`
			}

			return comments + `{ ${ast.entries.map(trans).join(', ')} }`
		}
		case 'array-literal': return comments + `[${ast.elements.map(trans).join(', ')}]`
		case 'string-literal': return comments + `'${ast.value}'`
		case 'number-literal': return comments + String(ast.value)
		case 'boolean-literal': return comments + String(ast.value)
		case 'nil-literal': return comments + NIL // TODO: in a type context, make it null | undefined?
		case 'comment': return comments + (
			ast.commentType === 'block'
				? '\n/**\n' + ast.comment.split('\n').map(line => ` * ${line}\n`).join('') + ' */\n'
				: `// ${ast.comment}\n`
		)
		case 'range': return comments + todo()
		case 'broken-subtree': return comments + todo()
		case 'local-identifier':
		case 'plain-identifier':
			return comments + ast.identifier
	}
}

const NIL = 'undefined'

export const transpile = profile('transpile', transpileInner)
