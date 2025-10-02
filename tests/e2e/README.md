# E2E Tests

End-to-end tests for the Tributary extension using Playwright.

## Prerequisites

1. Build Tributary first:

   ```bash
   npm run build
   ```

2. Install Playwright browsers:
   ```bash
   npx playwright install chromium
   ```

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI mode (recommended for debugging)
npm run test:e2e:ui

# Run specific test file
npx playwright test tests/e2e/extension-setup.spec.js
```

## Writing E2E Tests

### Basic Structure

```javascript
import { test, expect } from './fixtures.js';

test('test name', async ({ context, extensionId }) => {
  // Your test code
});
```

### Available Fixtures

- `context`: Browser context with extension loaded
- `extensionId`: Tributary's ID (useful for navigating to extension pages)

### Testing on Real Sites

**Important**: E2E tests that interact with real websites (Twitter, YouTube, Reddit) should:

1. Use test accounts or mock pages
2. Not make actual API calls to Raindrop.io
3. Mock the background script responses

Example:

```javascript
test('should detect like button on Twitter', async ({ context, page }) => {
  // Navigate to a test Twitter page or mock HTML
  await page.goto('https://twitter.com/test');

  // Mock the background script response
  await page.evaluate(() => {
    chrome.runtime.sendMessage = async (msg) => {
      return { type: 'saveResult', status: 'success' };
    };
  });

  // Click like button
  await page.click('[data-testid="like"]');

  // Verify toast appears
  await expect(page.locator('.raindrop-toast--success')).toBeVisible();
});
```

## Limitations

- Extension tests require headed mode (headless: false)
- Tests run sequentially (workers: 1) to avoid conflicts
- Real website tests may be flaky due to UI changes

## Best Practices

1. **Build before testing**: Always run `npm run build` before E2E tests
2. **Mock API calls**: Don't make real API requests in tests
3. **Use data-testid**: Prefer stable selectors over classes
4. **Clean state**: Each test should be independent
5. **Timeouts**: Be generous with timeouts for extension loading
