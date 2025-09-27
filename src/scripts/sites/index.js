// Registry and lazy-loader for site provider modules.
// Each provider exports a default SiteConfig with the shape used by content_script:
// {
//   buttonSelector: string | string[],
//   containerSelector: string | string[],
//   hooks?: { toggledOnAfterClick?, getPermalink?, getTitle?, getExcerpt? }
// }

function normalizeHost(hostname) {
  try {
    return String(hostname || '')
      .toLowerCase()
      .replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

function hostnameMatches(match, hostname) {
  if (!match || !hostname) return false;
  if (match.startsWith('*.')) {
    const suffix = match.slice(1); // e.g. ".medium.com"
    return hostname === match.slice(2) || hostname.endsWith(suffix);
  }
  return hostname === match;
}

// Provider registry
// -----------------
// Add new providers here by appending an object with:
//   - match: array of hostnames or wildcard patterns (e.g., "example.com", "*.sub.example.com")
//   - loader: function that dynamically imports the provider module via chrome.runtime.getURL
//
// Example:
// {
//   match: ['example.com', 'news.example.com', '*.blog.example.com'],
//   loader: () => import(chrome.runtime.getURL('scripts/sites/example.js'))
// }
//
// Tip: Wildcards are supported via hostnameMatches() ("*.domain.tld" matches the apex and any subdomain).
const providers = [
  { match: ['twitter.com', 'x.com'], loader: () => import(chrome.runtime.getURL('scripts/sites/twitter.js')) },
  { match: ['youtube.com'], loader: () => import(chrome.runtime.getURL('scripts/sites/youtube.js')) },
  { match: ['reddit.com'], loader: () => import(chrome.runtime.getURL('scripts/sites/reddit.js')) },
];

const genericLoader = () => import(chrome.runtime.getURL('scripts/sites/generic.js'));

export async function loadSiteConfigFor(hostnameRaw) {
  const hostname = normalizeHost(hostnameRaw);
  for (const p of providers) {
    if (Array.isArray(p.match) && p.match.some(m => hostnameMatches(m, hostname))) {
      const mod = await p.loader();
      return mod.default || mod;
    }
  }
  const mod = await genericLoader();
  return mod.default || mod;
}

// Return a flat list of supported domain patterns (exact hosts or wildcard patterns)
export function getSupportedDomains() {
  const out = [];
  for (const p of providers) {
    if (Array.isArray(p.match)) {
      for (const m of p.match) {
        if (typeof m === 'string' && m) out.push(m);
      }
    }
  }
  return out;
}
