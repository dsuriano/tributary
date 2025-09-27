// Twitter / X provider
const twitter = {
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
};

export default twitter;
