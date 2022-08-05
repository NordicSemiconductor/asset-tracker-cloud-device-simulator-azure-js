/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
export default {
	transform: {
		'^.+\\.(t|j)sx?$': ['@swc/jest'],
	},
	testEnvironment: 'node',
	testMatch: ['**/simulator/**/*.spec.ts'],
	extensionsToTreatAsEsm: ['.ts'],
	moduleNameMapper: {
		'^#simulator\\/(.*)\\.js$': '<rootDir>/simulator/$1',
	},
}
