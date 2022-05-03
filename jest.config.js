/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
	transform: {
		'^.+\\.(t|j)sx?$': ['@swc/jest'],
	},
	testEnvironment: 'node',
	testMatch: ['**/src/**/*.spec.ts'],
}
