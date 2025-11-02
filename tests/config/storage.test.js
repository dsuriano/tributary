import { describe, test, expect, beforeEach, vi } from 'vitest';
import { getFromStorage, setToStorage, removeFromStorage } from '../../src/config/storage.ts';

describe('Storage Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.runtime.lastError = null;
  });

  describe('getFromStorage', () => {
    test('should retrieve single key', async () => {
      const spy = vi.spyOn(browser.storage.local, 'get').mockResolvedValue({ raindropToken: 'test-token' });

      const result = await getFromStorage('raindropToken');
      expect(spy).toHaveBeenCalledWith(['raindropToken']);
      expect(result.raindropToken).toBe('test-token');
    });

    test('should retrieve multiple keys', async () => {
      const spy = vi.spyOn(browser.storage.local, 'get').mockResolvedValue({
        raindropToken: 'test-token',
        defaultCollection: 12345,
      });

      const result = await getFromStorage(['raindropToken', 'defaultCollection']);
      expect(spy).toHaveBeenCalledWith(['raindropToken', 'defaultCollection']);
      expect(result.raindropToken).toBe('test-token');
      expect(result.defaultCollection).toBe(12345);
    });

    test('should handle missing keys', async () => {
      vi.spyOn(browser.storage.local, 'get').mockResolvedValue({});
      const result = await getFromStorage('nonexistent');
      expect(result).toEqual({});
    });

    test('should convert single key to array', async () => {
      const spy = vi.spyOn(browser.storage.local, 'get').mockResolvedValue({});
      await getFromStorage('singleKey');
      expect(spy).toHaveBeenCalledWith(['singleKey']);
    });
  });

  describe('setToStorage', () => {
    test('should save single value', async () => {
      const spy = vi.spyOn(browser.storage.local, 'set').mockResolvedValue();
      await setToStorage({ raindropToken: 'new-token' });
      expect(spy).toHaveBeenCalledWith({ raindropToken: 'new-token' });
    });

    test('should save multiple values', async () => {
      const spy = vi.spyOn(browser.storage.local, 'set').mockResolvedValue();
      await setToStorage({
        raindropToken: 'new-token',
        defaultCollection: 12345,
        defaultTags: ['tag1', 'tag2'],
      });
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        raindropToken: 'new-token',
        defaultCollection: 12345,
        defaultTags: ['tag1', 'tag2'],
      }));
    });

    test('should reject on error', async () => {
      vi.spyOn(browser.storage.local, 'set').mockRejectedValue({ message: 'Storage quota exceeded' });
      await expect(setToStorage({ key: 'value' })).rejects.toEqual({ message: 'Storage quota exceeded' });
    });

    test('should resolve on success', async () => {
      vi.spyOn(browser.storage.local, 'set').mockResolvedValue();
      await expect(setToStorage({ key: 'value' })).resolves.toBeUndefined();
    });
  });

  describe('removeFromStorage', () => {
    test('should remove single key', async () => {
      const spy = vi.spyOn(browser.storage.local, 'remove').mockResolvedValue();
      await removeFromStorage('raindropToken');
      expect(spy).toHaveBeenCalledWith(['raindropToken']);
    });

    test('should remove multiple keys', async () => {
      const spy = vi.spyOn(browser.storage.local, 'remove').mockResolvedValue();
      await removeFromStorage(['raindropToken', 'defaultCollection']);
      expect(spy).toHaveBeenCalledWith(['raindropToken', 'defaultCollection']);
    });

    test('should convert single key to array', async () => {
      const spy = vi.spyOn(browser.storage.local, 'remove').mockResolvedValue();
      await removeFromStorage('singleKey');
      expect(spy).toHaveBeenCalledWith(['singleKey']);
    });

    test('should reject on error', async () => {
      vi.spyOn(browser.storage.local, 'remove').mockRejectedValue({ message: 'Storage error' });
      await expect(removeFromStorage('key')).rejects.toEqual({ message: 'Storage error' });
    });

    test('should resolve on success', async () => {
      vi.spyOn(browser.storage.local, 'remove').mockResolvedValue();
      await expect(removeFromStorage('key')).resolves.toBeUndefined();
    });
  });
});
