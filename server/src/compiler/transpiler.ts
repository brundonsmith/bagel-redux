import { AST } from './parser'
import { todo } from './utils'

export const compile = (ast: AST): string => {
	switch (ast.kind) {
		case 'module': return ast.declarations.map(compile).join('\n\n')
		case 'const-declaration': return `const ${compile(ast.declared)} = ${compile(ast.value)}`
		case 'typeof-type-expression': return `typeof ${compile(ast.expression)}`
		case 'function-type-expression': return `(${ast.params.map((p, i) => `param${i}: ${compile(p)}`)}) => ${compile(ast.returns)}`
		case 'union-type-expression': return ast.members.map(compile).join(' | ')
		case 'object-type-expression': return (
			Array.isArray(ast.entries)
				? `{ ${ast.entries.map(compile).join(', ')} }`
				: `Record<${compile(ast.entries.key)}, ${compile(ast.entries.value)}>`
		)
		case 'array-type-expression': return (
			Array.isArray(ast.elements)
				? `[${ast.elements.map(compile).join(', ')}]`
				: compile(ast.elements) + '[]'
		)
		case 'key-value-type-expression':
		case 'key-value-expression':
			return `${compile(ast.key)}: ${compile(ast.value)}`
		case 'spread-type-expression':
		case 'spread-expression':
			return `...${compile(ast.spread)}`
		case 'string-type-expression': return ast.value ? `'${ast.value}'` : 'string'
		case 'number-type-expression': return String(ast.value ?? 'number')
		case 'boolean-type-expression': return String(ast.value ?? 'boolean')
		case 'nil-type-expression': return 'null | undefined'
		case 'unknown-type-expression': return 'unknown'
		case 'function-expression': return todo()
		case 'name-and-type': return compile(ast.name) + (ast.type ? `: ${compile(ast.type)}` : '')
		case 'invocation': return `${compile(ast.subject)}(${ast.args.map(compile).join(', ')})`
		case 'binary-operation-expression': return `${compile(ast.left)} ${ast.op} ${compile(ast.right)}`
		case 'if-else-expression': return `${ast.cases.map(compile).join('')} ${ast.defaultCase ? compile(ast.defaultCase) : NIL}`
		case 'if-else-expression-case': return `${compile(ast.condition)} ? ${compile(ast.outcome)} :`
		case 'object-literal': return `{ ${ast.entries.map(compile).join(', ')} }`
		case 'array-literal': return `[${ast.elements.map(compile).join(', ')}]`
		case 'string-literal': return `'${ast.value}'`
		case 'number-literal': return String(ast.value)
		case 'boolean-literal': return String(ast.value)
		case 'nil-literal': return NIL
		case 'local-identifier':
		case 'plain-identifier':
			return ast.identifier
	}
}

const NIL = 'undefined'