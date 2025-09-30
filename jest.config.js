export default {
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {},
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js',
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/index.js',
    '!src/scripts/background.js', // Tested via integration tests
    '!src/scripts/content_script.js', // Tested via extracted logic
    '!src/options/options.js', // Tested via E2E
    '!src/scripts/sites/_template.js', // Template file, not used
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 70,
      lines: 65,
      statements: 65,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
};
