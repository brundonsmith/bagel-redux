import { ModuleAST } from './parser'

export type Module = {
	remoteUrl: string | undefined,
	localFilePath: string,
	code: string,
	ast: ModuleAST,
	target: 'client' | 'server' | undefined
}