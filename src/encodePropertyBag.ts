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

/**
 * Encode a property bag.
 *
 * According to the Azure support the device should not
 * include the question mark to prefix property bags:
 *
 * > After some research together with the engineering team
 * > and we want to inform you that property_bag should not
 * > start with the question mark, otherwise the question
 * > mark would be considered a part of the first property
 * > name.
 * >
 * > Currently the system expects the property_bag to have
 * > the following format (without any question marks):
 * >
 * > `RFC 2396-encoded(<PropertyName1>)=RFC 2396-encoded(<PropertyValue1>)&RFC 2396-encoded(<PropertyName2>)=RFC 2396-encoded(<PropertyValue2>)…`
 *
 * This contradicts their own documentation at
 * https://docs.microsoft.com/en-us/azure/iot-hub/iot-hub-mqtt-support#receiving-cloud-to-device-messages
 * which shows the example as
 *
 * > `/?prop1&prop2=&prop3=a%20string`
 */
export const encodePropertyBag = (properties?: PropertyBag): string => {
	if (properties === undefined) return ''
	const keys = Object.keys(properties)
	const values = Object.values(properties)
	if (keys.length === 0) return ''
	if (keys.length === 1 && values[0] === null) return `${keys[0]}`
	return encodeProperties(properties)
}
