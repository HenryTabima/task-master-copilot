/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    // Add any path mappings if needed
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Set up specific paths to mock
  modulePathIgnorePatterns: [
    'out',
    'dist'
  ],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  setupFilesAfterEnv: ['<rootDir>/src/jest.setup.ts'],
  globals: {
    'ts-jest': {
      isolatedModules: true
    }
  }
};
