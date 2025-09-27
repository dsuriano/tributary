// Reddit provider
const reddit = {
  buttonSelector: [
    'button[aria-label="upvote"]',
    'button[aria-label*="upvote" i]',
    'button[aria-pressed][data-post-click-location="vote"]',
    '[data-click-id="upvote"]',
    'button[aria-pressed][id*="upvote" i]',
    'button[aria-pressed][class*="upvote" i]',
    '[role="button"][class*="upvote" i]'
  ],
  containerSelector: ['div[data-testid="post-container"]', 'article'],
  hooks: {
    toggledOnAfterClick: async (button) => {
      await new Promise(r => setTimeout(r, 80));
      const innerBtn = button.closest('button[aria-label="upvote"]')
        || button.closest('button[aria-label*="upvote" i]')
        || button.closest('button[aria-pressed][data-post-click-location="vote"]')
        || button.closest('[data-click-id="upvote"]')
        || button.closest('button[aria-pressed]')
        || button;
      const ap = innerBtn && innerBtn.getAttribute('aria-pressed');
      const ac = innerBtn && innerBtn.getAttribute('aria-checked');
      return ap === 'true' || ac === 'true';
    },
    getPermalink: (button) => {
      const resolveContainer = (el) => {
        let cur = el;
        const tryFind = (node) => {
          return node.closest && (node.closest('div[data-testid="post-container"]')
            || node.closest('article')
            || node.closest('shreddit-post'));
        };
        while (cur) {
          const found = tryFind(cur);
          if (found) return found;
          const root = cur.getRootNode && cur.getRootNode();
          if (root && root.host) {
            cur = root.host;
          } else {
            cur = cur.parentElement;
          }
        }
        return document.querySelector('div[data-testid="post-container"], article, shreddit-post') || document;
      };
      const container = resolveContainer(button);
      const tryAnchors = () => {
        const anchors = container.querySelectorAll('a[data-click-id="body"], a[href]');
        for (const a of anchors) {
          const href = a.getAttribute('href') || '';
          if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
          try {
            const u = new URL(href, window.location.origin);
            if (u.hostname && u.hostname !== window.location.hostname) {
              u.hash = '';
              u.search = '';
              return u.href;
            }
          } catch (_) { }
        }
        return '';
      };
      const external = tryAnchors();
      if (external) return external;
      const comments = container.querySelector('a[data-click-id="comments"]')
        || container.querySelector('a[slot="title"]')
        || container.querySelector('a[href*="/comments/"]');
      if (comments && comments.getAttribute('href')) {
        try {
          const u = new URL(comments.getAttribute('href'), window.location.origin);
          u.hash = '';
          u.search = '';
          return u.href;
        } catch (_) { }
      }
      try {
        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical && canonical.href) return canonical.href;
      } catch (_) { }
      return window.location.href;
    },
    getTitle: (button) => {
      const resolveContainer = (el) => {
        let cur = el;
        const tryFind = (node) => node.closest && (node.closest('div[data-testid="post-container"]') || node.closest('article') || node.closest('shreddit-post'));
        while (cur) {
          const found = tryFind(cur);
          if (found) return found;
          const root = cur.getRootNode && cur.getRootNode();
          if (root && root.host) cur = root.host; else cur = cur.parentElement;
        }
        return document.querySelector('div[data-testid="post-container"], article, shreddit-post') || document;
      };
      const container = resolveContainer(button);
      const selectors = [
        'h1[data-testid="post-title"]',
        'h2[data-testid="post-title"]',
        'h3[data-testid="post-title"]',
        'a[data-click-id="body"]',
        'a[slot="title"]',
        '[slot="post-title"]',
        '[slot="post-title"] h1',
        '[slot="post-title"] h2',
        '[slot="post-title"] h3',
        '[data-test-id="post-content"] h1',
        '[data-test-id="post-content"] h2',
        '[data-test-id="post-content"] h3'
      ];
      for (const sel of selectors) {
        try {
          const el = container.querySelector(sel);
          const txt = el && (el.innerText || el.textContent);
          if (txt) {
            const t = String(txt)
              .replace(/https?:\/\/\S+/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            if (t) return t.slice(0, 200);
          }
        } catch (_) { }
      }
      return (document.title || '').slice(0, 200);
    },
    getExcerpt: (button) => {
      const resolveContainer = (el) => {
        let cur = el;
        const tryFind = (node) => node.closest && (node.closest('div[data-testid="post-container"]') || node.closest('article') || node.closest('shreddit-post'));
        while (cur) {
          const found = tryFind(cur);
          if (found) return found;
          const root = cur.getRootNode && cur.getRootNode();
          if (root && root.host) cur = root.host; else cur = cur.parentElement;
        }
        return document.querySelector('div[data-testid="post-container"], article, shreddit-post') || document;
      };
      const container = resolveContainer(button);
      const bodySelectors = [
        'shreddit-post [slot="text-body"]',
        'shreddit-post [slot="text-body"] div',
        'div[data-click-id="text"]',
        '[data-test-id="post-content"] [data-click-id="text"]',
        '[data-test-id="post-content"] p'
      ];
      let combined = '';
      for (const sel of bodySelectors) {
        try {
          const nodes = container.querySelectorAll(sel);
          if (nodes && nodes.length) {
            for (const n of nodes) {
              const txt = (n.innerText || n.textContent || '').trim();
              if (txt) combined += txt + ' ';
            }
            if (combined.trim()) {
              return combined.replace(/\s+/g, ' ').trim().slice(0, 1000);
            }
          }
        } catch (_) { }
      }
      try {
        const titleEl = container.querySelector('h1[data-testid="post-title"], h2[data-testid="post-title"], h3[data-testid="post-title"], a[data-click-id="body"], a[slot="title"], [slot="post-title"]');
        if (titleEl) {
          const t = (titleEl.innerText || titleEl.textContent || '')
            .replace(/https?:\/\/\S+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (t) return t.slice(0, 400);
        }
      } catch (_) { }
      return '';
    }
  }
};

export default reddit;
