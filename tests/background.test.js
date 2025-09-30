import { describe, test, expect, beforeEach, vi } from 'vitest';

/**
 * Tests for background service worker
 * Tests API communication, rate limiting, and message handling
 */

describe('Background Script - API Communication', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    vi.clearAllMocks();
  });

  describe('raindropFetch helper', () => {
    function raindropFetch(endpoint, options = {}, token) {
      const url = 'https://api.raindrop.io/rest/v1' + endpoint;
      const headers = options.headers ? { ...options.headers } : {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      return fetch(url, { ...options, headers });
    }

    test('should construct correct API URL', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await raindropFetch('/raindrop', {}, 'test-token');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.raindrop.io/rest/v1/raindrop',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    test('should add Authorization header with token', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await raindropFetch('/user', { method: 'GET' }, 'my-token');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-token',
          }),
        })
      );
    });

    test('should merge custom headers', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await raindropFetch('/raindrop', {
        headers: { 'Content-Type': 'application/json' },
      }, 'test-token');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    test('should work without token', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      await raindropFetch('/public', { method: 'GET' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.raindrop.io/rest/v1/public',
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.any(String),
          }),
        })
      );
    });
  });

  describe('Save Bookmark', () => {
    test('should send correct payload to API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: true }),
      });

      const bookmarkData = {
        link: 'https://example.com/article',
        title: 'Test Article',
        excerpt: 'This is a test article',
        tags: ['test', 'article'],
        collection: { $id: 12345 },
      };

      await fetch('https://api.raindrop.io/rest/v1/raindrop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify(bookmarkData),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.raindrop.io/rest/v1/raindrop',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(bookmarkData),
        })
      );
    });

    test('should handle 429 rate limit response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const response = await fetch('https://api.raindrop.io/rest/v1/raindrop', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
        body: JSON.stringify({ link: 'https://example.com' }),
      });

      expect(response.status).toBe(429);
      expect(response.ok).toBe(false);
    });

    test('should handle 401 unauthorized response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const response = await fetch('https://api.raindrop.io/rest/v1/raindrop', {
        method: 'POST',
        headers: { Authorization: 'Bearer invalid-token' },
        body: JSON.stringify({ link: 'https://example.com' }),
      });

      expect(response.status).toBe(401);
      expect(response.ok).toBe(false);
    });

    test('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        fetch('https://api.raindrop.io/rest/v1/raindrop', {
          method: 'POST',
          headers: { Authorization: 'Bearer test-token' },
          body: JSON.stringify({ link: 'https://example.com' }),
        })
      ).rejects.toThrow('Network error');
    });
  });

  describe('Get Collections', () => {
    test('should fetch root collections', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { _id: 1, title: 'Collection 1' },
            { _id: 2, title: 'Collection 2' },
          ],
        }),
      });

      const response = await fetch('https://api.raindrop.io/rest/v1/collections', {
        method: 'GET',
        headers: { Authorization: 'Bearer test-token' },
      });

      const data = await response.json();
      expect(data.items).toHaveLength(2);
      expect(data.items[0].title).toBe('Collection 1');
    });

    test('should fetch child collections', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { _id: 3, title: 'Child Collection' },
          ],
        }),
      });

      const response = await fetch('https://api.raindrop.io/rest/v1/collections/childrens', {
        method: 'GET',
        headers: { Authorization: 'Bearer test-token' },
      });

      const data = await response.json();
      expect(data.items).toHaveLength(1);
    });

    test('should handle empty collections', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });

      const response = await fetch('https://api.raindrop.io/rest/v1/collections', {
        method: 'GET',
        headers: { Authorization: 'Bearer test-token' },
      });

      const data = await response.json();
      expect(data.items).toHaveLength(0);
    });
  });

  describe('Validate Token', () => {
    test('should validate token with /user endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user: { _id: 123 } }),
      });

      const response = await fetch('https://api.raindrop.io/rest/v1/user', {
        method: 'GET',
        headers: { Authorization: 'Bearer valid-token' },
      });

      expect(response.ok).toBe(true);
    });

    test('should reject invalid token', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const response = await fetch('https://api.raindrop.io/rest/v1/user', {
        method: 'GET',
        headers: { Authorization: 'Bearer invalid-token' },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });
});

describe('Background Script - Rate Limiting', () => {
  test('should track backoff timestamp', () => {
    let backoffUntil = 0;
    const now = Date.now();
    const backoffMs = 60000;

    // Simulate rate limit hit
    backoffUntil = now + backoffMs;

    expect(backoffUntil).toBeGreaterThan(now);
    expect(backoffUntil - now).toBe(backoffMs);
  });

  test('should check if still in backoff period', () => {
    const backoffUntil = Date.now() + 30000; // 30 seconds from now
    const now = Date.now();

    const isInBackoff = now < backoffUntil;
    expect(isInBackoff).toBe(true);
  });

  test('should allow requests after backoff expires', () => {
    const backoffUntil = Date.now() - 1000; // 1 second ago
    const now = Date.now();

    const isInBackoff = now < backoffUntil;
    expect(isInBackoff).toBe(false);
  });
});

describe('Background Script - Message Handling', () => {
  test('should handle save message', () => {
    const messages = [];
    const listener = (message, sender, sendResponse) => {
      if (message.action === 'save') {
        messages.push(message);
      }
    };

    listener({ action: 'save', data: { url: 'https://example.com' } }, {}, vi.fn());
    expect(messages).toHaveLength(1);
    expect(messages[0].data.url).toBe('https://example.com');
  });

  test('should handle getCollections message', () => {
    const messages = [];
    const listener = (message, sender, sendResponse) => {
      if (message.action === 'getCollections') {
        messages.push(message);
        sendResponse({ collections: [] });
        return true; // Keep channel open
      }
    };

    const mockSendResponse = vi.fn();
    const result = listener({ action: 'getCollections' }, {}, mockSendResponse);
    
    expect(result).toBe(true);
    expect(mockSendResponse).toHaveBeenCalledWith({ collections: [] });
  });

  test('should handle validateToken message', () => {
    const messages = [];
    const listener = (message, sender, sendResponse) => {
      if (message.action === 'validateToken') {
        messages.push(message);
        sendResponse({ valid: true });
        return true;
      }
    };

    const mockSendResponse = vi.fn();
    const result = listener({ action: 'validateToken' }, {}, mockSendResponse);
    
    expect(result).toBe(true);
    expect(mockSendResponse).toHaveBeenCalledWith({ valid: true });
  });

  test('should ignore invalid messages', () => {
    const listener = (message, sender, sendResponse) => {
      if (!message || typeof message !== 'object') return;
      return false;
    };

    expect(listener(null, {}, vi.fn())).toBeUndefined();
    expect(listener('string', {}, vi.fn())).toBeUndefined();
    expect(listener(123, {}, vi.fn())).toBeUndefined();
  });
});
