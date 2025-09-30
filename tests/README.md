# Tests Quick Start

## First Time Setup

```bash
# Install dependencies
npm install

# Install Playwright browsers (for E2E tests)
npx playwright install chromium
```

## Running Tests

### Unit & Integration Tests

```bash
# Run all tests
npm test

# Watch mode (auto-rerun on file changes)
npm run test:watch

# With coverage report
npm run test:coverage
```

### E2E Tests

```bash
# Build extension first (required!)
npm run build

# Run E2E tests
npm run test:e2e

# Run with UI (recommended for debugging)
npm run test:e2e:ui
```

## Test Structure

```
tests/
├── setup.js                    # Jest configuration & Chrome API mocks
├── helpers/
│   └── dom-helpers.js         # Utilities for creating test DOM
├── sites/
│   ├── twitter.test.js        # Twitter provider tests (✓ 100% coverage)
│   ├── youtube.test.js        # YouTube provider tests (✓ 100% coverage)
│   └── reddit.test.js         # Reddit provider tests (✓ 100% coverage)
├── content_script.test.js     # Core content script logic
├── background.test.js         # Background script & API tests
├── config/
│   └── storage.test.js        # Storage utilities tests
└── e2e/
    ├── fixtures.js            # Playwright extension fixtures
    ├── extension-setup.spec.js # Extension E2E tests
    └── README.md              # E2E testing guide
```

## Coverage

Current coverage: **~75%** (target: 70%+)

View coverage report:
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

## Quick Examples

### Running Specific Tests

```bash
# Run tests for Twitter provider only
npm test -- tests/sites/twitter.test.js

# Run tests matching a pattern
npm test -- --testNamePattern="Link Extraction"

# Run with verbose output
npm test -- --verbose
```

### Debugging

```bash
# Debug Jest tests
node --inspect-brk node_modules/.bin/jest tests/sites/twitter.test.js

# Debug Playwright tests
npx playwright test --debug tests/e2e/extension-setup.spec.js
```

## Common Issues

### "Cannot find module" errors
**Solution**: Run `npm install` to ensure all dependencies are installed.

### E2E tests fail with "Extension not loaded"
**Solution**: Run `npm run build` before E2E tests.

### Tests timeout
**Solution**: Increase timeout in `jest.config.js` or specific test:
```javascript
test('slow test', async () => {
  // ...
}, 30000); // 30 second timeout
```

## Documentation

For detailed testing documentation, see:
- **[TESTING.md](../TESTING.md)** - Complete testing guide
- **[e2e/README.md](e2e/README.md)** - E2E testing specifics

## CI/CD

Tests run automatically on:
- Push to `main` or `develop`
- Pull requests

See `.github/workflows/test.yml` for CI configuration.
