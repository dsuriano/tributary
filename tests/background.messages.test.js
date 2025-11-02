import { describe, test, expect, beforeEach, vi } from 'vitest';

describe('Background onMessage Promise contract', () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    // Dynamically (re)import background to register the onMessage listener each test
    await import('../src/scripts/background.ts');
    const calls = global.chrome.runtime.onMessage.addListener.mock.calls;
    handler = calls[calls.length - 1][0];
    global.chrome.runtime.lastError = null;
  });

  test('validateToken returns { valid: true } when API ok', async () => {
    // Mock storage and fetch
    vi.spyOn(browser.storage.local, 'get').mockResolvedValue({
      raindropToken: 'valid-token'
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const res = await handler({ action: 'validateToken' }, { tab: undefined });
    expect(res).toEqual({ valid: true });
  });

  test('getCollections returns combined list', async () => {
    vi.spyOn(browser.storage.local, 'get').mockResolvedValue({ raindropToken: 'token' });
    const root = { ok: true, status: 200, json: async () => ({ items: [{ _id: 1, title: 'A' }] }) };
    const child = { ok: true, status: 200, json: async () => ({ items: [{ _id: 2, title: 'B' }] }) };
    const seq = [root, child];
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(seq.shift()));

    const res = await handler({ action: 'getCollections' }, { tab: undefined });
    expect(res).toEqual({ collections: [{ _id: 1, title: 'A' }, { _id: 2, title: 'B' }] });
  });

  test('save triggers tab message on success', async () => {
    vi.spyOn(browser.storage.local, 'get').mockResolvedValue({
      raindropToken: 'token',
      defaultTags: ['t'],
      defaultCollection: 123,
      debugLogging: false,
    });
    vi.spyOn(browser.storage.local, 'remove').mockResolvedValue();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: true }) });
    const sendSpy = vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue();

    const fakeTab = { id: 7 };
    const res = await handler({ action: 'save', data: { url: 'https://ex', title: 't', excerpt: 'e' } }, { tab: fakeTab });
    expect(res).toBeUndefined();
    expect(sendSpy).toHaveBeenCalledWith(7, expect.objectContaining({ type: 'saveResult', status: 'success' }));
  });
});
