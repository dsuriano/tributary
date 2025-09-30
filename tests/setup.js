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
