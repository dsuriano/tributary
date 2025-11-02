import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Chrome Extension APIs
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    getURL: (path) => `chrome-extension://test-extension-id/${path}`,
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    lastError: null,
  },
  storage: {
    local: {
      get: vi.fn((keys, callback) => {
        callback({});
      }),
      set: vi.fn((items, callback) => {
        if (callback) callback();
      }),
      remove: vi.fn((keys, callback) => {
        if (callback) callback();
      }),
    },
  },
  tabs: {
    sendMessage: vi.fn(),
  },
};

// Provide a Promise-based browser API that delegates to the chrome mocks above
global.browser = {
  runtime: {
    id: global.chrome.runtime.id,
    getURL: global.chrome.runtime.getURL,
    sendMessage: (message) => Promise.resolve(undefined),
    onMessage: {
      addListener: (...args) => global.chrome.runtime.onMessage.addListener(...args),
      removeListener: (...args) => global.chrome.runtime.onMessage.removeListener?.(...args),
    },
  },
  storage: {
    local: {
      get: (keys) => new Promise((resolve) => {
        global.chrome.storage.local.get(keys, (result) => resolve(result || {}));
      }),
      set: (items) => new Promise((resolve, reject) => {
        global.chrome.storage.local.set(items, () => {
          if (global.chrome.runtime.lastError) reject(global.chrome.runtime.lastError);
          else resolve();
        });
      }),
      remove: (keys) => new Promise((resolve, reject) => {
        global.chrome.storage.local.remove(keys, () => {
          if (global.chrome.runtime.lastError) reject(global.chrome.runtime.lastError);
          else resolve();
        });
      }),
    },
  },
  tabs: {
    sendMessage: (tabId, msg) => Promise.resolve(undefined),
  },
};

// Mock window.location
delete window.location;
window.location = {
  href: 'https://twitter.com/user/status/123',
  hostname: 'twitter.com',
  pathname: '/user/status/123',
  origin: 'https://twitter.com',
};

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  
  // Reset chrome.runtime.lastError
  global.chrome.runtime.lastError = null;
});
