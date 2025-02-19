module.exports = {
  testTimeout: 10000, // Adjusted to 10 seconds as per user request
  maxWorkers: 1,
  forceExit: true,
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./jest.setup.js'],
  verbose: false,
  silent: false,
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: false,
  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",
  // A list of paths to directories that Jest should use to search for files in
  roots: [
    "<rootDir>/src"
  ],
  // The test pattern that Jest uses to detect test files
  testMatch: [
    "**/__tests__/**/*.[jt]s?(x)",
    "**/?(*.)+(spec|test).[tj]s?(x)"
  ],
  // An array of regexp pattern strings that are matched against all test paths before executing
  testPathIgnorePatterns: [
    "/node_modules/"
  ],
  reporters: [
    ["jest-silent-reporter", { 
      "useDots": false,
      "showWarnings": false,
      "showPaths": true,
      "showOnlyFailed": true
    }]
  ]
};
