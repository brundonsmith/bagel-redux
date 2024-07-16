/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path'
import { workspace, ExtensionContext, languages, TextEdit, TextDocument, Position, Range } from 'vscode'

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node'
import { parseModule } from './compiler/parser'
import { input } from './compiler/parser-combinators'
import { format } from './compiler/formatter'

let client: LanguageClient

export function activate(context: ExtensionContext) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('out', 'server.js')
	)

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
		}
	}

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{ scheme: 'file', language: 'bagel' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	}

	// Create the language client and start the client.
	client = new LanguageClient(
		'bagel',
		'Bagel',
		serverOptions,
		clientOptions
	)

	languages.registerDocumentFormattingEditProvider('bagel', {
		provideDocumentFormattingEdits(document: TextDocument): TextEdit[] {
			const source = document.getText()
			const parsed = parseModule(input(source))

			if (parsed?.kind === 'success') {
				const formatted = format(parsed.parsed)
				return [TextEdit.replace(new Range(document.positionAt(0), document.positionAt(source.length)), formatted)]
			}

			return []
		}
	})

	// Start the client. This will also launch the server
	client.start()
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined
	}
	return client.stop()
}
