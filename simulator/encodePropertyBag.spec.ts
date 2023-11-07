import { describe, test as it } from 'node:test'
import assert from 'node:assert'
import { encodePropertyBag } from './encodePropertyBag.js'

describe('encodePropertyBag', () => {
	for (const input of [undefined, {}]) {
		it('should return an empty string for %j', () => {
			assert.equal(encodePropertyBag(input as any), '')
		})
	}
	it('should encode a single nulled property', () => {
		assert.equal(encodePropertyBag({ batch: null }), 'batch')
	})

	describe('it should encode properties', () => {
		for (const [props, expected] of [
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
		] as [
			(
				| {
						prop1: null
						prop2: string
						prop3: string
				  }
				| {
						'$.ct': string
						'$.ce': string
				  }
			),
			string,
		][]) {
			it('%j => %s', () => {
				assert.equal(encodePropertyBag(props), expected)
			})
		}
	})
	describe('it should sort $ properties to the end', () => {
		for (const [input, expected] of [
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
		] as [
			(
				| {
						'$.ct': string
						'$.ce': string
						prop1: null
				  }
				| {
						'$.ct': string
						prop1: null
						'$.ce': string
						prop3: string
				  }
			),
			string,
		][]) {
			it('%j => %s', () => {
				assert.equal(encodePropertyBag(input), expected)
			})
		}
	})
})
