// Site provider template
// ----------------------
// Copy this file to `src/scripts/sites/<site>.js`, implement selectors and hooks,
// and register it in `src/scripts/sites/index.js` by adding a loader entry.
//
// Shape expected by content_script:
// {
//   buttonSelector: string | string[],
//   containerSelector: string | string[],
//   hooks?: {
//     // Return true only when a click transitions a control to the ON state
//     // (e.g., like/upvote applied). May be async.
//     toggledOnAfterClick?: (button: Element) => boolean | Promise<boolean>,
//     // Return a canonical permalink for the content, if you want to override
//     // the generic extractor (external link in container → canonical/page URL).
//     getPermalink?: (button: Element) => string,
//     // Optional overrides for title and excerpt extraction.
//     getTitle?: (button: Element) => string,
//     getExcerpt?: (button: Element) => string
//   }
// }

/**
 * Example guidance:
 * - Prefer stable attributes like aria-* or data-* over brittle classes.
 * - Provide multiple selectors as fallbacks when UIs vary.
 * - Keep hooks resilient; wrap DOM queries in try/catch if needed.
 */

const provider = {
  // CSS selector(s) for the site’s native like/upvote control.
  // If multiple UI variants exist, list them in order of preference.
  buttonSelector: [
    'button[aria-label="Like"]',
    'button[aria-pressed]'
  ],

  // The closest container that encapsulates a single piece of content
  // (e.g., a post/article). You can supply a string or an array.
  containerSelector: ['article', 'main', 'body'],

  hooks: {
    // Wait briefly after a click and verify the control is in the ON state.
    // Remove or adjust this hook if the generic detector is sufficient.
    toggledOnAfterClick: async (button) => {
      // Give UI a moment to update aria attributes
      await new Promise(r => setTimeout(r, 100));
      const el = button.closest('button') || button;
      try {
        const ap = el.getAttribute('aria-pressed');
        const ac = el.getAttribute('aria-checked');
        const as = el.getAttribute('aria-selected');
        const cls = el.className || '';
        return ap === 'true' || ac === 'true' || as === 'true' || (typeof cls === 'string' && cls.includes('active'));
      } catch (_) {
        return false;
      }
    },

    // Optionally compute a canonical permalink for the content.
    // Return an empty string to let the generic extractor run.
    getPermalink: (button) => {
      try {
        const container = button.closest('article') || document;
        const a = container.querySelector('a[href]');
        if (a && a.href) {
          const u = new URL(a.getAttribute('href'), window.location.origin);
          u.hash = '';
          return u.href;
        }
      } catch (_) {}
      return '';
    },

    // Optionally supply a cleaned up title.
    getTitle: () => {
      try {
        const meta = document.querySelector('meta[property="og:title"], meta[name="title"]');
        if (meta && meta.content) return String(meta.content).trim().slice(0, 200);
      } catch (_) {}
      return (document.title || '').trim().slice(0, 200);
    },

    // Optionally supply a concise excerpt.
    getExcerpt: (button) => {
      try {
        const container = button.closest('article') || document;
        const text = (container.innerText || container.textContent || '').replace(/\s+/g, ' ').trim();
        return text.slice(0, 500);
      } catch (_) { return ''; }
    }
  }
};

export default provider;
