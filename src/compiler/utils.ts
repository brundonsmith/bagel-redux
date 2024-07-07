
export const todo = (message?: string): any => {
	throw Error('TODO' + (message ? ': ' + message : ''))
}

export const given = <T, R>(val: T | undefined, fn: (val: T) => R): R | undefined => {
	if (val !== undefined) {
		return fn(val)
	}
}

export function zip<A, B>(arr1: A[], arr2: B[], mode: 'truncate'): Array<[A, B]>;
export function zip<A, B>(arr1: A[], arr2: B[], mode: 'left'): Array<[A, B | undefined]>;
export function zip<A, B>(arr1: A[], arr2: B[], mode: 'right'): Array<[A | undefined, B]>;
export function zip<A, B>(arr1: A[], arr2: B[], mode: 'fill'): Array<[A | undefined, B | undefined]>;
export function zip<A, B>(arr1: A[], arr2: B[], mode: 'truncate' | 'left' | 'right' | 'fill'): Array<[A | undefined, B | undefined]> {
	const res: Array<[A | undefined, B | undefined]> = []

	const end = (
		mode === 'fill' ? Math.max(arr1.length, arr2.length) :
			mode === 'left' ? arr1.length :
				mode === 'right' ? arr2.length :
					Math.min(arr1.length, arr2.length)
	)

	for (let i = 0; i < end; i++) {
		res.push([arr1[i], arr2[i]])
	}

	return res
}

let timings = new Map<string, number>()
let counts = new Map<string, number>()
let callStack: string[] = []
const add = (map: Map<string, number>, name: string, time: number) => map.set(name, (map.get(name) ?? 0) + time)
const pad = (str: string) => str + new Array(20 - str.length).fill(' ').join('')

const profilingEnabled = false

// eslint-disable-next-line @typescript-eslint/ban-types
export const profile = <F extends Function>(name: string, fn: F): F => {
	if (!profilingEnabled) return fn

	return ((...args: any[]) => {
		const isFirst = callStack.length === 0

		callStack.push(name)
		const start = Date.now()
		const result = fn(...args)
		const myRuntime = Date.now() - start
		callStack.pop()

		add(counts, name, 1)
		add(timings, name, myRuntime) // add this runtime to this function's record

		if (!isFirst) {
			add(timings, callStack[callStack.length - 1]!, -1 * myRuntime) // subtract this runtime from parent functions' records
		} else {
			// done with this root call
			const entries = Array.from(timings.entries()).sort(([_0, timeA], [_1, timeB]) => timeB - timeA)
			const total = entries.reduce((acc, [_, time]) => acc + time, 0)

			console.log(`${name} took ${total}ms`)
			for (const [name, time] of entries) {
				const count = counts.get(name)!
				const averageTime = time / count
				console.log(`  ${pad(name)} | ${(100 * time / total).toFixed(0)}% | ${count} | Avg ${averageTime}ms per call`)
			}

			timings = new Map()
			counts = new Map()
			callStack = []
		}

		return result
	}) as unknown as F
}

// eslint-disable-next-line @typescript-eslint/ban-types
export const log = <F extends Function>(name: string, fn: F): F => {

	return ((...args: any[]) => {
		const res = fn(...args)
		console.log(`${name}(${args.map(a => JSON.stringify(a)).join(', ')}) -> ${JSON.stringify(res)}`)
		return res
	}) as unknown as F
}