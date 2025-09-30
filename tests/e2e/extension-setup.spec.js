import { test, expect } from './fixtures.js';

/**
 * E2E tests for extension setup and configuration
 */

test.describe('Extension Setup', () => {
  test('should load extension successfully', async ({ context, extensionId }) => {
    expect(extensionId).toBeTruthy();
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  test('should have options page', async ({ context, extensionId }) => {
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/options.html`);
    
    await expect(optionsPage.locator('h2').first()).toContainText('API Token');
  });

  test('should display enabled domains in options', async ({ context, extensionId }) => {
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/options.html`);
    
    // Wait for domains to load
    await optionsPage.waitForSelector('#domains label', { timeout: 5000 });
    
    const domains = await optionsPage.locator('#domains label').count();
    expect(domains).toBeGreaterThan(0);
    
    // Check for expected domains
    await expect(optionsPage.locator('#domains')).toContainText('twitter.com');
    await expect(optionsPage.locator('#domains')).toContainText('youtube.com');
    await expect(optionsPage.locator('#domains')).toContainText('reddit.com');
  });

  test('should save settings', async ({ context, extensionId }) => {
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/options.html`);
    
    // Fill in token
    await optionsPage.fill('#token', 'test-token-12345');
    
    // Fill in tags
    await optionsPage.fill('#tags', 'test, automated');
    
    // Save button should be enabled after changes
    const saveButton = optionsPage.locator('#save');
    await expect(saveButton).toBeEnabled();
    
    // Note: Actual save would require mocking Raindrop API
    // For now, just verify the button is clickable
  });

  test('should toggle debug logging', async ({ context, extensionId }) => {
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/options.html`);
    
    const debugCheckbox = optionsPage.locator('#debugLogging');
    
    // Should be unchecked by default
    await expect(debugCheckbox).not.toBeChecked();
    
    // Check it
    await debugCheckbox.check();
    await expect(debugCheckbox).toBeChecked();
    
    // Save button should be enabled
    await expect(optionsPage.locator('#save')).toBeEnabled();
  });

  test('should toggle domain enablement', async ({ context, extensionId }) => {
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/options.html`);
    
    await optionsPage.waitForSelector('#domains input[type="checkbox"]', { timeout: 5000 });
    
    const firstCheckbox = optionsPage.locator('#domains input[type="checkbox"]').first();
    const initialState = await firstCheckbox.isChecked();
    
    // Toggle it
    await firstCheckbox.click();
    
    // State should change
    const newState = await firstCheckbox.isChecked();
    expect(newState).toBe(!initialState);
    
    // Save button should be enabled
    await expect(optionsPage.locator('#save')).toBeEnabled();
  });
});
