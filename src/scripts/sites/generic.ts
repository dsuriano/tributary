import type { SiteConfig } from './types.js';

/**
 * Generic fallback provider
 * Uses generic extraction when no specific site module matches
 */
const generic: SiteConfig = {
  buttonSelector: [
    'button[aria-pressed="true"]',
    'button[aria-checked="true"]',
    '[role="button"][aria-pressed="true"]'
  ],
  containerSelector: ['article', 'main', 'body'],
  hooks: {
    // Leave hooks empty to rely on generic detection in content_script
  }
};

export default generic;
