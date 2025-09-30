import type { SiteConfig } from './types.js';

/**
 * Reddit provider
 */
const reddit: SiteConfig = {
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
    toggledOnAfterClick: async (button, ctx): Promise<boolean> => {
      // Reddit buttons toggle immediately, so we need to check the pre-click state
      // to determine if this is an upvote (OFF->ON) or un-upvote (ON->OFF)
      const preState = ctx?.state?.preClickOnState?.get(button);
      
      await new Promise(r => setTimeout(r, 80));
      const innerBtn = button.closest('button[aria-label="upvote"]')
        || button.closest('button[aria-label*="upvote" i]')
        || button.closest('button[aria-pressed][data-post-click-location="vote"]')
        || button.closest('[data-click-id="upvote"]')
        || button.closest('button[aria-pressed]')
        || button;
      const ap = innerBtn?.getAttribute('aria-pressed');
      const ac = innerBtn?.getAttribute('aria-checked');
      const isNowOn = ap === 'true' || ac === 'true';
      
      // Only save if we went from OFF to ON (not ON to OFF)
      if (preState === true && !isNowOn) {
        // Was ON, now OFF - this is an un-upvote, don't save
        return false;
      }
      if (preState === false && isNowOn) {
        // Was OFF, now ON - this is an upvote, save it
        return true;
      }
      
      // Fallback to current state if we don't have pre-state
      return isNowOn;
    },
    
    getPermalink: (button): string => {
      const resolveContainer = (el: Element): Element => {
        let cur: Element | null = el;
        const tryFind = (node: Element): Element | null => {
          return node.closest?.('div[data-testid="post-container"]')
            || node.closest?.('article')
            || node.closest?.('shreddit-post');
        };
        while (cur) {
          const found = tryFind(cur);
          if (found) return found;
          const root = cur.getRootNode?.() as ShadowRoot | Document;
          if (root && 'host' in root && root.host) {
            cur = root.host as Element;
          } else {
            cur = cur.parentElement;
          }
        }
        return document.querySelector('div[data-testid="post-container"], article, shreddit-post') || document.body;
      };
      
      const container = resolveContainer(button);
      
      const tryAnchors = (): string => {
        const anchors = Array.from(container.querySelectorAll('a[data-click-id="body"], a[href]'));
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
      if (comments) {
        const href = comments.getAttribute('href');
        if (href) {
          try {
            const u = new URL(href, window.location.origin);
            u.hash = '';
            u.search = '';
            return u.href;
          } catch (_) { }
        }
      }
      
      try {
        const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
        if (canonical?.href) return canonical.href;
      } catch (_) { }
      
      return window.location.href;
    },
    
    getTitle: (button): string => {
      const resolveContainer = (el: Element): Element => {
        let cur: Element | null = el;
        const tryFind = (node: Element): Element | null => {
          return node.closest?.('div[data-testid="post-container"]')
            || node.closest?.('article')
            || node.closest?.('shreddit-post');
        };
        while (cur) {
          const found = tryFind(cur);
          if (found) return found;
          const root = cur.getRootNode?.() as ShadowRoot | Document;
          if (root && 'host' in root && root.host) {
            cur = root.host as Element;
          } else {
            cur = cur.parentElement;
          }
        }
        return document.querySelector('div[data-testid="post-container"], article, shreddit-post') || document.body;
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
          const txt = el?.textContent;
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
    
    getExcerpt: (button): string => {
      const resolveContainer = (el: Element): Element => {
        let cur: Element | null = el;
        const tryFind = (node: Element): Element | null => {
          return node.closest?.('div[data-testid="post-container"]')
            || node.closest?.('article')
            || node.closest?.('shreddit-post');
        };
        while (cur) {
          const found = tryFind(cur);
          if (found) return found;
          const root = cur.getRootNode?.() as ShadowRoot | Document;
          if (root && 'host' in root && root.host) {
            cur = root.host as Element;
          } else {
            cur = cur.parentElement;
          }
        }
        return document.querySelector('div[data-testid="post-container"], article, shreddit-post') || document.body;
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
          const nodes = Array.from(container.querySelectorAll(sel));
          if (nodes?.length) {
            for (const n of nodes) {
              const txt = (n.textContent || '').trim();
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
          const t = (titleEl.textContent || '')
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
