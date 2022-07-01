import { encodePropertyBag } from './encodePropertyBag'

describe('encodePropertyBag', () => {
	it.each([undefined, {}])('should return an empty string for %j', (bag) =>
		expect(encodePropertyBag(bag as any)).toEqual(''),
	)
	it('should encode a single nulled property', () =>
		expect(encodePropertyBag({ batch: null })).toEqual('batch'))

	describe('it should encode properties', () => {
		it.each([
			// Sample from https://docs.microsoft.com/en-us/azure/iot-hub/iot-hub-mqtt-support#receiving-cloud-to-device-messages
			// Note: "?" is not included.
			[
				{
					prop1: null,
					prop2: '',
					prop3: 'a string',
				},
				'prop1&prop2=&prop3=a%20string',
			],
			[
				{
					'$.ct': 'application/json',
					'$.ce': 'utf-8',
				},
				'%24.ct=application%2Fjson&%24.ce=utf-8',
			],
		])('%j => %s', (props, expected) =>
			expect(encodePropertyBag(props)).toEqual(expected),
		)
	})
	describe('it should sort $ properties to the end', () => {
		it.each([
			[
				{
					'$.ct': 'application/json',
					'$.ce': 'utf-8',
					prop1: null,
				},
				'prop1&%24.ct=application%2Fjson&%24.ce=utf-8',
			],
			[
				{
					'$.ct': 'application/json',
					prop1: null,
					'$.ce': 'utf-8',
					prop3: 'a string',
				},
				'prop1&prop3=a%20string&%24.ct=application%2Fjson&%24.ce=utf-8',
			],
		])('%j => %s', (props, expected) =>
			expect(encodePropertyBag(props)).toEqual(expected),
		)
	})
})
