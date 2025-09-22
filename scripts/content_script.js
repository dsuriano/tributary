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
  let DEBUG = false;
  // Track last pointer/mouse position and time to correlate with fallback scans
  const LAST_EVENT = { x: 0, y: 0, time: 0 };
  // Deduplicate saves by button element and URL within a short window
  const processedButtonsTS = new WeakMap(); // Element -> timestamp
  const recentUrlsTS = new Map(); // url -> timestamp
  // Track last known ON state (aria-pressed/checked true) per element
  const lastOnState = new WeakMap(); // Element -> boolean
  // Track pre-click ON state captured at input event time
  const preClickOnState = new WeakMap(); // Element -> boolean

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

  // When events originate inside Shadow DOM, walking parentElement may not cross
  // the shadow boundary. Prefer scanning the composed path for a direct match.
  function findButtonInComposedPath(event, selectors) {
    try {
      if (!event || typeof event.composedPath !== 'function') return null;
      const path = event.composedPath();
      for (const node of path) {
        if (node && node.nodeType === Node.ELEMENT_NODE) {
          for (const sel of selectors) {
            if (typeof sel === 'string' && node.matches && node.matches(sel)) {
              return node;
            }
          }
        }
      }
    } catch (_) { /* ignore */ }
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
   * Compute permalink using a site-specific hook if provided; otherwise
   * fall back to the generic extractLink().
   * @param {Element} button
   * @param {object} siteConfig
   * @returns {string}
   */
  function computePermalink(button, siteConfig) {
    try {
      const hooks = (siteConfig && siteConfig.hooks) || {};
      if (hooks && typeof hooks.getPermalink === 'function') {
        const v = hooks.getPermalink(button);
        if (typeof v === 'string' && v) return v;
      }
    } catch (_) { /* ignore and fallback */ }
    const containerSelectors = Array.isArray(siteConfig?.containerSelector)
      ? siteConfig.containerSelector
      : [siteConfig?.containerSelector].filter(Boolean);
    return extractLink(button, containerSelectors);
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
  async function processClick(button, siteConfig) {
    const host = window.location.hostname.replace(/^www\./, '');
    // Only proceed if the click resulted in toggled ON state (like/upvote on)
    let toggledOn = false;
    try {
      const hooks = (siteConfig && siteConfig.hooks) || {};
      if (hooks && typeof hooks.toggledOnAfterClick === 'function') {
        const hookResult = !!(await hooks.toggledOnAfterClick(button));
        if (hookResult) {
          toggledOn = true;
          if (DEBUG) console.debug('[Raindrop CS] Hook toggle detection: ON');
        } else {
          // Fallback to generic detector when hook returns false
          toggledOn = await isToggledOnAfterClick(host, button);
          if (DEBUG) console.debug('[Raindrop CS] Hook false, generic toggle=', toggledOn);
        }
      } else {
        toggledOn = await isToggledOnAfterClick(host, button);
      }
    } catch (_) {
      toggledOn = await isToggledOnAfterClick(host, button);
    }
    if (!toggledOn) {
      if (DEBUG) console.debug('[Raindrop CS] Click ignored (toggle not ON)');
      return; // ignore neutral->off or on->off transitions
    }
    // Additional protection for all hosts: require rising edge (prev OFF -> now ON)
    try {
      const prev = preClickOnState.get(button);
      preClickOnState.delete(button);
      if (prev === true) {
        if (DEBUG) console.debug('[Raindrop CS] Ignoring toggle-off (was ON before click)');
        return;
      }
    } catch (_) { /* ignore */ }
    const url = computePermalink(button, siteConfig);
    // Deduplicate by URL to avoid double saves from multiple detectors
    try {
      const now = Date.now();
      const prev = recentUrlsTS.get(url);
      if (prev && (now - prev) < 2000) {
        if (DEBUG) console.debug('[Raindrop CS] Skipping duplicate URL save', url);
        return;
      }
      recentUrlsTS.set(url, now);
    } catch (_) { /* ignore */ }
    if (!url) {
      showToast('Error: Unable to extract link.', false);
      return;
    }
    // Provide immediate feedback
    showToast('Saving to Raindrop.io…');
    let title = document.title || '';
    // Extract a brief excerpt. For Twitter/X and YouTube, use site-specific logic.
    let excerpt = '';
    try {
      const hooks = (siteConfig && siteConfig.hooks) || {};
      if (hooks && typeof hooks.getTitle === 'function') {
        const t = hooks.getTitle(button);
        if (typeof t === 'string' && t) title = t;
      }
      if (hooks && typeof hooks.getExcerpt === 'function') {
        const e = hooks.getExcerpt(button);
        if (typeof e === 'string' && e) excerpt = e;
      }
    } catch (_) { /* ignore hook errors and fall back */ }
    if (!excerpt) {
      if (host === 'twitter.com' || host === 'x.com') {
        const article = button.closest('article') || document.querySelector('article');
        if (article) {
          const textNodes = article.querySelectorAll('[data-testid="tweetText"]');
          let combined = '';
          textNodes.forEach((n) => {
            combined += (n.innerText || n.textContent || '').trim() + ' ';
          });
          combined = combined.trim();
          if (combined) {
            excerpt = combined.substring(0, 500);
            title = title || combined.substring(0, 80);
          }
        }
      } else if (host === 'youtube.com') {
        if (isYouTubeShortsPage()) {
          title = title || getYouTubeShortsTitle();
          let desc = getYouTubeShortsDescription();
          if (desc) {
            excerpt = desc;
          }
        } else {
          title = title || getYouTubeTitle();
          let desc = getYouTubeDescription();
          if (!desc || desc.length < 400) {
            try {
              await ensureYouTubeDescriptionExpanded();
              await new Promise(r => setTimeout(r, 120));
              desc = getYouTubeDescription();
            } catch (_) { /* ignore */ }
          }
          if (desc) {
            excerpt = desc;
          }
        }
      }
    }
    // Generic fallback if excerpt still empty
    if (!excerpt) {
      const containerSelectors = Array.isArray(siteConfig?.containerSelector)
        ? siteConfig.containerSelector
        : [siteConfig?.containerSelector].filter(Boolean);
      const container = button.closest((containerSelectors && containerSelectors[0]) || '') || document;
      if (container && container.textContent) {
        excerpt = container.textContent.trim().substring(0, 500);
      }
    }
    if (DEBUG) console.debug('[Raindrop CS] Saving', { url, titleLen: (title||'').length, excerptLen: (excerpt||'').length });
    chrome.runtime.sendMessage({
      action: 'save',
      data: {
        url,
        title,
        excerpt
      }
    });
    // Mark button as processed to avoid immediate re-processing
    try { processedButtonsTS.set(button, Date.now()); } catch (_) {}
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
    chrome.storage.local.get(['enabledDomains', 'debugLogging'], (result) => {
      const enabled = result.enabledDomains || {};
      DEBUG = !!result.debugLogging;
      if (DEBUG) console.debug('[Raindrop CS] Init', { host, enabled: !(enabled.hasOwnProperty(host) && enabled[host] === false) });
      // Domain is enabled by default if not explicitly set to false
      if (enabled.hasOwnProperty(host) && enabled[host] === false) {
        return;
      }
      const buttonSelectors = Array.isArray(siteConfig.buttonSelector) ? siteConfig.buttonSelector : [siteConfig.buttonSelector];
      const handleInputEvent = (event) => {
        // Debounce rapid clicks
        const now = Date.now();
        if (now - lastClickTime < DEBOUNCE_DELAY) {
          return;
        }
        lastClickTime = now;
        // Remember pointer position/time for proximity-based fallback
        try {
          const pt = /** @type {MouseEvent|PointerEvent} */ (event);
          if (typeof pt.clientX === 'number' && typeof pt.clientY === 'number') {
            LAST_EVENT.x = pt.clientX;
            LAST_EVENT.y = pt.clientY;
            LAST_EVENT.time = now;
          }
        } catch (_) {}
        let btn = findButtonInComposedPath(event, buttonSelectors);
        if (!btn) {
          btn = findButton(event.target, buttonSelectors);
        }
        if (btn) {
          // Element-level dedupe window
          const ts = processedButtonsTS.get(btn);
          if (ts && (Date.now() - ts) < 1500) return;
          // Capture pre-click ON state to detect rising edge vs falling edge later
          try {
            const ap0 = btn.getAttribute('aria-pressed');
            const ac0 = btn.getAttribute('aria-checked');
            const wasOn = ap0 === 'true' || ac0 === 'true';
            preClickOnState.set(btn, wasOn);
          } catch (_) { }
          if (DEBUG) console.debug('[Raindrop CS] Matched button', btn);
          processClick(btn, siteConfig);
        } else if (host === 'reddit.com') {
          // Fallback: after a short delay, scan for any button that is now toggled ON
          setTimeout(() => {
            try {
              const sels = buttonSelectors.filter(Boolean).join(', ');
              if (!sels) return;
              const candidates = Array.from(document.querySelectorAll(sels));
              // Prefer the ON candidate nearest to the last pointer event
              const now2 = Date.now();
              const recentEnough = (now2 - LAST_EVENT.time) < 3000;
              let best = null; let bestDist = Infinity;
              for (const el of candidates) {
                const ap = el.getAttribute('aria-pressed');
                const ac = el.getAttribute('aria-checked');
                if (ap === 'true' || ac === 'true') {
                  const prevOn = lastOnState.get(el) === true;
                  if (prevOn) continue; // already ON previously; not a rising edge
                  const ts2 = processedButtonsTS.get(el);
                  if (ts2 && (now2 - ts2) < 1500) continue;
                  if (recentEnough && el.getBoundingClientRect) {
                    const r = el.getBoundingClientRect();
                    const cx = r.left + r.width/2, cy = r.top + r.height/2;
                    const dx = cx - LAST_EVENT.x, dy = cy - LAST_EVENT.y;
                    const d = Math.hypot(dx, dy);
                    if (d < bestDist) { bestDist = d; best = el; }
                  } else {
                    best = el; break;
                  }
                } else {
                  // Store OFF state for future comparison
                  lastOnState.set(el, false);
                }
              }
              if (best) {
                if (DEBUG) console.debug('[Raindrop CS] Fallback scan matched button', best);
                // Mark as ON to avoid double triggers
                lastOnState.set(best, true);
                processClick(best, siteConfig);
              }
            } catch (_) { }
          }, 150);
        }
      };
      // Listen on multiple event types to handle sites that prevent default click
      const eventsToListen = ['click', 'pointerup', 'mousedown'];
      for (const evt of eventsToListen) {
        document.addEventListener(evt, handleInputEvent, true);
      }

      // For Reddit specifically, also observe aria-* attribute changes to catch
      // state toggles that don't surface as input events (Shadow DOM, etc.).
      if (host === 'reddit.com') {
        const seen = new WeakSet();
        const matchesAny = (el) => {
          if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
          for (const sel of buttonSelectors) {
            try { if (typeof sel === 'string' && el.matches && el.matches(sel)) return true; } catch (_) { }
          }
          return false;
        };
        const processIfOn = (target) => {
          try {
            if (!matchesAny(target)) return;
            const ap = target.getAttribute('aria-pressed');
            const ac = target.getAttribute('aria-checked');
            const isOn = ap === 'true' || ac === 'true';
            const prevOn = lastOnState.get(target) === true;
            // Update stored state
            lastOnState.set(target, isOn);
            // Only trigger on rising edge (off -> on)
            if (!isOn || prevOn) return;
            const ts = processedButtonsTS.get(target);
            if (ts && (Date.now() - ts) < 1500) return;
            // Use the same saving flow
            if (DEBUG) console.debug('[Raindrop CS] Mutation matched button', target);
            processClick(target, siteConfig);
          } catch (_) { }
        };
        // Attach attribute observers and event listeners to a given root
        const attachToRoot = (root) => {
          try {
            if (!root || seen.has(root)) return; // reuse WeakSet to avoid duplicates
            seen.add(root);
            // Listen within the shadow root as well
            try {
              for (const evt of eventsToListen) {
                root.addEventListener(evt, handleInputEvent, true);
              }
            } catch (_) { }
            const obs = new MutationObserver((mutations) => {
              for (const m of mutations) {
                if (m.type === 'attributes' && (m.attributeName === 'aria-pressed' || m.attributeName === 'aria-checked')) {
                  const el = /** @type {Element} */ (m.target);
                  processIfOn(el);
                }
                if (m.type === 'childList') {
                  // If new elements with shadowRoot appear, attach to them
                  const all = [];
                  m.addedNodes && m.addedNodes.forEach((n) => { if (n && n.nodeType === Node.ELEMENT_NODE) all.push(n); });
                  for (const n of all) {
                    try {
                      if (n.shadowRoot) attachToRoot(n.shadowRoot);
                      // Also scan descendants for hosts with shadowRoot
                      const walker = document.createTreeWalker(n, NodeFilter.SHOW_ELEMENT);
                      let cur = walker.currentNode;
                      while (cur) {
                        if (cur.shadowRoot) attachToRoot(cur.shadowRoot);
                        cur = walker.nextNode();
                      }
                    } catch (_) { }
                  }
                }
              }
            });
            obs.observe(root, {
              subtree: true,
              attributes: true,
              attributeFilter: ['aria-pressed', 'aria-checked'],
              childList: true
            });
          } catch (_) { }
        };
        const observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === 'attributes' && (m.attributeName === 'aria-pressed' || m.attributeName === 'aria-checked')) {
              const el = /** @type {Element} */ (m.target);
              // Update state and trigger only on rising edge
              processIfOn(el);
            }
            if (m.type === 'childList') {
              // Attach to any new shadow roots
              const nodes = [];
              m.addedNodes && m.addedNodes.forEach((n) => { if (n && n.nodeType === Node.ELEMENT_NODE) nodes.push(n); });
              for (const n of nodes) {
                try {
                  if (n.shadowRoot) attachToRoot(n.shadowRoot);
                  const walker = document.createTreeWalker(n, NodeFilter.SHOW_ELEMENT);
                  let cur = walker.currentNode;
                  while (cur) {
                    if (cur.shadowRoot) attachToRoot(cur.shadowRoot);
                    cur = walker.nextNode();
                  }
                } catch (_) { }
              }
            }
          }
        });
        try {
          observer.observe(document.documentElement || document, {
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-pressed', 'aria-checked'],
            childList: true
          });
        } catch (_) { /* ignore */ }
        // Attach to existing shadow roots
        try {
          const walker = document.createTreeWalker(document, NodeFilter.SHOW_ELEMENT);
          let node = walker.currentNode;
          while (node) {
            if (node instanceof Element && node.shadowRoot) {
              attachToRoot(node.shadowRoot);
            }
            node = walker.nextNode();
          }
        } catch (_) { }

        // Last-resort polling fallback (closed shadow roots, missed events)
        try {
          const POLL_MS = 800;
          setInterval(() => {
            try {
              const sels = buttonSelectors.filter(Boolean).join(', ');
              if (!sels) return;
              const list = Array.from(document.querySelectorAll(sels));
              const now3 = Date.now();
              const recentEnough = (now3 - LAST_EVENT.time) < 3000;
              let best = null; let bestDist = Infinity;
              for (const el of list) {
                try {
                  const ap = el.getAttribute('aria-pressed');
                  const ac = el.getAttribute('aria-checked');
                  if (ap === 'true' || ac === 'true') {
                    const prevOn = lastOnState.get(el) === true;
                    if (prevOn) continue; // not a rising edge
                    const ts = processedButtonsTS.get(el);
                    if (ts && (now3 - ts) < 1500) continue;
                    if (recentEnough && el.getBoundingClientRect) {
                      const r = el.getBoundingClientRect();
                      const cx = r.left + r.width/2, cy = r.top + r.height/2;
                      const d = Math.hypot(cx - LAST_EVENT.x, cy - LAST_EVENT.y);
                      if (d < bestDist) { bestDist = d; best = el; }
                    } else {
                      best = el; break;
                    }
                  } else {
                    lastOnState.set(el, false);
                  }
                } catch (_) { }
              }
              if (best) {
                if (DEBUG) console.debug('[Raindrop CS] Poll matched button', best);
                lastOnState.set(best, true);
                processClick(best, siteConfig);
              }
            } catch (_) { }
          }, POLL_MS);
        } catch (_) { }
      }
      // Listen for responses from the background
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message && message.type === 'saveResult') {
          if (message.status === 'success') {
            showToast('Saved to Raindrop.io!', true);
          } else {
            showToast(message.error || 'Error saving bookmark.', false);
            if (DEBUG) console.debug('[Raindrop CS] Save error', message);
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