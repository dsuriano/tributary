# Testing Guide

This document describes the testing strategy and how to run tests for the Tributary extension.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Coverage Goals](#coverage-goals)
- [CI/CD Integration](#cicd-integration)

## Overview

The Tributary extension uses a multi-layered testing approach:

1. **Unit Tests** (Vitest) - Test individual functions and modules
2. **Integration Tests** (Vitest) - Test API communication and storage
3. **E2E Tests** (Playwright) - Test Tributary in a real browser

### Testing Stack

- **Vitest 3** - Unit and integration testing
- **@testing-library/dom** - DOM testing utilities
- **Playwright** - End-to-end browser testing
- **jsdom** - Browser environment simulation

## Test Structure

```
tests/
├── setup.js                    # Vitest setup and Chrome API mocks
├── helpers/
│   └── dom-helpers.js         # Reusable DOM creation utilities
├── sites/
│   ├── twitter.test.js        # Twitter provider tests
│   ├── youtube.test.js        # YouTube provider tests
│   └── reddit.test.js         # Reddit provider tests
├── content_script.test.js     # Core content script logic
├── background.test.js         # Background script and API tests
├── config/
│   └── storage.test.js        # Storage utility tests
└── e2e/
    ├── fixtures.js            # Playwright fixtures
    ├── extension-setup.spec.js # Extension setup E2E tests
    └── README.md              # E2E testing guide
```

## Running Tests

### Prerequisites

```bash
# Install dependencies
npm install
```

### Unit and Integration Tests

```bash
# Run all unit tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npm test -- tests/sites/twitter.test.js

# Run tests matching a pattern
npm test -- --testNamePattern="Twitter Provider"
```

### E2E Tests

```bash
# Build Tributary first (required!)
npm run build

# Install Playwright browsers (first time only)
npx playwright install chromium

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI (recommended for debugging)
npm run test:e2e:ui
```

## Writing Tests

### Unit Tests

#### Testing Site Providers

```javascript
import { describe, test, expect, beforeEach } from 'vitest';
import twitter from '../../src/scripts/sites/twitter.js';
import { createTwitterPost, setToggleState } from '../helpers/dom-helpers.js';

describe('Twitter Provider', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('should detect like button', () => {
    const post = createTwitterPost();
    document.body.appendChild(post);

    const button = document.querySelector('[data-testid="like"]');
    expect(button).not.toBeNull();
  });
});
```

#### Testing Core Logic

```javascript
describe('Link Extraction', () => {
  test('should extract external link', () => {
    const article = document.createElement('article');
    const link = document.createElement('a');
    link.href = 'https://example.com/article';
    article.appendChild(link);

    // Test your extraction logic
  });
});
```

### Integration Tests

```javascript
describe('Background Script - API', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  test('should save bookmark to API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: true }),
    });

    // Test API call
  });
});
```

### E2E Tests

```javascript
import { test, expect } from './fixtures.js';

test('should load extension', async ({ context, extensionId }) => {
  expect(extensionId).toBeTruthy();

  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options/options.html`);

  await expect(optionsPage.locator('h2').first()).toBeVisible();
});
```

## Test Helpers

### DOM Helpers

The `tests/helpers/dom-helpers.js` file provides utilities for creating mock DOM structures:

```javascript
import { createTwitterPost, createYouTubeVideo, createRedditPost } from '../helpers/dom-helpers.js';

// Create a Twitter post with custom data
const post = createTwitterPost({
  tweetId: '123456',
  username: 'testuser',
  text: 'Test tweet',
  hasExternalLink: true,
  externalUrl: 'https://example.com',
});

// Create a YouTube video
const video = createYouTubeVideo({
  videoId: 'abc123',
  title: 'Test Video',
  description: 'Test description',
});

// Create a Reddit post
const post = createRedditPost({
  postId: 'xyz789',
  subreddit: 'test',
  title: 'Test Post',
  body: 'Post content',
});
```

### Simulating User Interactions

```javascript
import { simulateClick, setToggleState } from '../helpers/dom-helpers.js';

// Simulate a click
const button = document.querySelector('button');
simulateClick(button);

// Set toggle state
setToggleState(button, true); // aria-pressed="true"
```

## Coverage Goals

Current coverage thresholds (defined in `vitest.config.ts`):

- **Branches**: 60%
- **Functions**: 60%
- **Lines**: 70%
- **Statements**: 70%

### Viewing Coverage

```bash
npm run test:coverage
```

Coverage reports are generated in:

- `coverage/lcov-report/index.html` - HTML report (open in browser)
- `coverage/lcov.info` - LCOV format (for CI tools)

### Coverage by Module

| Module            | Target Coverage | Priority |
| ----------------- | --------------- | -------- |
| Site Providers    | 80%+            | High     |
| Content Script    | 70%+            | High     |
| Background Script | 75%+            | High     |
| Storage Utilities | 90%+            | Medium   |
| Constants         | 100%            | Low      |

## CI/CD Integration

### GitHub Actions

Tests run automatically on:

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

Workflow: `.github/workflows/test.yml`

#### Jobs

1. **unit-tests** - Runs Vitest tests with coverage
2. **build-test** - Verifies extension builds successfully
3. **e2e-tests** - Runs Playwright E2E tests

### Local Pre-commit Testing

Recommended workflow before committing:

```bash
# 1. Run unit tests
npm test

# 2. Check coverage
npm run test:coverage

# 3. Build extension
npm run build

# 4. Run E2E tests (optional but recommended)
npm run test:e2e
```

## Debugging Tests

### Vitest Tests

```bash
# Run with verbose output
npm test -- --verbose

# Run single test file with debugging
npx vitest tests/sites/twitter.test.js

# Use console.log in tests (will show in output)
test('debug test', () => {
  console.log('Debug info:', someVariable);
  expect(true).toBe(true);
});
```

### Playwright Tests

```bash
# Run with UI mode (best for debugging)
npm run test:e2e:ui

# Run with headed browser
npx playwright test --headed

# Debug specific test
npx playwright test --debug tests/e2e/extension-setup.spec.js
```

## Common Issues

### Vitest: "Cannot use import statement outside a module"

**Solution**: Ensure `"type": "module"` is in `package.json`. Vitest handles ES modules natively.

### Playwright: "Extension not loaded"

**Solution**:

1. Run `npm run build` before E2E tests
2. Check that `dist/` directory exists and contains built files
3. Verify `manifest.json` is in `dist/`

### Chrome API Mocks Not Working

**Solution**: Check `tests/setup.js` - all Chrome APIs should be mocked there. Add missing APIs as needed:

```javascript
global.chrome.someNewAPI = {
  method: vi.fn(),
};
```

### Tests Timing Out

**Solution**: Increase timeout in test or config:

```javascript
// In specific test
test('slow test', async () => {
  // ...
}, 30000); // 30 second timeout

// In vitest.config.ts
testTimeout: 10000, // 10 seconds default
```

## Best Practices

### 1. Test Behavior, Not Implementation

❌ **Bad**:

```javascript
test('should call extractLink function', () => {
  const spy = vi.spyOn(module, 'extractLink');
  // ...
  expect(spy).toHaveBeenCalled();
});
```

✅ **Good**:

```javascript
test('should extract external link from post', () => {
  const post = createTwitterPost({ hasExternalLink: true });
  const result = getPermalink(post);
  expect(result).toBe('https://example.com');
});
```

### 2. Use Descriptive Test Names

❌ **Bad**:

```javascript
test('test 1', () => {
  /* ... */
});
```

✅ **Good**:

```javascript
test('should extract tweet permalink and remove query parameters', () => {
  /* ... */
});
```

### 3. Arrange-Act-Assert Pattern

```javascript
test('should save bookmark', () => {
  // Arrange
  const post = createTwitterPost();
  document.body.appendChild(post);

  // Act
  const button = document.querySelector('[data-testid="like"]');
  simulateClick(button);

  // Assert
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'save' })
  );
});
```

### 4. Clean Up After Tests

```javascript
beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});
```

### 5. Test Edge Cases

```javascript
describe('Link Extraction', () => {
  test('should handle normal case', () => {
    /* ... */
  });
  test('should handle no links', () => {
    /* ... */
  });
  test('should handle malformed URLs', () => {
    /* ... */
  });
  test('should handle null container', () => {
    /* ... */
  });
});
```

## Resources

- [Vitest Documentation](https://vitest.dev/guide/)
- [Testing Library](https://testing-library.com/docs/)
- [Playwright Documentation](https://playwright.dev/)
- [Chrome Extension Testing](https://developer.chrome.com/docs/extensions/mv3/tut_testing/)

## Contributing

When adding new features:

1. Write tests first (TDD approach recommended)
2. Ensure all tests pass: `npm test`
3. Maintain coverage above thresholds
4. Add E2E tests for user-facing features
5. Update this guide if adding new test patterns
