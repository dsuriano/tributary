import browser from 'webextension-polyfill';
import { CONFIG, STORAGE_KEYS, TIMING, UI_COPY } from '../config/constants.js';
import { getFromStorage, removeFromStorage } from '../config/storage.js';

/**
 * Background service worker for the Tributary extension.
 *
 * This service worker listens for messages from content scripts and the
 * options page. It communicates with the Raindrop.io REST API to
 * create bookmarks (raindrops) and fetch the user's collections. The
 * worker also implements simple rate limiting based on the 429
 * responses from the API.
 */

// Type definitions for Raindrop API
interface RaindropCollection {
  _id: number;
  title: string;
  [key: string]: unknown;
}

interface RaindropCreateBody {
  link: string;
  title: string;
  excerpt: string;
  tags?: string[];
  collection?: { $id: number };
}

interface RaindropApiResponse {
  result?: boolean;
  item?: unknown;
  [key: string]: unknown;
}

interface CollectionsApiResponse {
  items?: RaindropCollection[];
  [key: string]: unknown;
}

interface StorageData {
  [STORAGE_KEYS.TOKEN]?: string;
  [STORAGE_KEYS.DEFAULT_COLLECTION]?: number;
  [STORAGE_KEYS.DEFAULT_TAGS]?: string[];
  [STORAGE_KEYS.DEBUG_LOGGING]?: boolean;
}

interface SaveMessage {
  action: 'save';
  data: {
    url: string;
    title?: string;
    excerpt?: string;
  };
}

interface GetCollectionsMessage {
  action: 'getCollections';
}

interface ValidateTokenMessage {
  action: 'validateToken';
}

type Message = SaveMessage | GetCollectionsMessage | ValidateTokenMessage | { action: string };

interface SaveResultMessage {
  type: 'saveResult';
  status: 'success' | 'error';
  error?: string;
}

interface CollectionsResponse {
  collections?: RaindropCollection[];
  error?: string;
}

interface ValidationResponse {
  valid: boolean;
}

/**
 * Timestamp until which requests should be deferred due to rate
 * limiting. When a 429 response is encountered this is set to now +
 * the configured backoff. Subsequent save attempts within this window
 * will be rejected with a rate limit error without making a network call.
 */
let backoffUntil = 0;

/**
 * Perform a request to the Raindrop API with the given endpoint and
 * options. Automatically prepends the base URL and sets the
 * Authorization header if a token is available.
 */
async function raindropFetch(
  endpoint: string,
  options: RequestInit = {},
  token?: string
): Promise<Response> {
  const url = CONFIG.API_BASE + endpoint;
  const headers: Record<string, string> = options.headers
    ? { ...(options.headers as Record<string, string>) }
    : {};
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
 */
async function handleSave(
  data: { url: string; title?: string; excerpt?: string },
  tab: any
): Promise<void> {
  const stored = await getFromStorage<StorageData>([
    STORAGE_KEYS.TOKEN,
    STORAGE_KEYS.DEFAULT_COLLECTION,
    STORAGE_KEYS.DEFAULT_TAGS,
    STORAGE_KEYS.DEBUG_LOGGING
  ]);
  
  const raindropToken = stored[STORAGE_KEYS.TOKEN];
  const defaultCollection = stored[STORAGE_KEYS.DEFAULT_COLLECTION];
  const defaultTags = stored[STORAGE_KEYS.DEFAULT_TAGS];
  const debugLogging = stored[STORAGE_KEYS.DEBUG_LOGGING];
  
  if (!raindropToken) {
    if (tab.id) {
      await browser.tabs.sendMessage(tab.id, {
        type: 'saveResult',
        status: 'error',
        error: UI_COPY.TOKEN_NOT_SET
      } as SaveResultMessage);
    }
    return;
  }
  
  const now = Date.now();
  if (now < backoffUntil) {
    if (tab.id) {
      await browser.tabs.sendMessage(tab.id, {
        type: 'saveResult',
        status: 'error',
        error: UI_COPY.RATE_LIMIT_ERROR
      } as SaveResultMessage);
    }
    return;
  }
  
  // Build request body
  const body: RaindropCreateBody = {
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
      console.debug('[Raindrop BG] Saving raindrop', {
        link: body.link,
        titleLen: body.title.length,
        excerptLen: body.excerpt.length,
        tags: body.tags,
        collection: body.collection
      });
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
      backoffUntil = Date.now() + TIMING.RATE_LIMIT_BACKOFF_MS;
      if (tab.id) {
        await browser.tabs.sendMessage(tab.id, {
          type: 'saveResult',
          status: 'error',
          error: UI_COPY.RATE_LIMIT_ERROR
        } as SaveResultMessage);
      }
      return;
    }
    
    if (response.status === 401) {
      // Invalid token
      await removeFromStorage(STORAGE_KEYS.TOKEN);
      if (tab.id) {
        await browser.tabs.sendMessage(tab.id, {
          type: 'saveResult',
          status: 'error',
          error: UI_COPY.TOKEN_INVALID
        } as SaveResultMessage);
      }
      return;
    }
    
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (tab.id) {
        await browser.tabs.sendMessage(tab.id, {
          type: 'saveResult',
          status: 'error',
          error: text || 'Failed to save bookmark.'
        } as SaveResultMessage);
      }
      return;
    }
    
    const json = await response.json() as RaindropApiResponse;
    if (json?.result) {
      if (tab.id) {
        await browser.tabs.sendMessage(tab.id, {
          type: 'saveResult',
          status: 'success'
        } as SaveResultMessage);
      }
    } else {
      if (tab.id) {
        await browser.tabs.sendMessage(tab.id, {
          type: 'saveResult',
          status: 'error',
          error: 'Failed to save bookmark.'
        } as SaveResultMessage);
      }
    }
  } catch (err) {
    if (tab.id) {
      await browser.tabs.sendMessage(tab.id, {
        type: 'saveResult',
        status: 'error',
        error: 'Network error.'
      } as SaveResultMessage);
    }
  }
}

/**
 * Fetch all collections belonging to the user. The Raindrop API
 * separates root collections and children collections so both must
 * be queried. Returns a combined array of collection objects.
 */
async function handleGetCollections(): Promise<CollectionsResponse> {
  const stored = await getFromStorage<StorageData>([STORAGE_KEYS.TOKEN]);
  const raindropToken = stored[STORAGE_KEYS.TOKEN];
  
  if (!raindropToken) {
    return { error: UI_COPY.TOKEN_NOT_SET };
  }
  
  try {
    const headers = { 'Content-Type': 'application/json' };
    let collections: RaindropCollection[] = [];
    
    // Root collections
    const resRoot = await raindropFetch('/collections', { method: 'GET', headers }, raindropToken);
    if (resRoot.status === 401) {
      await removeFromStorage(STORAGE_KEYS.TOKEN);
      return { error: 'unauthorized' };
    }
    if (resRoot.ok) {
      const data = await resRoot.json() as CollectionsApiResponse;
      collections = collections.concat(data.items || []);
    }
    
    // Child collections
    const resChild = await raindropFetch('/collections/childrens', { method: 'GET', headers }, raindropToken);
    if (resChild.ok) {
      const data = await resChild.json() as CollectionsApiResponse;
      collections = collections.concat(data.items || []);
    }
    
    // Deduplicate collections by _id in case the same collection
    // appears in both root and child responses.
    const seenIds = new Set<number>();
    const dedupedCollections: RaindropCollection[] = [];
    
    for (const collection of collections) {
      if (!collection || typeof collection._id === 'undefined' || collection._id === null) {
        dedupedCollections.push(collection);
        continue;
      }
      if (seenIds.has(collection._id)) {
        continue;
      }
      seenIds.add(collection._id);
      dedupedCollections.push(collection);
    }
    
    return { collections: dedupedCollections };
  } catch (err) {
    return { error: 'Network error.' };
  }
}

/**
 * Validate the stored API token by making a lightweight call to the
 * Raindrop API. The /user endpoint can be used to verify the token.
 */
async function handleValidateToken(): Promise<ValidationResponse> {
  const stored = await getFromStorage<StorageData>([STORAGE_KEYS.TOKEN]);
  const raindropToken = stored[STORAGE_KEYS.TOKEN];
  
  if (!raindropToken) {
    return { valid: false };
  }
  
  try {
    const res = await raindropFetch('/user', { method: 'GET' }, raindropToken);
    if (res.status === 401) {
      await removeFromStorage(STORAGE_KEYS.TOKEN);
      return { valid: false };
    } else {
      return { valid: res.ok };
    }
  } catch (err) {
    return { valid: false };
  }
}

// Listener for messages from content scripts and options page
browser.runtime.onMessage.addListener(async (
  message: Message,
  sender: browser.runtime.MessageSender
): Promise<unknown | void> => {
  if (!message || typeof message !== 'object') return;
  switch (message.action) {
    case 'save':
      if (sender.tab && 'data' in message) {
        await handleSave(message.data, sender.tab);
      }
      return; // no response payload
    case 'getCollections':
      return await handleGetCollections();
    case 'validateToken':
      return await handleValidateToken();
    default:
      return;
  }
});
