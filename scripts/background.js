// Background service worker for the Social Media to Raindrop.io extension.
//
// This service worker listens for messages from content scripts and the
// options page. It communicates with the Raindrop.io REST API to
// create bookmarks (raindrops) and fetch the user's collections. The
// worker also implements simple rate limiting based on the 429
// responses from the API. All asynchronous operations are handled
// using async/await for clarity.

const API_BASE = 'https://api.raindrop.io/rest/v1';

// Timestamp until which requests should be deferred due to rate
// limiting. When a 429 response is encountered this is set to now +
// 60 seconds. Subsequent save attempts within this window will be
// rejected with a rate limit error without making a network call.
let backoffUntil = 0;

/**
 * Helper to read values from chrome.storage.local as a promise.
 * @param {string[]} keys Array of keys to retrieve.
 * @returns {Promise<Object>} The retrieved values.
 */
function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

/**
 * Perform a request to the Raindrop API with the given endpoint and
 * options. Automatically prepends the base URL and sets the
 * Authorization header if a token is available. Returns a Response
 * object.
 *
 * @param {string} endpoint Endpoint path beginning with a slash.
 * @param {Object} options Options passed to fetch().
 * @param {string} token OAuth token for the API.
 */
async function raindropFetch(endpoint, options = {}, token) {
  const url = API_BASE + endpoint;
  const headers = options.headers ? { ...options.headers } : {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

/**
 * Handle saving a bookmark. Retrieves the stored token, default
 * collection and tags from storage, constructs the request payload and
 * sends it to the API. Responds to the sender tab with either a
 * success or error status. Implements rate limiting by checking
 * backoffUntil.
 *
 * @param {Object} data Contains url, title and excerpt.
 * @param {chrome.tabs.Tab} tab Tab from which the request originated.
 */
async function handleSave(data, tab) {
  const { raindropToken, defaultCollection, defaultTags, debugLogging } = await getStorage(['raindropToken', 'defaultCollection', 'defaultTags', 'debugLogging']);
  if (!raindropToken) {
    chrome.tabs.sendMessage(tab.id, { type: 'saveResult', status: 'error', error: 'API token not set.' });
    return;
  }
  const now = Date.now();
  if (now < backoffUntil) {
    chrome.tabs.sendMessage(tab.id, { type: 'saveResult', status: 'error', error: 'Rate limited. Please try again shortly.' });
    return;
  }
  // Build request body
  const body = {
    link: data.url,
    title: data.title || '',
    excerpt: data.excerpt || ''
  };
  if (defaultTags && Array.isArray(defaultTags) && defaultTags.length > 0) {
    body.tags = defaultTags;
  }
  if (defaultCollection) {
    body.collection = { $id: defaultCollection };
  }
  try {
    if (debugLogging) {
      console.debug('[Raindrop BG] Saving raindrop', { link: body.link, titleLen: body.title.length, excerptLen: body.excerpt.length, tags: body.tags, collection: body.collection });
    }
    const response = await raindropFetch('/raindrop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, raindropToken);
    if (debugLogging) {
      console.debug('[Raindrop BG] Save response status', response.status);
    }
    if (response.status === 429) {
      // Too many requests – apply backoff
      backoffUntil = Date.now() + 60 * 1000;
      chrome.tabs.sendMessage(tab.id, { type: 'saveResult', status: 'error', error: 'Rate limited. Please try again later.' });
      return;
    }
    if (response.status === 401) {
      // Invalid token
      chrome.tabs.sendMessage(tab.id, { type: 'saveResult', status: 'error', error: 'Invalid API token.' });
      return;
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      chrome.tabs.sendMessage(tab.id, { type: 'saveResult', status: 'error', error: text || 'Failed to save bookmark.' });
      return;
    }
    const json = await response.json();
    if (json && json.result) {
      chrome.tabs.sendMessage(tab.id, { type: 'saveResult', status: 'success' });
    } else {
      chrome.tabs.sendMessage(tab.id, { type: 'saveResult', status: 'error', error: 'Failed to save bookmark.' });
    }
  } catch (err) {
    chrome.tabs.sendMessage(tab.id, { type: 'saveResult', status: 'error', error: 'Network error.' });
  }
}

/**
 * Fetch all collections belonging to the user. The Raindrop API
 * separates root collections and children collections so both must
 * be queried. Returns a combined array of collection objects.
 *
 * @param {Function} sendResponse Function to call with the result or error.
 */
async function handleGetCollections(sendResponse) {
  const { raindropToken } = await getStorage(['raindropToken']);
  if (!raindropToken) {
    sendResponse({ error: 'API token not set.' });
    return;
  }
  try {
    const headers = { 'Content-Type': 'application/json' };
    let collections = [];
    // Root collections
    let resRoot = await raindropFetch('/collections', { method: 'GET', headers }, raindropToken);
    if (resRoot.status === 401) {
      sendResponse({ error: 'unauthorized' });
      return;
    }
    if (resRoot.ok) {
      const data = await resRoot.json();
      collections = collections.concat(data.items || []);
    }
    // Child collections
    let resChild = await raindropFetch('/collections/childrens', { method: 'GET', headers }, raindropToken);
    if (resChild.ok) {
      const data = await resChild.json();
      collections = collections.concat(data.items || []);
    }
    sendResponse({ collections });
  } catch (err) {
    sendResponse({ error: 'Network error.' });
  }
}

/**
 * Validate the stored API token by making a lightweight call to the
 * Raindrop API. The /user endpoint can be used to verify the token.
 *
 * @param {Function} sendResponse Callback to return the validation result.
 */
async function handleValidateToken(sendResponse) {
  const { raindropToken } = await getStorage(['raindropToken']);
  if (!raindropToken) {
    sendResponse({ valid: false });
    return;
  }
  try {
    const res = await raindropFetch('/user', { method: 'GET' }, raindropToken);
    if (res.status === 401) {
      sendResponse({ valid: false });
    } else {
      sendResponse({ valid: res.ok });
    }
  } catch (err) {
    sendResponse({ valid: false });
  }
}

// Listener for messages from content scripts and options page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  switch (message.action) {
    case 'save':
      if (sender.tab && message.data) {
        handleSave(message.data, sender.tab);
      }
      break;
    case 'getCollections':
      handleGetCollections(sendResponse);
      return true; // keep channel open for async response
    case 'validateToken':
      handleValidateToken(sendResponse);
      return true;
    default:
      break;
  }
});