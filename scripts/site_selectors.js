// Mapping of supported sites to their button and container selectors.
// Each entry corresponds to a domain name (without www) and defines
// how to find the native like/upvote/bookmark button and the parent
// container that encapsulates the content. This separation of
// selectors makes it easy to extend support to new websites without
// touching the core logic of the extension.
//
// In addition, each site may provide optional hooks to customize
// behaviour without modifying the core content script:
//   hooks: {
//     // Return true only when the click results in a toggled "on" state
//     // (e.g., like enabled, upvote applied). May be async.
//     toggledOnAfterClick?: (button: Element) => boolean|Promise<boolean>,
//     // Return a canonical permalink for the content. If omitted, the
//     // generic extractor will be used (external link in container or
//     // page canonical/current URL).
//     getPermalink?: (button: Element) => string,
//     // Optional overrides for title and excerpt extraction.
//     getTitle?: (button: Element) => string,
//     getExcerpt?: (button: Element) => string
//   }
//
// To add a new site, copy the template below and adjust selectors and
// hooks as needed. Prefer robust attributes like aria-* or data-*
// over brittle CSS class names.
//
//  "example.com": {
//    buttonSelector: 'button[aria-label="Like"]',
//    containerSelector: ['article', 'div.post'],
//    hooks: {
//      toggledOnAfterClick: async (button) => {
//        await new Promise(r => setTimeout(r, 80));
//        const el = button.closest('button') || button;
//        return el && el.getAttribute('aria-pressed') === 'true';
//      },
//      getPermalink: (button) => {
//        // Prefer external links within the container; otherwise fallback
//        // is handled by the core extractor.
//        return '';
//      },
//      getTitle: () => document.title || '',
//      getExcerpt: (button) => {
//        const container = button.closest('article') || document;
//        return (container.textContent || '').trim().slice(0, 500);
//      }
//    }
//  }

const siteSelectors = {
  /**
   * Twitter/X
   *
   * The like button on Twitter uses a `data-testid="like"` attribute.
   * Tweets are contained within an <article> element so we limit
   * traversal to the closest article when extracting links. Any
   * external anchor within the article will be saved; otherwise we
   * fall back to the canonical URL of the tweet.
   */
  'twitter.com': {
    buttonSelector: ['[data-testid="like"]', '[data-testid="unlike"]'],
    containerSelector: 'article',
    hooks: {
      toggledOnAfterClick: async (button) => {
        // Give UI a moment to update aria/data-testid
        await new Promise(r => setTimeout(r, 120));
        const root = button.closest('[data-testid="like"]')
          || button.closest('[data-testid="unlike"]')
          || button.closest('button, [role="button"]')
          || button;
        const hasOn = (el) => {
          if (!el) return false;
          const ap = el.getAttribute('aria-pressed');
          const ac = el.getAttribute('aria-checked');
          const as = el.getAttribute('aria-selected');
          const cls = el.className || '';
          const dt = el.getAttribute('data-testid');
          return ap === 'true' || ac === 'true' || as === 'true' || dt === 'unlike' || (typeof cls === 'string' && cls.includes('style-default-active'));
        };
        if (hasOn(root)) return true;
        const inner = root && root.querySelector('[aria-pressed="true"], [aria-checked="true"], [aria-selected="true"], .style-default-active, [data-testid="unlike"]');
        return !!inner;
      },
      getPermalink: (button) => {
        const article = button.closest('article') || document.querySelector('article');
        if (!article) return '';
        const statusAnchors = article.querySelectorAll('a[href*="/status/"]');
        const anchor = statusAnchors[statusAnchors.length - 1];
        if (!anchor) return '';
        const href = anchor.getAttribute('href') || '';
        try {
          const url = new URL(href, window.location.origin);
          const parts = url.pathname.split('/').filter(Boolean);
          const statusIdx = parts.indexOf('status');
          if (statusIdx !== -1 && parts[statusIdx + 1]) {
            const id = parts[statusIdx + 1];
            const username = statusIdx > 0 ? parts[statusIdx - 1] : null;
            url.pathname = username ? `/${username}/status/${id}` : `/status/${id}`;
            url.hash = '';
            url.search = '';
          }
          return url.href;
        } catch (_) { return ''; }
      },
      getTitle: (button) => {
        const article = button.closest('article') || document.querySelector('article');
        if (!article) return document.title || '';
        const textNodes = article.querySelectorAll('[data-testid="tweetText"]');
        let combined = '';
        textNodes.forEach((n) => { combined += ((n.innerText || n.textContent || '').trim() + ' '); });
        combined = combined.trim();
        return combined ? combined.substring(0, 80) : (document.title || '');
      },
      getExcerpt: (button) => {
        const article = button.closest('article') || document.querySelector('article');
        if (!article) return '';
        const textNodes = article.querySelectorAll('[data-testid="tweetText"]');
        let combined = '';
        textNodes.forEach((n) => { combined += ((n.innerText || n.textContent || '').trim() + ' '); });
        combined = combined.trim();
        return combined ? combined.substring(0, 500) : '';
      }
    }
  },
  'x.com': {
    buttonSelector: ['[data-testid="like"]', '[data-testid="unlike"]'],
    containerSelector: 'article',
    hooks: {
      toggledOnAfterClick: async (button) => {
        await new Promise(r => setTimeout(r, 120));
        const root = button.closest('[data-testid="like"]')
          || button.closest('[data-testid="unlike"]')
          || button.closest('button, [role="button"]')
          || button;
        const hasOn = (el) => {
          if (!el) return false;
          const ap = el.getAttribute('aria-pressed');
          const ac = el.getAttribute('aria-checked');
          const as = el.getAttribute('aria-selected');
          const cls = el.className || '';
          const dt = el.getAttribute('data-testid');
          return ap === 'true' || ac === 'true' || as === 'true' || dt === 'unlike' || (typeof cls === 'string' && cls.includes('style-default-active'));
        };
        if (hasOn(root)) return true;
        const inner = root && root.querySelector('[aria-pressed="true"], [aria-checked="true"], [aria-selected="true"], .style-default-active, [data-testid="unlike"]');
        return !!inner;
      },
      getPermalink: (button) => {
        const article = button.closest('article') || document.querySelector('article');
        if (!article) return '';
        const statusAnchors = article.querySelectorAll('a[href*="/status/"]');
        const anchor = statusAnchors[statusAnchors.length - 1];
        if (!anchor) return '';
        const href = anchor.getAttribute('href') || '';
        try {
          const url = new URL(href, window.location.origin);
          const parts = url.pathname.split('/').filter(Boolean);
          const statusIdx = parts.indexOf('status');
          if (statusIdx !== -1 && parts[statusIdx + 1]) {
            const id = parts[statusIdx + 1];
            const username = statusIdx > 0 ? parts[statusIdx - 1] : null;
            url.pathname = username ? `/${username}/status/${id}` : `/status/${id}`;
            url.hash = '';
            url.search = '';
          }
          return url.href;
        } catch (_) { return ''; }
      },
      getTitle: (button) => {
        const article = button.closest('article') || document.querySelector('article');
        if (!article) return document.title || '';
        const textNodes = article.querySelectorAll('[data-testid="tweetText"]');
        let combined = '';
        textNodes.forEach((n) => { combined += ((n.innerText || n.textContent || '').trim() + ' '); });
        combined = combined.trim();
        return combined ? combined.substring(0, 80) : (document.title || '');
      },
      getExcerpt: (button) => {
        const article = button.closest('article') || document.querySelector('article');
        if (!article) return '';
        const textNodes = article.querySelectorAll('[data-testid="tweetText"]');
        let combined = '';
        textNodes.forEach((n) => { combined += ((n.innerText || n.textContent || '').trim() + ' '); });
        combined = combined.trim();
        return combined ? combined.substring(0, 500) : '';
      }
    }
  },

  /**
   * YouTube
   *
   * YouTube's like button is rendered inside a #like-button element. We
   * include a few possible selectors as fallbacks to maximise
   * resilience against UI changes. The container selector falls back
   * to the watch metadata element and then the entire document
   * because the video page itself is the content being saved.
   */
  'youtube.com': {
    buttonSelector: [
      'button#like-button',
      'ytd-toggle-button-renderer button',
      'button[aria-label*="like"]'
    ],
    containerSelector: ['ytd-watch-metadata', 'body'],
    hooks: {
      toggledOnAfterClick: async (button) => {
        await new Promise(r => setTimeout(r, 80));
        const toggleRoot = button.closest('ytd-toggle-button-renderer') || button.closest('#like-button') || button;
        const innerBtn = (toggleRoot && toggleRoot.querySelector('button')) || toggleRoot;
        if (!innerBtn) return false;
        const ap = innerBtn.getAttribute('aria-pressed');
        const ac = innerBtn.getAttribute('aria-checked');
        const as = innerBtn.getAttribute('aria-selected');
        const cls = innerBtn.className || '';
        return ap === 'true' || ac === 'true' || as === 'true' || (typeof cls === 'string' && cls.includes('style-default-active'));
      },
      getPermalink: () => {
        try {
          const loc = new URL(window.location.href);
          const path = loc.pathname || '';
          const shortsMatch = path.match(/^\/shorts\/([a-zA-Z0-9_-]{8,})/);
          if (shortsMatch && shortsMatch[1]) {
            return `${loc.origin}/shorts/${shortsMatch[1]}`;
          }
          const v = loc.searchParams.get('v');
          if (path.startsWith('/watch') && v) {
            return `${loc.origin}/watch?v=${encodeURIComponent(v)}`;
          }
        } catch (_) {}
        return '';
      },
      getTitle: () => {
        // Prefer structured data, then visible title, then document.title
        try {
          const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
          for (const s of scripts) {
            try {
              const data = JSON.parse(s.textContent || 'null');
              const items = Array.isArray(data) ? data : [data];
              for (const it of items) {
                if (it && (it['@type'] === 'VideoObject' || (Array.isArray(it['@type']) && it['@type'].includes('VideoObject'))) && typeof it.name === 'string') {
                  const t = String(it.name).replace(/\s+/g, ' ').trim();
                  if (t) return t.slice(0, 200);
                }
              }
            } catch (_) { }
          }
        } catch (_) { }
        try {
          const titleEl = document.querySelector('ytd-watch-metadata h1 yt-formatted-string')
            || document.querySelector('ytd-watch-metadata h1')
            || document.querySelector('h1.title')
            || document.querySelector('meta[name="title"]');
          if (titleEl) {
            const raw = titleEl.getAttribute && titleEl.getAttribute('content') ? titleEl.getAttribute('content') : (titleEl.textContent || '');
            return String(raw).replace(/\s+/g, ' ').trim().slice(0, 200);
          }
        } catch (_) {}
        return (document.title || '').slice(0, 200);
      },
      getExcerpt: () => {
        // Prefer structured data description
        try {
          const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
          for (const s of scripts) {
            try {
              const data = JSON.parse(s.textContent || 'null');
              const items = Array.isArray(data) ? data : [data];
              for (const it of items) {
                if (it && (it['@type'] === 'VideoObject' || (Array.isArray(it['@type']) && it['@type'].includes('VideoObject'))) && typeof it.description === 'string') {
                  const d = String(it.description).replace(/\s+/g, ' ').trim();
                  if (d) return d.slice(0, 2000);
                }
              }
            } catch (_) { }
          }
        } catch (_) { }
        // Fallback to DOM text around description areas
        const trySelectors = [
          'ytd-watch-metadata #description-inline-expander #expanded',
          'ytd-watch-metadata #description-inline-expander',
          'ytd-watch-metadata ytd-text-inline-expander #expanded',
          'ytd-watch-metadata ytd-text-inline-expander',
          '#description',
          'ytd-expander#description'
        ];
        for (const sel of trySelectors) {
          try {
            const el = document.querySelector(sel);
            if (el && el.innerText) {
              const text = el.innerText.replace(/^(Show more|More)\s*/i, '');
              const normalised = String(text).replace(/\s+/g, ' ').trim().slice(0, 2000);
              if (normalised) return normalised;
            }
          } catch (_) { }
        }
        const meta = document.querySelector('meta[name="description"]');
        return meta && meta.content ? String(meta.content).replace(/\s+/g, ' ').trim().slice(0, 1000) : '';
      }
    }
  },

  /**
   * Reddit
   *
   * Upvote buttons on Reddit use an aria-label of "upvote". Posts are
   * encapsulated in a <div> with data-testid="post-container" or
   * sometimes an <article>. These selectors allow us to locate the
   * correct container for link extraction.
   */
  'reddit.com': {
    buttonSelector: 'button[aria-label="upvote"]',
    containerSelector: ['div[data-testid="post-container"]', 'article'],
    hooks: {
      toggledOnAfterClick: async (button) => {
        await new Promise(r => setTimeout(r, 80));
        const innerBtn = button.closest('button[aria-label="upvote"]') || button;
        const ap = innerBtn && innerBtn.getAttribute('aria-pressed');
        const ac = innerBtn && innerBtn.getAttribute('aria-checked');
        return ap === 'true' || ac === 'true';
      }
    }
  }
};

export default siteSelectors;