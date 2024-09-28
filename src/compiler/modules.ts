import { readFile, stat, writeFile } from 'fs/promises'
import { ModuleAST, parseModule } from './parser'
import { input } from './parser-combinators'
import { join, resolve } from 'path'
import { walk as _walk } from '@nodelib/fs.walk'
import { promisify } from 'util'
import { exists } from './utils'

export type Module = {
	readonly uri: string,
	readonly isRemote: boolean,
	readonly target: ModulePlatform,

	readonly localPath: string,
	readonly code: string,
	readonly ast: ModuleAST,
}

export type ModulePlatform = 'browser' | 'node' | 'cross-platform'

export const loadModule = async (path: string): Promise<Module | undefined> => {
	if (!path.endsWith('.bgl')) {
		return undefined
	} else if (isRemoteUrl(path)) {
		return loadModuleFromRemoteUrl(path)
	} else {
		return loadModuleFromLocalPath(path)
	}
}

export const isRemoteUrl = (path: string) => path.startsWith('http://') || path.startsWith('https://')
export const isRelativePath = (path: string) => path.startsWith('.')

export const loadModuleFromRemoteUrl = async (remoteUrl: string): Promise<Module | undefined> => {
	const code = await fetch(remoteUrl).then(res => res.text())
	await writeFile(moduleCachePath(remoteUrl), code)
	return moduleFromPath(remoteUrl, code)
}

export const loadModuleFromLocalPath = async (localUrl: string): Promise<Module | undefined> => {
	const code = await readFile(localUrl)
	return moduleFromPath(localUrl, code.toString('utf-8'))
}

export const moduleFromPath = (uri: string, code: string): Module | undefined => {
	const result = parseModule(input(code))
	if (result?.kind !== 'success') {
		return undefined
	}

	const target = modulePlatformFromUri(uri)
	if (target == null) {
		return undefined
	}
	const isRemote = isRemoteUrl(uri)

	return {
		uri,
		isRemote,
		target,
		localPath: isRemote ? moduleCachePath(uri) : uri,
		code,
		ast: result.parsed
	}
}

const modulePlatformFromUri = (uri: string): ModulePlatform | undefined => {
	const dottedSegments = uri.split('.')
	if (dottedSegments[dottedSegments.length - 1] !== 'bgl') {
		return undefined // unknown file type
	}

	const secondToLast = dottedSegments[dottedSegments.length - 2]
	switch (secondToLast) {
		case 'browser':
		case 'node':
			return secondToLast
		default:
			return 'cross-platform'
	}
}

export const moduleFromSource = (path: string, ast: ModuleAST): Module => {

	return {
		uri: path,
		isRemote: false,
		target: 'cross-platform', // TODO
		localPath: path,
		code: ast.src.code,
		ast
	}
}

const walk = promisify(_walk)

export const targetedFiles = async (dir: string, followImports?: boolean) => {
	const isFile = (await stat(dir)).isFile()

	const entries = (
		isFile
			? [dir]
			: (await walk(dir)).map(e => e.path)
	)

	const entryModules = await Promise.all(entries.map(loadModule)).then(modules => modules.filter(exists))
	const moduleMap = new Map<string, Module>()
	for (const m of entryModules) {
		moduleMap.set(m.uri, m) // TODO
	}

	const loadImported = async (module: Module) => {
		for (const decl of module.ast.declarations) {
			if (decl.kind === 'import-declaration') {
				const path =
					isRelativePath(decl.uri.value)
						? resolve(module.uri, '../' + decl.uri.value)
						: decl.uri.value

				if (!moduleMap.has(path)) {
					const module = await loadModule(path)

					if (module) {
						moduleMap.set(path, module)
						await loadImported(module)
					}
				}
			}
		}
	}

	if (followImports) {
		for (const m of moduleMap.values()) {
			await loadImported(m)
		}
	}

	return moduleMap
}

export const moduleCachePath = (modulePath: string) => join(CACHE_DIR, moduleCacheName(modulePath))
const moduleCacheName = (modulePath: string) => encodeURIComponent(resolve(modulePath))

const CACHE_DIR_NAME = 'bagel'
const CACHE_DIR = (() => {
	switch (process.platform) {
		case 'darwin':
			return join(process.env.HOME!, 'Library/Caches', CACHE_DIR_NAME)
		case 'win32':
			return join(process.env.LOCALAPPDATA || join(process.env.USERPROFILE!, 'AppData/Local'), 'Cache', CACHE_DIR_NAME)
		default:
			return join(process.env.XDG_CACHE_HOME!, CACHE_DIR_NAME)
	}
})()