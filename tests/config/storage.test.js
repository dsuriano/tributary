import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { getFromStorage, setToStorage, removeFromStorage } from '../../src/config/storage.js';

describe('Storage Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
  });

  describe('getFromStorage', () => {
    test('should retrieve single key', async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        callback({ raindropToken: 'test-token' });
      });

      const result = await getFromStorage('raindropToken');
      
      expect(chrome.storage.local.get).toHaveBeenCalledWith(['raindropToken'], expect.any(Function));
      expect(result.raindropToken).toBe('test-token');
    });

    test('should retrieve multiple keys', async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        callback({
          raindropToken: 'test-token',
          defaultCollection: 12345,
        });
      });

      const result = await getFromStorage(['raindropToken', 'defaultCollection']);
      
      expect(chrome.storage.local.get).toHaveBeenCalledWith(
        ['raindropToken', 'defaultCollection'],
        expect.any(Function)
      );
      expect(result.raindropToken).toBe('test-token');
      expect(result.defaultCollection).toBe(12345);
    });

    test('should handle missing keys', async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });

      const result = await getFromStorage('nonexistent');
      
      expect(result).toEqual({});
    });

    test('should convert single key to array', async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        expect(Array.isArray(keys)).toBe(true);
        callback({});
      });

      await getFromStorage('singleKey');
      
      expect(chrome.storage.local.get).toHaveBeenCalledWith(['singleKey'], expect.any(Function));
    });
  });

  describe('setToStorage', () => {
    test('should save single value', async () => {
      chrome.storage.local.set.mockImplementation((items, callback) => {
        callback();
      });

      await setToStorage({ raindropToken: 'new-token' });
      
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        { raindropToken: 'new-token' },
        expect.any(Function)
      );
    });

    test('should save multiple values', async () => {
      chrome.storage.local.set.mockImplementation((items, callback) => {
        callback();
      });

      await setToStorage({
        raindropToken: 'new-token',
        defaultCollection: 12345,
        defaultTags: ['tag1', 'tag2'],
      });
      
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          raindropToken: 'new-token',
          defaultCollection: 12345,
          defaultTags: ['tag1', 'tag2'],
        }),
        expect.any(Function)
      );
    });

    test('should reject on error', async () => {
      chrome.storage.local.set.mockImplementation((items, callback) => {
        chrome.runtime.lastError = { message: 'Storage quota exceeded' };
        callback();
      });

      await expect(setToStorage({ key: 'value' })).rejects.toEqual({
        message: 'Storage quota exceeded',
      });
    });

    test('should resolve on success', async () => {
      chrome.storage.local.set.mockImplementation((items, callback) => {
        callback();
      });

      await expect(setToStorage({ key: 'value' })).resolves.toBeUndefined();
    });
  });

  describe('removeFromStorage', () => {
    test('should remove single key', async () => {
      chrome.storage.local.remove.mockImplementation((keys, callback) => {
        callback();
      });

      await removeFromStorage('raindropToken');
      
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(
        ['raindropToken'],
        expect.any(Function)
      );
    });

    test('should remove multiple keys', async () => {
      chrome.storage.local.remove.mockImplementation((keys, callback) => {
        callback();
      });

      await removeFromStorage(['raindropToken', 'defaultCollection']);
      
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(
        ['raindropToken', 'defaultCollection'],
        expect.any(Function)
      );
    });

    test('should convert single key to array', async () => {
      chrome.storage.local.remove.mockImplementation((keys, callback) => {
        expect(Array.isArray(keys)).toBe(true);
        callback();
      });

      await removeFromStorage('singleKey');
      
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['singleKey'], expect.any(Function));
    });

    test('should reject on error', async () => {
      chrome.storage.local.remove.mockImplementation((keys, callback) => {
        chrome.runtime.lastError = { message: 'Storage error' };
        callback();
      });

      await expect(removeFromStorage('key')).rejects.toEqual({
        message: 'Storage error',
      });
    });

    test('should resolve on success', async () => {
      chrome.storage.local.remove.mockImplementation((keys, callback) => {
        callback();
      });

      await expect(removeFromStorage('key')).resolves.toBeUndefined();
    });
  });
});
