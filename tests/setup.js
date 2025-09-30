import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// Mock Chrome Extension APIs
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    getURL: (path) => `chrome-extension://test-extension-id/${path}`,
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    lastError: null,
  },
  storage: {
    local: {
      get: jest.fn((keys, callback) => {
        callback({});
      }),
      set: jest.fn((items, callback) => {
        if (callback) callback();
      }),
      remove: jest.fn((keys, callback) => {
        if (callback) callback();
      }),
    },
  },
  tabs: {
    sendMessage: jest.fn(),
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
  jest.clearAllMocks();
  document.body.innerHTML = '';
  
  // Reset chrome.runtime.lastError
  global.chrome.runtime.lastError = null;
});
