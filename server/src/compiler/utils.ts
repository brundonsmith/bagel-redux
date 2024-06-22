
export const todo = (message?: string): any => {
	throw Error('TODO' + (message ? ': ' + message : ''))
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