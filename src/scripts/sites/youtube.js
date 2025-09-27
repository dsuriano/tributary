// YouTube provider
const youtube = {
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
};

export default youtube;
