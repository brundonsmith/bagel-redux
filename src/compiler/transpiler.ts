import { AST } from './parser'
import { instrument, todo } from './utils'

export type TranspileContext = {
	outputTypes: boolean,
	minify: boolean,
	testMode: boolean,
}

export const transpileInner = (ctx: TranspileContext, ast: AST): string => {
	const trans = (ast: AST) => transpileInner(ctx, ast)

	const comments = ast.precedingComments?.map(trans).join('\n\n') ?? ''

	switch (ast.kind) {
		case 'module': return comments + ast.declarations.map(trans).join('\n\n')
		case 'import-declaration': return comments + `import { ${ast.imports.map(trans).join(', ')} } from ${trans(ast.uri)}`
		case 'import-item': return comments + `${trans(ast.name)}${ast.alias ? ` as ${trans(ast.alias)}` : ''}`
		case 'type-declaration': return comments + `${ast.exported ? 'export ' : ''}type ${trans(ast.name)} = ${trans(ast.type)}`
		case 'const-declaration': return comments + `${ast.exported ? 'export ' : ''}const ${trans(ast.declared)} = ${trans(ast.value)}`
		case 'typeof-type-expression': return comments + `typeof ${trans(ast.expression)}`
		case 'function-type-expression': return comments + `(${ast.params.map((p, i) => `param${i}: ${trans(p)}`).join(', ')}) => ${trans(ast.returns)}`
		case 'union-type-expression': return comments + ast.members.map(trans).join(' | ')
		case 'key-value':
			return comments + `${trans(ast.key)}: ${trans(ast.value)}`
		case 'spread':
			return comments + `...${trans(ast.spread)}`
		case 'string-type-expression': return comments + 'string'
		case 'number-type-expression': return comments + 'number'
		case 'boolean-type-expression': return comments + 'boolean'
		case 'unknown-type-expression': return comments + 'unknown'
		case 'property-access-expression': return comments + `${trans(ast.subject)}[${trans(ast.property)}]`
		case 'as-expression': return comments + `${trans(ast.expression)} as ${trans(ast.type)}`
		case 'function-expression': return comments + `(${ast.params.map(trans).join(', ')})${ast.returnType ? `: ${trans(ast.returnType)}` : ''} => ${trans(ast.body)}`
		case 'name-and-type': return comments + trans(ast.name) + (ast.type ? `: ${trans(ast.type)}` : '')
		case 'invocation': return comments + `${trans(ast.subject)}(${ast.args.map(trans).join(', ')})`
		case 'binary-operation-expression': return comments + `${trans(ast.left)} ${ast.op} ${trans(ast.right)}`
		case 'if-else-expression': return comments + `${ast.cases.map(trans).join('')} ${ast.defaultCase ? trans(ast.defaultCase) : NIL}`
		case 'if-else-expression-case': return comments + `${trans(ast.condition)} ? ${trans(ast.outcome)} :`
		case 'parenthesis': return comments + `(${trans(ast.inner)})`
		case 'object-literal': return comments + `{ ${ast.entries.map(trans).join(', ')} }`
		case 'array-literal': return comments + `[${ast.elements.map(trans).join(', ')}]`
		case 'string-literal': return comments + `'${ast.value}'`
		case 'number-literal': return comments + String(ast.value)
		case 'boolean-literal': return comments + String(ast.value)
		case 'nil-literal': return comments + NIL // TODO: in a type context, make it null | undefined?
		case 'comment': return comments + (
			ast.comment.includes('\n')
				? '/**\n' + ast.comment.split('\n').map(line => ` * ${line}\n`).join('') + ' */\n'
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

export const transpile = instrument('transpile', transpileInner)
