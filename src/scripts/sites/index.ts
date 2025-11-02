import browser from 'webextension-polyfill';
import type { SiteConfig, ProviderEntry } from './types.js';

/**
 * Registry and lazy-loader for site provider modules
 */

function normalizeHost(hostname: string | null | undefined): string {
  try {
    return String(hostname || '')
      .toLowerCase()
      .replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

function hostnameMatches(match: string, hostname: string): boolean {
  if (!match || !hostname) return false;
  if (match.startsWith('*.')) {
    const suffix = match.slice(1); // e.g. ".medium.com"
    return hostname === match.slice(2) || hostname.endsWith(suffix);
  }
  return hostname === match;
}

/**
 * Provider registry
 * 
 * Add new providers here by appending an object with:
 * - match: array of hostnames or wildcard patterns (e.g., "example.com", "*.sub.example.com")
 * - loader: function that dynamically imports the provider module via browser.runtime.getURL
 * 
 * Example:
 * {
 *   match: ['example.com', 'news.example.com', '*.blog.example.com'],
 *   loader: () => import(browser.runtime.getURL('scripts/sites/example.js'))
 * }
 * 
 * Tip: Wildcards are supported via hostnameMatches() ("*.domain.tld" matches the apex and any subdomain).
 */
const providers: ProviderEntry[] = [
  { match: ['twitter.com', 'x.com'], loader: () => import(browser.runtime.getURL('scripts/sites/twitter.js')) },
  { match: ['youtube.com'], loader: () => import(browser.runtime.getURL('scripts/sites/youtube.js')) },
  { match: ['reddit.com'], loader: () => import(browser.runtime.getURL('scripts/sites/reddit.js')) },
  { match: ['github.com'], loader: () => import(browser.runtime.getURL('scripts/sites/github.js')) },
];

const genericLoader = () => import(browser.runtime.getURL('scripts/sites/generic.js'));

/**
 * Load the site configuration for a given hostname
 * @param hostnameRaw - The hostname to load configuration for
 * @returns The site configuration or generic fallback
 */
export async function loadSiteConfigFor(hostnameRaw: string): Promise<SiteConfig> {
  const hostname = normalizeHost(hostnameRaw);
  for (const p of providers) {
    if (Array.isArray(p.match) && p.match.some(m => hostnameMatches(m, hostname))) {
      const mod = await p.loader();
      return ('default' in mod ? mod.default : mod) as SiteConfig;
    }
  }
  const mod = await genericLoader();
  return ('default' in mod ? mod.default : mod) as SiteConfig;
}

/**
 * Return a flat list of supported domain patterns (exact hosts or wildcard patterns)
 * @returns Array of domain patterns
 */
export function getSupportedDomains(): string[] {
  const out: string[] = [];
  for (const p of providers) {
    if (Array.isArray(p.match)) {
      for (const m of p.match) {
        if (typeof m === 'string' && m) out.push(m);
      }
    }
  }
  return out;
}
