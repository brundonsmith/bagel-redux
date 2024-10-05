import { AST, isValidIdentifier } from './parser'

export type FormatContext = {
	indentation: number,
	multiline: boolean,
}

const maxLineWidth = 40
const indentationUnit = '  '

export const format = (ast: AST, { indentation, multiline }: FormatContext = { indentation: 0, multiline: false }): string => {
	const f = (ast: AST) => {
		const singleLine = format(ast, { indentation, multiline: false })

		if (singleLine.length <= maxLineWidth) {
			return singleLine
		} else {
			return format(ast, { indentation, multiline: true })
		}
	}
	const fi = (ast: AST) => {
		const singleLine = format(ast, { indentation: indentation + 1, multiline: false })
		// TODO: factor in the current line preceding this node
		// TODO: length of widest line, not entire string
		if (singleLine.length <= maxLineWidth) {
			return singleLine
		} else {
			return format(ast, { indentation: indentation + 1, multiline: true })
		}
	}
	const fii = (ast: AST) => {
		const singleLine = format(ast, { indentation: indentation + 2, multiline: false })
		// TODO: factor in the current line preceding this node
		// TODO: length of widest line, not entire string
		if (singleLine.length <= maxLineWidth) {
			return singleLine
		} else {
			return format(ast, { indentation: indentation + 2, multiline: true })
		}
	}
	const indent = new Array(indentation).fill(indentationUnit).join('')
	const nextIndent = new Array(indentation + 1).fill(indentationUnit).join('')
	const nextNextIndent = new Array(indentation + 2).fill(indentationUnit).join('')

	const comments = ast.precedingComments?.map(f).join('\n\n') ?? ''

	const commaSeparated = (ast: AST[]) => {
		const singleLine = `${ast.map((e, i) => (i > 0 ? ', ' : '') + f(e)).join('')}`

		if (singleLine.length <= maxLineWidth) {
			return singleLine
		} else {
			return `\n${ast.map(e => `${nextIndent}${fi(e)},\n`).join('')}${indent}`
		}
	}

	switch (ast.kind) {
		case 'module': {
			const imports = ast.declarations
				.filter(d => d.kind === 'import-declaration')
				.sort((a, b) => a.uri.value.localeCompare(b.uri.value))

			const remoteImports = imports
				.filter(i => /^https?:/.test(i.uri.value))

			const localImports = imports
				.filter(i => !/^https?:/.test(i.uri.value))

			const nonImports = ast.declarations
				.filter(d => d.kind !== 'import-declaration')

			return comments
				+ remoteImports.map(f).join('\n') + (remoteImports.length > 0 ? '\n\n' : '')
				+ localImports.map(f).join('\n') + (localImports.length > 0 ? '\n\n' : '')
				+ nonImports.map(f).join('\n\n')
		}
		case 'import-declaration': return comments + `from ${f(ast.uri)} import { ${commaSeparated(ast.imports)} }`
		case 'import-item': return comments + `${f(ast.name)}${ast.alias ? ` as ${f(ast.alias)}` : ''}`
		case 'type-declaration': return comments + `${ast.exported ? 'export ' : ''}type ${f(ast.name)} = ${f(ast.type)}`
		case 'const-declaration': return comments + `${ast.exported ? 'export ' : ''}const ${f(ast.declared)} = ${f(ast.value)}`
		case 'typeof-type-expression': return comments + `typeof ${f(ast.expression)}`
		case 'function-type-expression': return comments + `(${commaSeparated(ast.params)}) => ${f(ast.returns)}`
		case 'union-type-expression': return comments + `${multiline ? '\n' : ''}${ast.members.map((e, i) => multiline ? `${nextIndent}| ${fi(e)}\n` : ((i > 0 ? ' | ' : '') + f(e))).join('')}${multiline ? indent : ''}`
		case 'generic-type-expression': return comments + `<${commaSeparated(ast.params)}>${f(ast.inner)}`
		case 'generic-type-parameter': return comments + `${f(ast.name)}${ast.extendz ? ` extends ${f(ast.extendz)}` : ''}`
		case 'parameterized-type-expression': return comments + `${f(ast.inner)}<${commaSeparated(ast.params)}>`
		case 'key-value': return comments + `${ast.key.kind === 'string-literal' && isValidIdentifier(ast.key.value) ? ast.key.value : f(ast.key)}: ${f(ast.value)}`
		case 'spread': return comments + `...${f(ast.spread)}`
		case 'string-type-expression': return comments + 'string'
		case 'number-type-expression': return comments + 'number'
		case 'boolean-type-expression': return comments + 'boolean'
		case 'unknown-type-expression': return comments + 'unknown'
		case 'markup-expression': {
			let res = ''

			res += indent + `<${ast.tag.identifier}${ast.props.map(p => ' ' + f(p)).join('')}>`
			res += ast.children.map(c => c.kind === 'markup-expression' ? fi(c) : '{' + fi(c) + '}').join('\n')
			res += indent + `</${ast.tag.identifier}>`

			return res
		}
		case 'markup-key-value': return comments + `${ast.key.identifier}={${f(ast.value)}}`
		case 'property-access-expression': return comments + `${f(ast.subject)}${ast.property.kind === 'string-literal' && isValidIdentifier(ast.property.value)
			? `.${ast.property.value}`
			: `[${f(ast.property)}]`}`
		case 'as-expression': return comments + `${f(ast.expression)} as ${f(ast.type)}`
		case 'function-expression': {
			const body = Array.isArray(ast.body) ? '{\n' + ast.body.map(s => nextIndent + fi(s)).join('\n') + '\n}' : f(ast.body)

			return comments + (
				ast.params.length === 1 && ast.params[0]?.type == null && ast.returnType == null
					? `${ast.params[0]!.name.identifier} => ${body}`
					: `(${commaSeparated(ast.params)})${ast.returnType ? `: ${f(ast.returnType)}` : ''} => ${body}`
			)
		}
		case 'name-and-type': return comments + f(ast.name) + (ast.type ? `: ${f(ast.type)}` : '')
		case 'invocation': return comments + `${f(ast.subject)}(${commaSeparated(ast.args)})`
		case 'binary-operation-expression': return comments + `${f(ast.left)} ${ast.op} ${f(ast.right)}`
		case 'if-else-expression': {
			return comments + (multiline ? '\n' + nextIndent : '') + `${ast.cases.map(multiline ? fi : f).join(' else ')}${ast.defaultCase ? ` else {${multiline ? '\n' : ''}${multiline ? `${nextNextIndent}${fi(ast.defaultCase)}` : f(ast.defaultCase)}${multiline ? '\n' + nextIndent : ''}}` : ''}`
		}
		case 'if-else-expression-case': return comments + `if ${f(ast.condition)} {${multiline ? '\n' : ''}${multiline ? `${nextIndent}${fi(ast.outcome)}` : f(ast.outcome)}${multiline ? '\n' + indent : ''}}`
		case 'parenthesis': return comments + `(${f(ast.inner)})`
		case 'object-literal': return comments + `{${!multiline ? ' ' : ''}${commaSeparated(ast.entries)}${!multiline ? ' ' : ''}}`
		case 'array-literal': return comments + `[${commaSeparated(ast.elements)}]`
		case 'string-literal': return comments + `'${ast.value}'`
		case 'number-literal': return comments + String(ast.value)
		case 'boolean-literal': return comments + String(ast.value)
		case 'nil-literal': return comments + 'nil'
		case 'comment': return comments + (
			ast.commentType === 'block'
				? '\n/**\n' + ast.comment.split('\n').map(line => ` * ${line}\n`).join('') + ' */\n'
				: `// ${ast.comment}\n`
		)
		case 'range': return comments + `${ast.start ? f(ast.start) : ''}..${ast.end ? f(ast.end) : ''}`
		case 'broken-subtree': return comments + ast.src.code.substring(ast.src.start, ast.src.end)
		case 'local-identifier':
		case 'plain-identifier':
			return comments + ast.identifier
	}
}