/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	type DocumentDiagnosticReport
} from 'vscode-languageserver/node'

import {
	TextDocument
} from 'vscode-languageserver-textdocument'
import { AST, parseModule } from './compiler/parser'
import { check, typeScopeFromModule, valueScopeFromModule } from './compiler/checker'
import { getCompletions } from './compiler/completions'
import { InferTypeContext, Type, declarationType, displayType, inferType, literal, resolveType, resolveTypeDeclaration, resolveValueDeclaration, typeDeclarationType } from './compiler/types'
import { findASTNodeAtPosition } from './compiler/ast-utils'
import { exists, given } from './compiler/utils'
import { text } from 'stream/consumers'
import { fullPath, loadImported, loadModuleFile, Module, moduleFromPath, targetedFiles } from './compiler/modules'

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all)

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)

let hasConfigurationCapability = false
let hasWorkspaceFolderCapability = false
let hasDiagnosticRelatedInformationCapability = false

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	)
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	)
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	)

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true
			},
			hoverProvider: {},
			inlayHintProvider: {},
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false
			}
		}
	}
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		}
	}
	return result
})

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined)
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.')
		})
	}
})

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 }
let globalSettings: ExampleSettings = defaultSettings

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map()

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear()
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.languageServerExample || defaultSettings)
		)
	}
	// Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
	// We could optimize things here and re-fetch the setting first can compare it
	// to the existing setting, but this is out of scope for this example.
	connection.languages.diagnostics.refresh()
})

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri)
})

connection.languages.diagnostics.on(async (params) => {
	const document = documents.get(params.textDocument.uri)
	if (document !== undefined) {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: await validateTextDocument(document)
		} satisfies DocumentDiagnosticReport
	} else {
		// We don't know the document. We can either try to read it from disk
		// or we don't report problems for it.
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: []
		} satisfies DocumentDiagnosticReport
	}
})

connection.languages.inlayHint.on(async (params) => {
	const uri = params.textDocument.uri.substring('file://'.length)
	const modules = await targetedDocuments(uri)
	const thisModule = modules.get(uri)

	const document = documents.get(params.textDocument.uri)
	if (document && thisModule) {
		const ctx: InferTypeContext = {
			target: thisModule.target,
			resolveModule: path => modules.get(fullPath(uri, path))
		}

		try {
			return thisModule.ast.declarations
				.map(decl => {
					if (decl.kind === 'const-declaration') {
						const type = inferType(ctx, decl.value)

						if (decl.value.kind === 'function-expression') {
							if (decl.value.returnType == null) {
								return {
									label: `: ${displayType({ typeScope: typeScopeFromModule(ctx, thisModule.ast), valueScope: valueScopeFromModule(ctx, thisModule.ast) }, { kind: 'return-type', subject: type })}`,
									position: document.positionAt(given(decl.value.params[decl.value.params.length - 1], last => last.src.end + 1) ?? decl.value.src.start + 2) // HACK
								}
							}
						} else {
							if (decl.declared.type == null) {
								return {
									label: `: ${displayType({ typeScope: typeScopeFromModule(ctx, thisModule.ast), valueScope: valueScopeFromModule(ctx, thisModule.ast) }, type)}`,
									position: document.positionAt(decl.declared.name.src.end)
								}
							}
						}
					}
				})
				.filter(exists)
		} catch (e) {
			console.error(e)
		}
	}

	return undefined
})

// export interface InlineCompletionItem {
//     /**
//      * The text to replace the range with. Must be set.
//      */
//     insertText: string | StringValue;
//     /**
//      * A text that is used to decide if this inline completion should be shown. When `falsy` the {@link InlineCompletionItem.insertText} is used.
//      */
//     filterText?: string;
//     /**
//      * The range to replace. Must begin and end on the same line.
//      */
//     range?: Range;
//     /**
//      * An optional {@link Command} that is executed *after* inserting this completion.
//      */
//     command?: Command;
// }

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
// documents.onDidChangeContent(change => {
// 	validateTextDocument(change.document)
// })

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri)

	const uri = textDocument.uri.substring('file://'.length)
	const modules = await targetedDocuments(uri)
	console.log(modules)
	const thisModule = modules.get(uri)

	// TODO: Changes in the other file won't update current file until they're
	// saved and then it also changes

	if (thisModule) {
		const diagnostics: Diagnostic[] = []

		try {
			check(
				{
					error: e => diagnostics.push({
						severity: DiagnosticSeverity.Error,
						range: {
							start: textDocument.positionAt(e.src.start),
							end: textDocument.positionAt(e.src.end)
						},
						message: e.message,
						relatedInformation: e.details?.map(({ message, src }) => ({
							message,
							location: {
								uri: textDocument.uri,
								range: {
									start: textDocument.positionAt(src.start),
									end: textDocument.positionAt(src.end)
								}
							},
						}))
					}),
					resolveModule: path => modules.get(fullPath(uri, path)),
					target: 'cross-platform' // TODO
				},
				thisModule.ast
			)

			return diagnostics
		} catch (e) {
			console.error(e)
			return [
				{
					severity: DiagnosticSeverity.Error,
					range: {
						start: textDocument.positionAt(0),
						end: textDocument.positionAt(text.length)
					},
					message: 'Error thrown while checking module:\n' + (e as Error).message + '\n' + (e as Error).stack
				}
			]
		}
	} else {
		return [
			{
				severity: DiagnosticSeverity.Error,
				range: {
					start: textDocument.positionAt(0),
					end: textDocument.positionAt(textDocument.getText().length)
				},
				// range: {
				// 	start: textDocument.positionAt(parsed?.input.index ?? 0),
				// 	end: textDocument.positionAt(text.length)
				// },
				message: 'Failed to parse module' // TODO: Bubble real errors
			}
		]
	}
}

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings)
	}
	let result = documentSettings.get(resource)
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'languageServerExample'
		})
		documentSettings.set(resource, result)
	}
	return result
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received a file change event')
})

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(params: TextDocumentPositionParams): CompletionItem[] => {
		const document = documents.get(params.textDocument.uri)
		if (document !== undefined) {
			const result = parseModule({ code: document.getText(), index: 0 })

			if (result?.kind === 'success') {
				const completions = getCompletions(result.parsed, document.offsetAt(params.position))

				return completions.map((c, i) => ({
					label: c.text,
					kind: CompletionItemKind.Text,
					data: c.text
				}))
			}
		}

		return []
	}
)

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.data === 1) {
			item.detail = 'TypeScript details'
			item.documentation = 'TypeScript documentation'
		} else if (item.data === 2) {
			item.detail = 'JavaScript details'
			item.documentation = 'JavaScript documentation'
		}
		return item
	}
)

connection.onHover(async (params) => {
	const uri = params.textDocument.uri.substring('file://'.length)
	const modules = await targetedDocuments(uri)
	const thisModule = modules.get(uri)

	const document = documents.get(params.textDocument.uri)
	if (document && thisModule) {
		const ctx: InferTypeContext = {
			target: thisModule.target,
			resolveModule: path => modules.get(fullPath(uri, path))
		}

		try {
			const selection = findASTNodeAtPosition(document.offsetAt(params.position), thisModule.ast)

			const type: Type | undefined = (
				selection?.kind === 'plain-identifier' && selection.parent?.kind === 'import-item' ? declarationType(ctx, selection.parent) :
					selection?.kind === 'plain-identifier' && selection.parent?.parent?.kind === 'const-declaration' ? inferType(ctx, selection.parent.parent.value) :
						selection?.kind === 'plain-identifier' && selection.parent?.kind === 'type-declaration' ? resolveType(ctx, selection.parent.type) :
							selection?.kind === 'string-literal' && selection.parent?.kind === 'property-access-expression' ? inferType(ctx, selection.parent) :
								selection?.kind === 'local-identifier' && selection.context === 'expression' ? declarationType(ctx, resolveValueDeclaration(ctx, selection.identifier, selection, selection)) :
									selection?.kind === 'local-identifier' && selection.context === 'type-expression' ? typeDeclarationType(ctx, resolveTypeDeclaration(selection.identifier, selection)) :
										selection?.kind === 'plain-identifier' && selection.parent?.kind === 'name-and-type' && selection.parent.parent?.kind === 'function-expression' ? {
											kind: 'property-type',
											subject: {
												kind: 'parameters-type',
												subject: inferType(ctx, selection.parent.parent),
											},
											property: literal(selection.parent.parent.params.indexOf(selection.parent))
										} :
											// @ts-expect-error dsfghjdfgh
											given(findParentWhere(selection, ast => ast.context === 'expression' || ast.context === 'type-expression'), ast => ast.context === 'expression' ? inferType(ast) : resolveType(ast))
			)

			if (type) {
				return {
					contents: {
						kind: 'plaintext',
						language: 'bagel',
						value: displayType({ typeScope: typeScopeFromModule(ctx, thisModule.ast), valueScope: valueScopeFromModule(ctx, thisModule.ast) }, type)
					}
				}
			}

		} catch (e) {
			console.error(e)
		}
	}

	return undefined
})

const findParentWhere = (ast: AST | undefined, fn: (ast: AST) => boolean): AST | undefined => {
	let current: AST | undefined = ast
	while (current != null) {
		if (fn(current)) {
			return current
		} else[
			current = current.parent
		]
	}
}

const targetedDocuments = async (uri: string): Promise<Map<string, Module>> => {
	const map = new Map<string, Module>()

	const loadModule = async (uri: string) => {
		const document = documents.get(`file://${uri}`)
		if (document) {
			return moduleFromPath(uri, document.getText())
		} else {
			return loadModuleFile(uri)
		}
	}

	const thisModule = await loadModule(uri)
	if (thisModule) {
		map.set(uri, thisModule)
		await loadImported(map, thisModule, loadModule)
	}
	return map
}

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection)

// Listen on the connection
connection.listen()
