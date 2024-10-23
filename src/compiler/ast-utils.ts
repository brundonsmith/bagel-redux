import { AST } from './parser'
import { exists, profile } from './utils'

export const findASTNodeAtPosition = profile('findASTNodeAtPosition', (position: number, ast: AST): AST | undefined => {
	if (position < ast.src.start || position >= ast.src.end) {
		return undefined
	}

	const findIn = (ast: AST | AST[]): AST | undefined => {
		if (Array.isArray(ast)) {
			return ast.map(findIn).filter(exists)[0]
		} else {
			return findASTNodeAtPosition(position, ast)
		}
	}

	let childrenArray: Array<AST | undefined>
	switch (ast.kind) {
		case 'spread': childrenArray = [findIn(ast.spread)]; break
		case 'module': childrenArray = [findIn(ast.declarations)]; break
		case 'import-declaration': childrenArray = [findIn(ast.uri), findIn(ast.imports)]; break
		case 'import-item': childrenArray = [findIn(ast.name), ast.alias && findIn(ast.alias)]; break
		case 'type-declaration': childrenArray = [findIn(ast.name), ast.type]; break
		case 'const-declaration': childrenArray = [findIn(ast.declared), findIn(ast.value)]; break
		case 'typeof-type-expression': childrenArray = [findIn(ast.expression)]; break
		case 'function-type-expression': childrenArray = [findIn(ast.params), findIn(ast.returns)]; break
		case 'union-type-expression': childrenArray = [findIn(ast.members)]; break
		case 'parenthesis': childrenArray = [findIn(ast.inner)]; break
		case 'object-literal': childrenArray = [findIn(ast.entries)]; break
		case 'array-literal': childrenArray = [findIn(ast.elements)]; break
		case 'key-value': childrenArray = [findIn(ast.key), findIn(ast.value)]; break
		case 'markup-expression': childrenArray = [findIn(ast.tag), findIn(ast.props), findIn(ast.children)]; break
		case 'markup-key-value': childrenArray = [findIn(ast.key), findIn(ast.value)]; break
		case 'property-access-expression': childrenArray = [findIn(ast.subject), findIn(ast.property)]; break
		case 'as-expression': childrenArray = [findIn(ast.expression), findIn(ast.type)]; break
		case 'function-expression': childrenArray = [findIn(ast.params), ast.returnType && findIn(ast.returnType), findIn(ast.body)]; break
		case 'invocation': childrenArray = [findIn(ast.subject), findIn(ast.args)]; break
		case 'binary-operation-expression': childrenArray = [findIn(ast.left), findIn(ast.right)]; break
		case 'if-else-expression': childrenArray = [findIn(ast.cases), ast.defaultCase && findIn(ast.defaultCase)]; break
		case 'if-else-expression-case': childrenArray = [findIn(ast.condition), findIn(ast.outcome)]; break
		case 'name-and-type': childrenArray = [findIn(ast.name), ast.type && findIn(ast.type)]; break
		case 'range': childrenArray = [ast.start && findIn(ast.start), ast.end && findIn(ast.end)]; break
		case 'generic-type-expression': childrenArray = [ast.inner, findIn(ast.params)]; break
		case 'generic-type-parameter': childrenArray = [ast.name, ast.extendz && findIn(ast.extendz)]; break
		case 'parameterized-type-expression': childrenArray = [ast.inner, findIn(ast.params)]; break

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

export const visitAST = <TContext = never>(_ctx: TContext, ast: AST[] | AST | undefined, fn: (ast: AST, ctx: TContext) => TContext): TContext => {
	let ctx = _ctx
	const visit = (ast: AST[] | AST | undefined) => {
		ctx = visitAST(ctx, ast, fn)
	}

	if (Array.isArray(ast)) {
		for (const child of ast) {
			visit(child)
		}
	} else if (ast != null) {
		ctx = fn(ast, ctx)

		switch (ast.kind) {
			case 'module': {
				visit(ast.declarations)
			} break
			case 'import-declaration': {
				visit(ast.uri)
				visit(ast.imports)
			} break
			case 'import-item': {
				visit(ast.name)
				visit(ast.alias)
			} break
			case 'type-declaration': {
				visit(ast.name)
				visit(ast.type)
			} break
			case 'const-declaration': {
				visit(ast.declared)
				visit(ast.value)
			} break
			case 'typeof-type-expression': {
				visit(ast.expression)
			} break
			case 'function-type-expression': {
				visit(ast.params)
				visit(ast.returns)
			} break
			case 'union-type-expression': {
				visit(ast.members)
			} break
			case 'markup-expression': {
				visit(ast.tag)
				visit(ast.closingTag)
				visit(ast.props)
				visit(ast.children)
			} break
			case 'markup-key-value': {
				visit(ast.key)
				visit(ast.value)
			} break
			case 'property-access-expression': {
				visit(ast.subject)
				visit(ast.property)
			} break
			case 'as-expression': {
				visit(ast.expression)
				visit(ast.type)
			} break
			case 'function-expression': {
				visit(ast.params)
				visit(ast.returnType)
				visit(ast.body)
			} break
			case 'name-and-type': {
				visit(ast.name)
				visit(ast.type)
			} break
			case 'invocation': {
				visit(ast.subject)
				visit(ast.args)
			} break
			case 'binary-operation-expression': {
				visit(ast.left)
				visit(ast.right)
			} break
			case 'if-else-expression': {
				visit(ast.cases)
				visit(ast.defaultCase)
			} break
			case 'object-literal': {
				visit(ast.entries)
			} break
			case 'key-value': {
				visit(ast.key)
				visit(ast.value)
			} break
			case 'array-literal': {
				visit(ast.elements)
			} break
			case 'spread': {
				visit(ast.spread)
			} break
			case 'range': {
				visit(ast.start)
				visit(ast.end)
			} break
			case 'if-else-expression-case': {
				visit(ast.condition)
				visit(ast.outcome)
			} break
			case 'parenthesis': {
				visit(ast.inner)
			} break
			case 'generic-type-expression': {
				visit(ast.inner)
				visit(ast.params)
			} break
			case 'parameterized-type-expression': {
				visit(ast.inner)
				visit(ast.params)
			} break
			case 'generic-type-parameter': {
				visit(ast.name)
				visit(ast.extendz)
			} break
			case 'broken-subtree':
			case 'string-type-expression':
			case 'number-type-expression':
			case 'boolean-type-expression':
			case 'unknown-type-expression':
			case 'string-literal':
			case 'number-literal':
			case 'boolean-literal':
			case 'nil-literal':
			case 'local-identifier':
			case 'plain-identifier':
			case 'comment':
				break // nothing to check
			default:
				// @ts-expect-error kind should be of type `never`
				ast.kind
		}
	}

	return ctx
}
