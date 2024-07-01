import { AST, isValidIdentifier } from './parser'

export type FormatContext = {
	indentation: number
}

export const format = (ctx: FormatContext = { indentation: 0 }, ast: AST): string => {
	const f = (ast: AST) => format(ctx, ast)
	const nextIndentation = new Array(ctx.indentation + 1).fill('  ')
	const fIndent = (ast: AST) => '\n' + nextIndentation + format({ ...ctx, indentation: ctx.indentation + 1 }, ast)

	const comments = ast.precedingComments?.map(f).join('\n\n') ?? ''

	switch (ast.kind) {
		case 'module': return comments + ast.declarations.map(f).join('\n\n')
		case 'import-declaration': return comments + `from ${f(ast.uri)} import { ${ast.imports.map(f).join(', ')} }`
		case 'import-item': return comments + `${f(ast.name)}${ast.alias ? ` as ${f(ast.alias)}` : ''}`
		case 'type-declaration': return comments + `${ast.exported ? 'export ' : ''}type ${f(ast.name)} = ${f(ast.type)}`
		case 'const-declaration': return comments + `${ast.exported ? 'export ' : ''}const ${f(ast.declared)} = ${f(ast.value)}`
		case 'typeof-type-expression': return comments + `typeof ${f(ast.expression)}`
		case 'function-type-expression': return comments + `(${ast.params.map(f).join(', ')}) => ${f(ast.returns)}`
		case 'union-type-expression': return comments + ast.members.map(f).join(' | ')
		case 'key-value':
			return comments + `${f(ast.key)}: ${f(ast.value)}`
		case 'spread':
			return comments + `...${f(ast.spread)}`
		case 'string-type-expression': return comments + 'string'
		case 'number-type-expression': return comments + 'number'
		case 'boolean-type-expression': return comments + 'boolean'
		case 'unknown-type-expression': return comments + 'unknown'
		case 'property-access-expression': return comments + `${f(ast.subject)}${ast.property.kind === 'string-literal' && isValidIdentifier(ast.property.value)
			? `.${ast.property.value}`
			: `[${f(ast.property)}]`}`
		case 'as-expression': return comments + `${f(ast.expression)} as ${f(ast.type)}`
		case 'function-expression': return comments + `(${ast.params.map(f).join(', ')})${ast.returnType ? `: ${f(ast.returnType)}` : ''} => ${f(ast.body)}`
		case 'name-and-type': return comments + f(ast.name) + (ast.type ? `: ${f(ast.type)}` : '')
		case 'invocation': return comments + `${f(ast.subject)}(${ast.args.map(f).join(', ')})`
		case 'binary-operation-expression': return comments + `${f(ast.left)} ${ast.op} ${f(ast.right)}`
		case 'if-else-expression': {
			return comments + `${ast.cases.map(f).join(' else ')}${ast.defaultCase ? ` else {${fIndent(ast.defaultCase)}\n}` : ''}`
		}
		case 'if-else-expression-case': return comments + `if ${f(ast.condition)} {${fIndent(ast.outcome)}\n}`
		case 'parenthesis': return comments + `(${f(ast.inner)})`
		case 'object-literal': return comments + `{${ast.entries.map(fIndent).join(', ')}\n}`
		case 'array-literal': return comments + `[${ast.elements.map(f).join(', ')}]`
		case 'string-literal': return comments + `'${ast.value}'`
		case 'number-literal': return comments + String(ast.value)
		case 'boolean-literal': return comments + String(ast.value)
		case 'nil-literal': return comments + 'nil'
		case 'comment': return comments + (
			ast.comment.includes('\n')
				? '/**\n' + ast.comment.split('\n').map(line => ` * ${line}\n`).join('') + ' */\n'
				: `// ${ast.comment}\n`
		)
		case 'range': return comments + `${ast.start ? f(ast.start) : ''}..${ast.end ? f(ast.end) : ''}`
		case 'broken-subtree': return comments + ast.src.code.substring(ast.src.start, ast.src.end)
		case 'local-identifier':
		case 'plain-identifier':
			return comments + ast.identifier
	}
}