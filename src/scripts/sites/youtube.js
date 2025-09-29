function normaliseText(text, maxLen = 0) {
  if (!text) return '';
  let t = String(text).replace(/\s+/g, ' ').trim();
  if (maxLen > 0 && t.length > maxLen) {
    t = t.slice(0, maxLen);
  }
  return t;
}

function isYouTubeShortsPage() {
  try {
    const p = window.location.pathname || '';
    return /^\/shorts\//.test(p);
  } catch (_) {
    return false;
  }
}

function waitMs(ctx, ms = 60) {
  try {
    if (ctx && ctx.utils && typeof ctx.utils.wait === 'function') {
      return ctx.utils.wait(ms);
    }
  } catch (_) {}
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForCondition(ctx, predicate, options = {}) {
  try {
    if (ctx && ctx.utils && typeof ctx.utils.waitForCondition === 'function') {
      return ctx.utils.waitForCondition(predicate, options);
    }
  } catch (_) {}
  const { timeout = 1500, interval = 50 } = options || {};
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      let ok = false;
      try { ok = !!predicate(); } catch (_) { ok = false; }
      if (ok) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeout) {
        clearInterval(timer);
        resolve(false);
      }
    }, interval);
  });
}

function collectVideoObjects() {
  const items = [];
  try {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const s of scripts) {
      try {
        const data = JSON.parse(s.textContent || 'null');
        const list = Array.isArray(data) ? data : [data];
        for (const it of list) {
          if (!it) continue;
          const type = it['@type'];
          const isVideo = type === 'VideoObject' || (Array.isArray(type) && type.includes('VideoObject'));
          if (isVideo) items.push(it);
        }
      } catch (_) { /* ignore single script parse errors */ }
    }
  } catch (_) { /* ignore */ }
  return items;
}

function getYouTubeShortsTitle() {
  for (const it of collectVideoObjects()) {
    if (typeof it.name === 'string' && it.name.trim()) {
      const t = normaliseText(it.name, 200);
      if (t) return t;
    }
  }
  const selectors = [
    '#reel-player-overlay-renderer #title yt-formatted-string',
    'ytd-reel-player-overlay-renderer #title yt-formatted-string',
    '#reel-player-overlay-renderer #title',
    'ytd-reel-player-overlay-renderer #title',
    '#shorts-title',
    'ytd-reel-video-renderer #shorts-title'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && (el.innerText || el.textContent)) {
      const t = normaliseText(el.innerText || el.textContent, 200);
      if (t) return t;
    }
  }
  return normaliseText(document.title || '', 200);
}

function getYouTubeShortsDescription() {
  for (const it of collectVideoObjects()) {
    if (typeof it.description === 'string' && it.description.trim()) {
      const d = normaliseText(it.description, 4000);
      if (d) return d;
    }
  }
  const selectors = [
    '#reel-player-overlay-renderer ytd-reel-player-overlay-renderer yt-core-attributed-string',
    'ytd-reel-player-overlay-renderer yt-core-attributed-string',
    '#reel-player-overlay-renderer',
    'ytd-reel-player-overlay-renderer'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText) {
      const t = normaliseText(el.innerText, 1000);
      if (t) return t;
    }
  }
  try {
    const meta = document.querySelector('meta[name="description"]');
    if (meta && meta.content) return normaliseText(meta.content, 1000);
  } catch (_) {}
  return '';
}

function getYouTubeTitleFromPage() {
  for (const it of collectVideoObjects()) {
    if (typeof it.name === 'string' && it.name.trim()) {
      const t = normaliseText(it.name, 200);
      if (t) return t;
    }
  }
  try {
    const titleEl = document.querySelector('ytd-watch-metadata h1 yt-formatted-string')
      || document.querySelector('ytd-watch-metadata h1')
      || document.querySelector('h1.title')
      || document.querySelector('meta[name="title"]');
    if (titleEl) {
      const raw = titleEl.getAttribute && titleEl.getAttribute('content') ? titleEl.getAttribute('content') : (titleEl.textContent || '');
      const t = normaliseText(raw, 200);
      if (t) return t;
    }
  } catch (_) {}
  return normaliseText(document.title || '', 200);
}

function getYouTubeExpanderRoot() {
  return document.querySelector('ytd-watch-metadata ytd-text-inline-expander')
    || document.querySelector('#description-inline-expander');
}

function clickYouTubeDescriptionExpand() {
  try {
    const root = getYouTubeExpanderRoot();
    const candidates = [
      '#expand',
      'tp-yt-paper-button#expand',
      'tp-yt-paper-button[aria-label*="more" i]',
      'button[aria-label*="more" i]'
    ];
    let btn = null;
    for (const sel of candidates) {
      const el = root ? root.querySelector(sel) : document.querySelector(sel);
      if (el && !el.hasAttribute('hidden')) { btn = el; break; }
    }
    if (!btn) return false;
    const cs = window.getComputedStyle(btn);
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
    if (btn.getAttribute('aria-disabled') === 'true') return false;
    try { (root || btn).scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch (_) {}
    const events = [
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }),
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }),
      new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true }),
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }),
      new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
    ];
    for (const e of events) {
      try { btn.dispatchEvent(e); } catch (_) {}
    }
    try { btn.click(); } catch (_) {}
    return true;
  } catch (_) {}
  return false;
}

function isYouTubeDescriptionExpanded() {
  try {
    const root = getYouTubeExpanderRoot();
    if (!root) return false;
    if (root.hasAttribute('is-expanded')) return true;
    const collapseBtn = root.querySelector('tp-yt-paper-button#collapse, #collapse');
    if (collapseBtn) return true;
    const expandedEl = root.querySelector('#expanded');
    if (expandedEl) {
      const st = window.getComputedStyle(expandedEl);
      if (st && st.display !== 'none' && st.visibility !== 'hidden' && st.height !== '0px') return true;
    }
  } catch (_) {}
  return false;
}

async function ensureYouTubeDescriptionExpanded(ctx) {
  if (isYouTubeDescriptionExpanded()) return true;
  await waitForCondition(ctx, () => !!getYouTubeExpanderRoot(), { timeout: 3000, interval: 80 });
  clickYouTubeDescriptionExpand();
  let baselineLen = 0;
  try {
    const root = getYouTubeExpanderRoot();
    baselineLen = root ? (root.innerText || '').length : 0;
  } catch (_) {}
  let expanded = await waitForCondition(ctx, () => {
    if (isYouTubeDescriptionExpanded()) return true;
    try {
      const root = getYouTubeExpanderRoot();
      if (!root) return false;
      const len = (root.innerText || '').length;
      return len > baselineLen + 40;
    } catch (_) { return false; }
  }, { timeout: 5000, interval: 80 });
  if (!expanded) {
    await waitMs(ctx, 150);
    clickYouTubeDescriptionExpand();
    expanded = await waitForCondition(ctx, () => isYouTubeDescriptionExpanded(), { timeout: 3500, interval: 80 });
  }
  return expanded;
}

function getYouTubeDescriptionFromPage() {
  for (const it of collectVideoObjects()) {
    if (typeof it.description === 'string' && it.description.trim()) {
      const desc = normaliseText(it.description, 5000);
      if (desc) return desc;
    }
  }
  const selectors = [
    'ytd-watch-metadata #description-inline-expander #expanded',
    'ytd-watch-metadata #description-inline-expander',
    'ytd-watch-metadata ytd-text-inline-expander #expanded',
    'ytd-watch-metadata ytd-text-inline-expander',
    '#description',
    'ytd-expander#description'
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el && el.innerText) {
        const text = el.innerText.replace(/^(Show more|More)\s*/i, '');
        const normalised = normaliseText(text, 2000);
        if (normalised) return normalised;
      }
    } catch (_) { /* ignore */ }
  }
  try {
    const meta = document.querySelector('meta[name="description"]');
    if (meta && meta.content) {
      return normaliseText(meta.content, 1000);
    }
  } catch (_) {}
  return '';
}

const youtube = {
  buttonSelector: [
    'button#like-button',
    'ytd-toggle-button-renderer button',
    'button[aria-label*="like"]'
  ],
  containerSelector: ['ytd-watch-metadata', 'body'],
  hooks: {
    toggledOnAfterClick: async (button, ctx = {}) => {
      await waitMs(ctx, 80);
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
    getTitle: async (_button, _ctx = {}) => {
      if (isYouTubeShortsPage()) {
        const shorts = getYouTubeShortsTitle();
        if (shorts) return shorts;
      }
      return getYouTubeTitleFromPage();
    },
    getExcerpt: async (_button, ctx = {}) => {
      if (isYouTubeShortsPage()) {
        const shortsDesc = getYouTubeShortsDescription();
        if (shortsDesc) return shortsDesc;
      }
      let desc = getYouTubeDescriptionFromPage();
      if (!desc || desc.length < 400) {
        try {
          await ensureYouTubeDescriptionExpanded(ctx);
          const retryDelay = (ctx && ctx.timing && typeof ctx.timing.YOUTUBE_DESCRIPTION_RETRY_MS === 'number')
            ? ctx.timing.YOUTUBE_DESCRIPTION_RETRY_MS
            : 120;
          await waitMs(ctx, retryDelay);
          desc = getYouTubeDescriptionFromPage();
        } catch (_) { /* ignore */ }
      }
      return desc || '';
    }
  }
};

export default youtube;
