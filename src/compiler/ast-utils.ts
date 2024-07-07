import { AST, Expression } from './parser'
import { profile } from './utils'

export const findASTNodeAtPosition = profile('findASTNodeAtPosition', (position: number, ast: AST): AST | undefined => {
	if (position < ast.src.start || position >= ast.src.end) {
		return undefined
	}

	const findIn = (ast: AST) => findASTNodeAtPosition(position, ast)

	let childrenArray: Array<AST | undefined>
	switch (ast.kind) {
		case 'spread': childrenArray = [findIn(ast.spread)]; break
		case 'module': childrenArray = [...ast.declarations.map(findIn)]; break
		case 'import-declaration': childrenArray = [findIn(ast.uri), ...ast.imports.map(findIn)]; break
		case 'import-item': childrenArray = [findIn(ast.name), ast.alias && findIn(ast.alias)]; break
		case 'type-declaration': childrenArray = [findIn(ast.name), ast.type]; break
		case 'const-declaration': childrenArray = [findIn(ast.declared), findIn(ast.value)]; break
		case 'typeof-type-expression': childrenArray = [findIn(ast.expression)]; break
		case 'function-type-expression': childrenArray = [...ast.params.map(findIn), findIn(ast.returns)]; break
		case 'union-type-expression': childrenArray = [...ast.members.map(findIn)]; break
		case 'parenthesis': childrenArray = [findIn(ast.inner)]; break
		case 'object-literal': childrenArray = [...ast.entries.map(findIn)]; break
		case 'array-literal': childrenArray = [...ast.elements.map(findIn)]; break
		case 'key-value': childrenArray = [findIn(ast.key), findIn(ast.value)]; break
		case 'property-access-expression': childrenArray = [findIn(ast.subject), findIn(ast.property)]; break
		case 'as-expression': childrenArray = [findIn(ast.expression), findIn(ast.type)]; break
		case 'function-expression': childrenArray = [...ast.params.map(findIn), ast.returnType && findIn(ast.returnType), findIn(ast.body)]; break
		case 'invocation': childrenArray = [findIn(ast.subject), ...ast.args.map(findIn)]; break
		case 'binary-operation-expression': childrenArray = [findIn(ast.left), findIn(ast.right)]; break
		case 'if-else-expression': childrenArray = [...ast.cases.map(findIn), ast.defaultCase && findIn(ast.defaultCase)]; break
		case 'if-else-expression-case': childrenArray = [findIn(ast.condition), findIn(ast.outcome)]; break
		case 'name-and-type': childrenArray = [findIn(ast.name), ast.type && findIn(ast.type)]; break
		case 'range': childrenArray = [ast.start && findIn(ast.start), ast.end && findIn(ast.end)]; break
		case 'generic-type-expression': childrenArray = [ast.inner, ...ast.params.map(findIn)]; break
		case 'generic-type-parameter': childrenArray = [ast.name, ast.extendz && findIn(ast.extendz)]; break

		// atomic; we've gotten there
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
		case 'comment':
		case 'broken-subtree':
			childrenArray = []
			break
	}

	childrenArray.push(ast)
	return childrenArray.filter(exists)[0]
})

const exists = <T>(x: T | null | undefined): x is T => x != null
