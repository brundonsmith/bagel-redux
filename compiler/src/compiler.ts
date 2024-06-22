import { AST } from './parser'

export const compile = (ast: AST): string => {
	switch (ast.kind) {
		case 'module': return ast.declarations.map(compile).join('\n\n')
		case 'const-declaration': return `const ${compile(ast.name)}${ast.type ? `: ${compile(ast.type)}` : ''} = ${compile(ast.value)}`
		case 'union-type-expression': return ast.members.map(compile).join(' | ')
		case 'object-type-expression': return (
			Array.isArray(ast.entries)
				? `{ ${ast.entries.map(({ key, value }) => `${compile(key)}: ${compile(value)}`).join(', ')} }`
				: `Record<${compile(ast.entries.key)}, ${compile(ast.entries.value)}>`
		)
		case 'array-type-expression': return (
			Array.isArray(ast.elements)
				? `[${ast.elements.map(compile).join(', ')}]`
				: compile(ast.elements) + '[]'
		)
		case 'string-type-expression': return ast.value ? `'${ast.value}'` : 'string'
		case 'number-type-expression': return String(ast.value ?? 'number')
		case 'boolean-type-expression': return String(ast.value ?? 'boolean')
		case 'nil-type-expression': return 'null | undefined'
		case 'unknown-type-expression': return 'unknown'
		case 'object-literal': return `{ ${ast.entries.map(({ key, value }) => `${compile(key)}: ${compile(value)}`).join(', ')} }`
		case 'array-literal': return `[${ast.elements.map(compile).join(', ')}]`
		case 'string-literal': return `'${ast.value}'`
		case 'number-literal': return String(ast.value)
		case 'boolean-literal': return String(ast.value)
		case 'nil-literal': return 'null'
		case 'identifier': return ast.identifier
	}
}