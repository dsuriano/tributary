export const CONFIG = Object.freeze({
  API_BASE: 'https://api.raindrop.io/rest/v1'
} as const);

export const STORAGE_KEYS = Object.freeze({
  TOKEN: 'raindropToken',
  DEFAULT_COLLECTION: 'defaultCollection',
  DEFAULT_TAGS: 'defaultTags',
  ENABLED_DOMAINS: 'enabledDomains',
  DEBUG_LOGGING: 'debugLogging'
} as const);

export const TIMING = Object.freeze({
  RATE_LIMIT_BACKOFF_MS: 60_000,
  CONTENT_CLICK_DEBOUNCE_MS: 500,
  BUTTON_DEDUPE_WINDOW_MS: 1_500,
  URL_DEDUPE_WINDOW_MS: 2_000,
  REDDIT_SCAN_DELAY_MS: 150,
  REDDIT_POINTER_MAX_AGE_MS: 3_000,
  REDDIT_POLL_INTERVAL_MS: 800,
  TOAST_DURATION_MS: 3_000,
  TOAST_FADE_MS: 500,
  YOUTUBE_DESCRIPTION_RETRY_MS: 120
} as const);

export const UI_COPY = Object.freeze({
  TOKEN_NOT_SET: 'API token not set.',
  TOKEN_INVALID: 'Invalid API token.',
  RATE_LIMIT_ERROR: 'Rate limited. Please try again later.'
} as const);

// Type exports for better type inference
export type Config = typeof CONFIG;
export type StorageKeys = typeof STORAGE_KEYS;
export type Timing = typeof TIMING;
export type UICopy = typeof UI_COPY;
