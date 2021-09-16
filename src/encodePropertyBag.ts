export type PropertyBag = Record<string, string | null>
const encodeProperties = (properties: PropertyBag) =>
	Object.entries(properties)
		.sort(([k1], [k2]) => k2.localeCompare(k1))
		// Sort dollar properties at the end
		.sort(([k1]) => {
			return k1.startsWith('$') ? 1 : -1
		})
		.map(([k, v]) =>
			v === null
				? encodeURIComponent(k)
				: `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
		)
		.join('&')

export const encodePropertyBag = (properties?: PropertyBag): string => {
	if (properties === undefined) return ''
	const keys = Object.keys(properties)
	const values = Object.values(properties)
	if (keys.length === 0) return ''
	if (keys.length === 1 && values[0] === null) return `${keys[0]}`
	return `?${encodeProperties(properties)}`
}
