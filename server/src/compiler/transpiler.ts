import { AST } from './parser'
import { todo } from './utils'

export const compile = (ast: AST): string => {
	switch (ast.kind) {
		case 'module': return ast.declarations.map(compile).join('\n\n')
		case 'const-declaration': return `const ${compile(ast.declared)} = ${compile(ast.value)}`
		case 'typeof-type-expression': return `typeof ${compile(ast.expression)}`
		case 'function-type-expression': return `(${ast.params.map((p, i) => `param${i}: ${compile(p)}`)}) => ${compile(ast.returns)}`
		case 'union-type-expression': return ast.members.map(compile).join(' | ')
		case 'key-value':
			return `${compile(ast.key)}: ${compile(ast.value)}`
		case 'spread':
			return `...${compile(ast.spread)}`
		case 'string-type-expression': return 'string'
		case 'number-type-expression': return 'number'
		case 'boolean-type-expression': return 'boolean'
		case 'unknown-type-expression': return 'unknown'
		case 'property-access-expression': return `${compile(ast.subject)}[${compile(ast.property)}]`
		case 'as-expression': return `${compile(ast.expression)} as ${compile(ast.type)}`
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
		case 'nil-literal': return NIL // TODO: in a type context, make it null | undefined?
		case 'range': return todo()
		case 'local-identifier':
		case 'plain-identifier':
			return ast.identifier
	}
}

const NIL = 'undefined'