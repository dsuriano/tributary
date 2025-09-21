// Content script for the Social Media to Raindrop.io extension.
//
// This script is injected into supported social media sites (Twitter/X,
// YouTube, Reddit) and listens for clicks on the native like/upvote
// buttons. When such a click occurs the script performs a smart link
// extraction algorithm to determine the correct URL to bookmark and
// sends a message to the background service worker to create the
// raindrop. Feedback is provided to the user via toast messages.

(() => {
  const DEBOUNCE_DELAY = 500; // milliseconds
  let lastClickTime = 0;

  /**
   * Load the site selector configuration from the extension package.
   * Returns a promise that resolves to the mapping object.
   */
  async function loadConfig() {
    const module = await import(chrome.runtime.getURL('scripts/site_selectors.js'));
    return module.default || module.siteSelectors;
  }

  function isYouTubeShortsPage() {
    try {
      const p = window.location.pathname || '';
      return /^\/shorts\//.test(p);
    } catch (_) { return false; }
  }

  function getYouTubeShortsTitle() {
    // Prefer LD+JSON VideoObject.name
    try {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const s of scripts) {
        try {
          const data = JSON.parse(s.textContent || 'null');
          const items = Array.isArray(data) ? data : [data];
          for (const it of items) {
            if (it && (it['@type'] === 'VideoObject' || (Array.isArray(it['@type']) && it['@type'].includes('VideoObject'))) && typeof it.name === 'string') {
              const t = normaliseText(it.name, 200);
              if (t) return t;
            }
          }
        } catch (_) { }
      }
    } catch (_) { }
    // Fallback to overlay title nodes
    const sel = [
      '#reel-player-overlay-renderer #title yt-formatted-string',
      'ytd-reel-player-overlay-renderer #title yt-formatted-string',
      '#reel-player-overlay-renderer #title',
      'ytd-reel-player-overlay-renderer #title',
      '#shorts-title',
      'ytd-reel-video-renderer #shorts-title'
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el && (el.innerText || el.textContent)) {
        const t = normaliseText(el.innerText || el.textContent, 200);
        if (t) return t;
      }
    }
    return normaliseText(document.title || '', 200);
  }

  function getYouTubeShortsDescription() {
    // Prefer LD+JSON VideoObject.description
    try {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const s of scripts) {
        try {
          const data = JSON.parse(s.textContent || 'null');
          const items = Array.isArray(data) ? data : [data];
          for (const it of items) {
            if (it && (it['@type'] === 'VideoObject' || (Array.isArray(it['@type']) && it['@type'].includes('VideoObject'))) && typeof it.description === 'string') {
              const d = normaliseText(it.description, 4000);
              if (d) return d;
            }
          }
        } catch (_) { }
      }
    } catch (_) { }
    // Fallback to overlay text content (caption/description snippet)
    const sel = [
      '#reel-player-overlay-renderer ytd-reel-player-overlay-renderer yt-core-attributed-string',
      'ytd-reel-player-overlay-renderer yt-core-attributed-string',
      '#reel-player-overlay-renderer',
      'ytd-reel-player-overlay-renderer'
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el && el.innerText) {
        const t = normaliseText(el.innerText, 1000);
        if (t) return t;
      }
    }
    // Meta description fallback
    try {
      const meta = document.querySelector('meta[name="description"]');
      if (meta && meta.content) return normaliseText(meta.content, 1000);
    } catch (_) {}
    return '';
  }

  /**
   * Wait briefly to allow the DOM to reflect a toggle state after a click.
   */
  function wait(ms = 60) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Determine if the clicked control is transitioning to the positive state.
   * We only save when moving from neutral -> liked/upvoted, not when unliking.
   * Uses aria attributes where available.
   */
  async function isToggledOnAfterClick(host, button) {
    // Give the UI a brief moment to update its aria-* attributes
    await wait(80);
    const inContainer = (root) => {
      if (!root) return false;
      return !!root.querySelector('[aria-pressed="true"], [aria-checked="true"], [aria-selected="true"], .style-default-active');
    };
    const hasPressed = (el) => {
      if (!el) return false;
      const ap = el.getAttribute('aria-pressed');
      const ac = el.getAttribute('aria-checked');
      const as = el.getAttribute('aria-selected');
      const cls = el.className || '';
      return ap === 'true' || ac === 'true' || as === 'true' || (typeof cls === 'string' && cls.includes('style-default-active'));
    };
    try {
      if (host === 'youtube.com') {
        const toggleRoot = button.closest('ytd-toggle-button-renderer') || button.closest('#like-button') || button;
        // Prefer the inner <button>
        const innerBtn = toggleRoot.querySelector('button') || toggleRoot;
        return hasPressed(innerBtn) || inContainer(toggleRoot);
      }
      if (host === 'twitter.com' || host === 'x.com') {
        // Twitter like button uses aria-pressed
        const innerBtn = button.closest('[data-testid="like"]') || button;
        return hasPressed(innerBtn);
      }
      if (host === 'reddit.com') {
        const innerBtn = button.closest('button[aria-label="upvote"]') || button;
        return hasPressed(innerBtn);
      }
      // Generic fallback
      return hasPressed(button) || inContainer(button.closest('*'));
    } catch (_) {
      return false;
    }
  }

  /**
   * Small utility to wait for a condition with polling.
   * Returns a promise that resolves true if condition met within timeout, else false.
   */
  function waitForCondition(predicate, { timeout = 1500, interval = 50 } = {}) {
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

  /**
   * Normalise whitespace in extracted text.
   * Collapses multiple spaces and trims leading/trailing whitespace.
   * Limits to a max length if provided.
   */
  function normaliseText(text, maxLen = 0) {
    if (!text) return '';
    let t = String(text).replace(/\s+/g, ' ').trim();
    if (maxLen > 0 && t.length > maxLen) {
      t = t.slice(0, maxLen);
    }
    return t;
  }

  /**
   * YouTube helpers: extract title and description from the watch page.
   * These aim to be resilient to DOM changes by checking several selectors
   * and falling back to meta tags.
   */
  function getYouTubeTitle() {
    try {
      const titleEl = document.querySelector('ytd-watch-metadata h1 yt-formatted-string')
        || document.querySelector('ytd-watch-metadata h1')
        || document.querySelector('h1.title')
        || document.querySelector('meta[name="title"]');
      if (titleEl) {
        const raw = titleEl.getAttribute && titleEl.getAttribute('content') ? titleEl.getAttribute('content') : (titleEl.textContent || '');
        return normaliseText(raw, 200);
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
      // Simulate pointer + mouse click sequences
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
      // Attribute or collapse button indicate expanded state
      if (root.hasAttribute('is-expanded')) return true;
      const collapseBtn = root.querySelector('tp-yt-paper-button#collapse, #collapse');
      if (collapseBtn) return true;
      // Some layouts reveal a div#expanded when opened
      const expandedEl = root.querySelector('#expanded');
      if (expandedEl) {
        const st = window.getComputedStyle(expandedEl);
        if (st && st.display !== 'none' && st.visibility !== 'hidden' && st.height !== '0px') return true;
      }
    } catch (_) {}
    return false;
  }

  async function ensureYouTubeDescriptionExpanded() {
    if (isYouTubeDescriptionExpanded()) return true;
    // Wait for expander root to exist on SPA navigations
    await waitForCondition(() => !!getYouTubeExpanderRoot(), { timeout: 3000, interval: 80 });
    clickYouTubeDescriptionExpand();
    // Wait for visual expanded state or increased content
    let baselineLen = 0;
    try {
      const root = getYouTubeExpanderRoot();
      baselineLen = root ? (root.innerText || '').length : 0;
    } catch (_) {}
    let expanded = await waitForCondition(() => {
      if (isYouTubeDescriptionExpanded()) return true;
      try {
        const root = getYouTubeExpanderRoot();
        if (!root) return false;
        const len = (root.innerText || '').length;
        return len > baselineLen + 40; // significant growth
      } catch (_) { return false; }
    }, { timeout: 5000, interval: 80 });
    if (!expanded) {
      // Try one more click after a small delay
      await new Promise(r => setTimeout(r, 150));
      clickYouTubeDescriptionExpand();
      expanded = await waitForCondition(() => isYouTubeDescriptionExpanded(), { timeout: 3500, interval: 80 });
    }
    return expanded;
  }

  function getYouTubeDescription() {
    // 1) Prefer structured data JSON to avoid UI interaction and ensure full text
    try {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const s of scripts) {
        try {
          const data = JSON.parse(s.textContent || 'null');
          const items = Array.isArray(data) ? data : [data];
          for (const it of items) {
            if (it && (it['@type'] === 'VideoObject' || (Array.isArray(it['@type']) && it['@type'].includes('VideoObject'))) && typeof it.description === 'string') {
              const desc = normaliseText(it.description, 5000);
              if (desc) return desc;
            }
          }
        } catch (_) { /* ignore single script parse errors */ }
      }
    } catch (_) { /* ignore */ }

    // 2) Fallback to DOM-based selectors (expanded if possible)
    const trySelectors = [
      // New watch page inline expander
      'ytd-watch-metadata #description-inline-expander #expanded',
      'ytd-watch-metadata #description-inline-expander',
      // Generic text inline expander
      'ytd-watch-metadata ytd-text-inline-expander #expanded',
      'ytd-watch-metadata ytd-text-inline-expander',
      // Older description container
      '#description',
      // Fallbacks
      'ytd-expander#description',
    ];
    for (const sel of trySelectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.innerText) {
          const text = el.innerText.replace(/^(Show more|More)\s*/i, '');
          const normalised = normaliseText(text, 2000);
          if (normalised) return normalised;
        }
      } catch (_) { /* ignore */ }
    }
    // Meta description as a conservative fallback
    try {
      const meta = document.querySelector('meta[name="description"]');
      if (meta && meta.content) {
        return normaliseText(meta.content, 1000);
      }
    } catch (_) {}
    return '';
  }

  /**
   * Build a toast container if it doesn't already exist.
   */
  function ensureToastContainer() {
    let container = document.getElementById('raindrop-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'raindrop-toast-container';
      Object.assign(container.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: '2147483647',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end'
      });
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Display a toast message at the bottom of the page. Messages fade
   * out automatically after three seconds. An optional `success`
   * parameter may be provided to colour the toast green for success or
   * red for errors. If omitted a neutral dark colour is used.
   *
   * @param {string} message Text to display.
   * @param {boolean|null} success Outcome state: true for success,
   *   false for error, null/undefined for neutral/in-progress.
   */
  function showToast(message, success = null) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.textContent = message;
    // Base styling
    Object.assign(toast.style, {
      color: '#fff',
      marginTop: '8px',
      borderRadius: '4px',
      padding: '8px 12px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      opacity: '1',
      transition: 'opacity 0.5s ease-out',
      maxWidth: '320px'
    });
    // Colour based on status
    if (success === true) {
      toast.style.background = '#4CAF50'; // green
    } else if (success === false) {
      toast.style.background = '#e53935'; // red
    } else {
      toast.style.background = '#333'; // neutral dark
    }
    container.appendChild(toast);
    // Schedule removal after fade
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
      }, 500);
    }, 3000);
  }

  /**
   * Traverse up the DOM tree from a target element to find the first
   * element that matches one of the provided selectors.
   *
   * @param {Element} el The element on which the event occurred.
   * @param {string[]} selectors A list of CSS selectors to test.
   * @returns {Element|null} The matching element or null if none found.
   */
  function findButton(el, selectors) {
    let current = el;
    while (current && current !== document && current.nodeType === Node.ELEMENT_NODE) {
      for (const sel of selectors) {
        if (typeof sel === 'string' && current.matches && current.matches(sel)) {
          return current;
        }
      }
      current = current.parentElement;
    }
    return null;
  }

  /**
   * Extract the URL to bookmark based on the smart link extraction algorithm.
   *
   * Step A: ascend to the nearest container matching one of the
   * provided container selectors. If none match the current document
   * is used as the container.
   * Step B: search the container for an <a> element whose href
   * resolves to a domain different to the current page. Return the
   * first such link.
   * Step C: fall back to the canonical URL of the page or, if absent,
   * the current page URL.
   *
   * @param {Element} button The clicked button.
   * @param {string[]} containerSelectors Possible selectors for the content container.
   * @returns {string} The determined URL to save.
   */
  function extractLink(button, containerSelectors) {
    // Special handling for certain sites to build canonical permalinks
    try {
      const host = window.location.hostname.replace(/^www\./, '');
      // YouTube: construct a stable permalink from current location to avoid stale DOM/canonical during SPA transitions
      if (host === 'youtube.com') {
        try {
          const loc = new URL(window.location.href);
          const path = loc.pathname || '';
          // Shorts URL
          const shortsMatch = path.match(/^\/shorts\/([a-zA-Z0-9_-]{8,})/);
          if (shortsMatch && shortsMatch[1]) {
            return `${loc.origin}/shorts/${shortsMatch[1]}`;
          }
          // Watch URL with v param
          const v = loc.searchParams.get('v');
          if (path.startsWith('/watch') && v) {
            return `${loc.origin}/watch?v=${encodeURIComponent(v)}`;
          }
        } catch (_) { /* ignore and fallback below */ }
      }
      if (host === 'twitter.com' || host === 'x.com') {
        const article = button.closest('article') || document.querySelector('article');
        if (article) {
          // The time/link to the tweet typically uses a relative href with /status/<id>
          const statusAnchors = article.querySelectorAll('a[href*="/status/"]');
          // Choose the last anchor which usually points to the tweet timestamp/permalink
          const anchor = statusAnchors[statusAnchors.length - 1];
          if (anchor) {
            const href = anchor.getAttribute('href') || '';
            // Build absolute URL against current origin (x.com or twitter.com)
            const url = new URL(href, window.location.origin);
            // Normalize to end with /status/<id>
            try {
              const parts = url.pathname.split('/').filter(Boolean);
              const statusIdx = parts.indexOf('status');
              if (statusIdx !== -1 && parts[statusIdx + 1]) {
                const id = parts[statusIdx + 1];
                // If a username exists before 'status', preserve it
                const username = statusIdx > 0 ? parts[statusIdx - 1] : null;
                let normalizedPath = '';
                if (username) {
                  normalizedPath = `/${username}/status/${id}`;
                } else {
                  // Fallback if username is missing (e.g., /i/web/status/<id>)
                  normalizedPath = `/status/${id}`;
                }
                url.pathname = normalizedPath;
                url.hash = '';
                url.search = '';
              }
            } catch (_) { /* ignore */ }
            return url.href;
          }
        }
      }
    } catch (e) {
      // If any error occurs, fall back to generic extraction below
    }
    let container = null;
    if (Array.isArray(containerSelectors)) {
      for (const sel of containerSelectors) {
        if (sel && typeof sel === 'string') {
          const match = button.closest(sel);
          if (match) {
            container = match;
            break;
          }
        }
      }
    } else if (typeof containerSelectors === 'string') {
      container = button.closest(containerSelectors);
    }
    if (!container) {
      container = document;
    }
    // Step B: find external link
    const anchors = container.querySelectorAll('a[href]');
    for (const anchor of anchors) {
      const href = anchor.getAttribute('href');
      if (!href) continue;
      // Skip anchors with hashes or javascript pseudo links
      if (href.startsWith('#') || href.startsWith('javascript:')) continue;
      try {
        const url = new URL(anchor.href, document.baseURI);
        if (url.hostname && url.hostname !== window.location.hostname) {
          return url.href;
        }
      } catch (err) {
        // ignore malformed URLs
      }
    }
    // Step C: canonical or page URL
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    if (canonicalEl && canonicalEl.href) {
      return canonicalEl.href;
    }
    return window.location.href;
  }

  /**
   * Handle a valid button click: extract the link and send it to the
   * background script. A neutral toast is displayed while the network
   * request is performed. The final outcome is handled by a listener
   * registered in start().
   *
   * @param {Element} button The button that was clicked.
   * @param {string[]} containerSelectors List of container selectors for the site.
   */
  async function processClick(button, containerSelectors) {
    const host = window.location.hostname.replace(/^www\./, '');
    // Only proceed if the click resulted in toggled ON state (like/upvote on)
    const toggledOn = await isToggledOnAfterClick(host, button);
    if (!toggledOn) {
      return; // ignore neutral->off or on->off transitions
    }
    const url = extractLink(button, containerSelectors);
    if (!url) {
      showToast('Error: Unable to extract link.', false);
      return;
    }
    // Provide immediate feedback
    showToast('Saving to Raindrop.io…');
    let title = document.title || '';
    // Extract a brief excerpt. For Twitter/X and YouTube, use site-specific logic.
    let excerpt = '';
    if (host === 'twitter.com' || host === 'x.com') {
      const article = button.closest('article') || document.querySelector('article');
      if (article) {
        // Gather all tweet text nodes (tweets can be split into multiple nodes)
        const textNodes = article.querySelectorAll('[data-testid="tweetText"]');
        let combined = '';
        textNodes.forEach((n) => {
          combined += (n.innerText || n.textContent || '').trim() + ' ';
        });
        combined = combined.trim();
        if (combined) {
          excerpt = combined.substring(0, 500);
          // Use the first portion of the tweet as the title for better readability
          title = combined.substring(0, 80);
        }
      }
    } else if (host === 'youtube.com') {
      // Prefer the actual video description rather than random sidebar text.
      if (isYouTubeShortsPage()) {
        // Shorts: use dedicated extractors
        title = getYouTubeShortsTitle();
        let desc = getYouTubeShortsDescription();
        if (desc) {
          excerpt = desc;
        }
      } else {
        title = getYouTubeTitle();
        // Read whatever is currently available; if too short, force expansion and re-read.
        let desc = getYouTubeDescription();
        if (!desc || desc.length < 400) {
          try {
            await ensureYouTubeDescriptionExpanded();
            // Give the DOM a moment to populate the expanded content
            await new Promise(r => setTimeout(r, 120));
            desc = getYouTubeDescription();
          } catch (_) { /* ignore */ }
        }
        if (desc) {
          excerpt = desc;
        }
      }
    }
    // Generic fallback if excerpt still empty
    if (!excerpt) {
      const container = button.closest((containerSelectors && containerSelectors[0]) || '') || document;
      if (container && container.textContent) {
        excerpt = container.textContent.trim().substring(0, 500);
      }
    }
    chrome.runtime.sendMessage({
      action: 'save',
      data: {
        url,
        title,
        excerpt
      }
    });
  }

  /**
   * Initialise the content script: load configuration, check if the
   * current site is enabled, then register click and message
   * handlers.
   */
  async function init() {
    const configMap = await loadConfig();
    const host = window.location.hostname.replace(/^www\./, '');
    const siteConfig = configMap[host];
    if (!siteConfig) {
      return; // unsupported site
    }
    // Retrieve enablement settings
    chrome.storage.local.get(['enabledDomains'], (result) => {
      const enabled = result.enabledDomains || {};
      // Domain is enabled by default if not explicitly set to false
      if (enabled.hasOwnProperty(host) && enabled[host] === false) {
        return;
      }
      const buttonSelectors = Array.isArray(siteConfig.buttonSelector) ? siteConfig.buttonSelector : [siteConfig.buttonSelector];
      const containerSelectors = Array.isArray(siteConfig.containerSelector) ? siteConfig.containerSelector : [siteConfig.containerSelector];
      // Listen for click events using capture phase to catch early
      document.addEventListener('click', (event) => {
        // Debounce rapid clicks
        const now = Date.now();
        if (now - lastClickTime < DEBOUNCE_DELAY) {
          return;
        }
        lastClickTime = now;
        const btn = findButton(event.target, buttonSelectors);
        if (btn) {
          processClick(btn, containerSelectors);
        }
      }, true);
      // Listen for responses from the background
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message && message.type === 'saveResult') {
          if (message.status === 'success') {
            showToast('Saved to Raindrop.io!', true);
          } else {
            showToast(message.error || 'Error saving bookmark.', false);
          }
        }
      });
    });
  }

  // Kick off the initialisation when the content script loads
  init().catch((err) => {
    console.error('Raindrop extension initialisation failed:', err);
  });
})();