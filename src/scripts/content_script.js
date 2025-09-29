import { TIMING, STORAGE_KEYS } from '../config/constants.js';
import { getFromStorage } from '../config/storage.js';

// Content script for the Tributary extension.
//
// This script is injected into supported social media sites (Twitter/X,
// YouTube, Reddit) and listens for clicks on the native like/upvote
// buttons. When such a click occurs the script performs a smart link
// extraction algorithm to determine the correct URL to bookmark and
// sends a message to the background service worker to create the
// raindrop. Feedback is provided to the user via toast messages.

(() => {
  const DEBOUNCE_DELAY = TIMING.CONTENT_CLICK_DEBOUNCE_MS;
  const BUTTON_DEDUPE_WINDOW = TIMING.BUTTON_DEDUPE_WINDOW_MS;
  const URL_DEDUPE_WINDOW = TIMING.URL_DEDUPE_WINDOW_MS;
  const TOAST_DURATION = TIMING.TOAST_DURATION_MS;
  const TOAST_FADE = TIMING.TOAST_FADE_MS;
  let lastClickTime = 0;
  let DEBUG = false;
  let activeToast = null;
  let activeToastTimer = null;
  let activeToastRemovalTimer = null;
  // Track last pointer/mouse position and time to correlate with fallback scans
  const LAST_EVENT = { x: 0, y: 0, time: 0 };
  // Deduplicate saves by button element and URL within a short window
  const processedButtonsTS = new WeakMap(); // Element -> timestamp
  const recentUrlsTS = new Map(); // url -> timestamp
  // Track last known ON state (aria-pressed/checked true) per element
  const lastOnState = new WeakMap(); // Element -> boolean
  // Track pre-click ON state captured at input event time
  const preClickOnState = new WeakMap(); // Element -> boolean

  const runtime = {
    host: null,
    siteConfig: null,
    hooks: {},
    buttonSelectors: [],
    eventsToListen: ['click', 'pointerup', 'mousedown'],
    hookContext: null
  };

  /**
   * Load the site configuration for the current hostname via the modular site registry.
   * Returns a promise that resolves to a single SiteConfig object for this host.
   */
  async function loadConfig() {
    const host = (window.location.hostname || '').replace(/^www\./, '');
    const module = await import(chrome.runtime.getURL('scripts/sites/index.js'));
    const loader = module.loadSiteConfigFor || module.default?.loadSiteConfigFor;
    if (typeof loader === 'function') {
      return await loader(host);
    }
    // If registry is unavailable, return null (unsupported host)
    return null;
  }

  function wait(ms = 60) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Determine if the clicked control is transitioning to the positive state.
   * We only save when moving from neutral -> liked/upvoted, not when unliking.
   * Uses aria attributes where available.
   */
  async function isToggledOnAfterClick(button) {
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

  function createHookContext({ attachInputListeners }) {
    return {
      host: runtime.host,
      buttonSelectors: runtime.buttonSelectors.slice(),
      events: runtime.eventsToListen.slice(),
      attachInputListeners: (root) => {
        try {
          attachInputListeners(root);
        } catch (_) { /* noop */ }
      },
      processButton: (button) => processClick(button),
      state: {
        lastEvent: LAST_EVENT,
        processedButtonsTS,
        lastOnState,
        preClickOnState
      },
      timing: TIMING,
      utils: {
        wait,
        waitForCondition,
        normaliseText
      },
      debugEnabled: () => DEBUG,
      debugLog: (...args) => {
        if (DEBUG) console.debug('[Tributary]', ...args);
      }
    };
  }


  /**
   * Build a toast container if it doesn't already exist.
   */
  function dismissActiveToast(immediate = false) {
    if (!activeToast) return;
    if (activeToastTimer) {
      clearTimeout(activeToastTimer);
      activeToastTimer = null;
    }
    if (activeToastRemovalTimer) {
      clearTimeout(activeToastRemovalTimer);
      activeToastRemovalTimer = null;
    }
    const toast = activeToast;
    if (immediate) {
      if (toast.isConnected) toast.remove();
    } else {
      toast.classList.add('raindrop-toast--closing');
      activeToastRemovalTimer = setTimeout(() => {
        if (toast.isConnected) toast.remove();
      }, Math.max(TOAST_FADE, 500));
    }
    activeToast = null;
  }

  function createToastElement() {
    const toast = document.createElement('div');
    toast.className = 'raindrop-toast raindrop-toast--neutral';
    toast.setAttribute('role', 'status');
    const icon = document.createElement('span');
    icon.className = 'raindrop-toast__icon';
    const label = document.createElement('span');
    label.className = 'raindrop-toast__label';
    const progress = document.createElement('span');
    progress.className = 'raindrop-toast__progress';
    toast.append(icon, label, progress);
    return toast;
  }

  function applyToastState(toast, message, success) {
    toast.classList.remove('raindrop-toast--neutral', 'raindrop-toast--success', 'raindrop-toast--error', 'raindrop-toast--closing');
    let variant = 'raindrop-toast--neutral';
    let iconGlyph = '💧';
    if (success === true) {
      variant = 'raindrop-toast--success';
      iconGlyph = '✓';
    } else if (success === false) {
      variant = 'raindrop-toast--error';
      iconGlyph = '⚠';
    }
    toast.classList.add(variant);
    toast.style.setProperty('--rd-toast-duration', `${TOAST_DURATION}ms`);

    const icon = toast.querySelector('.raindrop-toast__icon');
    if (icon) icon.textContent = iconGlyph;

    const label = toast.querySelector('.raindrop-toast__label');
    if (label) label.textContent = message;

    const existingProgress = toast.querySelector('.raindrop-toast__progress');
    if (existingProgress) {
      const replacement = existingProgress.cloneNode(false);
      replacement.className = 'raindrop-toast__progress';
      existingProgress.replaceWith(replacement);
    } else {
      const progress = document.createElement('span');
      progress.className = 'raindrop-toast__progress';
      toast.appendChild(progress);
    }
  }

  function scheduleToastLifecycle(toast) {
    if (activeToastTimer) {
      clearTimeout(activeToastTimer);
      activeToastTimer = null;
    }
    if (activeToastRemovalTimer) {
      clearTimeout(activeToastRemovalTimer);
      activeToastRemovalTimer = null;
    }
    activeToastTimer = setTimeout(() => {
      toast.classList.add('raindrop-toast--closing');
      activeToastRemovalTimer = setTimeout(() => {
        if (toast.isConnected) toast.remove();
        if (toast === activeToast) {
          activeToast = null;
          activeToastTimer = null;
          activeToastRemovalTimer = null;
        }
      }, Math.max(TOAST_FADE, 500));
    }, TOAST_DURATION);
  }

  function ensureToastStyles() {
    if (document.getElementById('raindrop-toast-styles')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'raindrop-toast-styles';
    style.textContent = `
      #raindrop-toast-container {
        position: fixed;
        top: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        pointer-events: none;
      }
      .raindrop-toast {
        pointer-events: auto;
        color: #f5f6ff;
        border-radius: 16px;
        padding: 14px 18px 14px 52px;
        font-size: 15px;
        line-height: 1.4;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        box-shadow: 0 20px 45px rgba(38, 23, 83, 0.35);
        position: relative;
        overflow: hidden;
        min-width: 280px;
        max-width: min(420px, 92vw);
        backdrop-filter: blur(18px) saturate(140%);
        border: 1px solid rgba(255, 255, 255, 0.18);
        opacity: 0;
        transform: translateY(-16px) scale(0.96);
        animation: rd-toast-enter 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }
      .raindrop-toast::before {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at top right, rgba(255, 255, 255, 0.35), transparent 55%);
        mix-blend-mode: screen;
        opacity: 0.75;
      }
      .raindrop-toast::after {
        content: '';
        position: absolute;
        width: 160px;
        height: 160px;
        top: -80px;
        right: -60px;
        background: radial-gradient(circle, rgba(255, 255, 255, 0.45), transparent 60%);
        filter: blur(10px);
        opacity: 0.8;
        animation: rd-toast-orbit 6s ease-in-out infinite;
      }
      .raindrop-toast__icon {
        position: absolute;
        left: 16px;
        top: 50%;
        transform: translateY(-50%);
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.55));
        display: grid;
        place-items: center;
        color: #3a2b6d;
        font-size: 18px;
        box-shadow: 0 6px 18px rgba(24, 24, 37, 0.2);
      }
      .raindrop-toast__label {
        position: relative;
        z-index: 1;
        display: block;
      }
      .raindrop-toast__progress {
        position: absolute;
        left: 52px;
        right: 18px;
        bottom: 10px;
        height: 3px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.25);
        overflow: hidden;
      }
      .raindrop-toast__progress::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.3));
        transform: translateX(-100%);
        animation: rd-toast-progress var(--rd-toast-duration, 3600ms) linear forwards;
      }
      .raindrop-toast--neutral {
        background: linear-gradient(135deg, rgba(85, 110, 255, 0.92), rgba(163, 103, 255, 0.9));
      }
      .raindrop-toast--success {
        background: linear-gradient(135deg, rgba(46, 201, 140, 0.95), rgba(66, 201, 255, 0.9));
      }
      .raindrop-toast--error {
        background: linear-gradient(135deg, rgba(255, 105, 115, 0.96), rgba(255, 162, 105, 0.9));
      }
      .raindrop-toast--closing {
        animation: rd-toast-leave 0.45s ease forwards;
      }
      @keyframes rd-toast-enter {
        0% { opacity: 0; transform: translateY(-16px) scale(0.96); }
        60% { opacity: 1; transform: translateY(4px) scale(1.02); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes rd-toast-leave {
        0% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(-12px) scale(0.94); }
      }
      @keyframes rd-toast-orbit {
        0% { opacity: 0.7; transform: rotate(0deg) translate(0, 0); }
        50% { opacity: 1; transform: rotate(12deg) translate(-4px, 6px); }
        100% { opacity: 0.7; transform: rotate(0deg) translate(0, 0); }
      }
      @keyframes rd-toast-progress {
        from { transform: translateX(-100%); }
        to { transform: translateX(0); }
      }
    `;
    (document.head || document.documentElement || document.body).appendChild(style);
  }

  function ensureToastContainer() {
    ensureToastStyles();
    let container = document.getElementById('raindrop-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'raindrop-toast-container';
      Object.assign(container.style, {
        position: 'fixed',
        top: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '2147483647',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        pointerEvents: 'none'
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
  function showToast(message, success = null, options = {}) {
    const opts = (options && typeof options === 'object') ? options : {};
    const reuseActive = !!opts.reuseActive;
    const container = ensureToastContainer();
    const canReuseActive = reuseActive && activeToast && activeToast.isConnected;

    let toast;
    if (canReuseActive) {
      toast = activeToast;
      toast.classList.remove('raindrop-toast--closing');
    } else {
      if (activeToast && activeToast.isConnected) {
        dismissActiveToast(true);
      } else {
        dismissActiveToast();
      }
      toast = createToastElement();
      container.appendChild(toast);
      activeToast = toast;
    }

    applyToastState(toast, message, success);
    scheduleToastLifecycle(toast);
    return toast;
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
  async function computePermalink(button) {
    try {
      const hooks = runtime.hooks;
      const ctx = runtime.hookContext;
      if (hooks && typeof hooks.getPermalink === 'function') {
        const v = await Promise.resolve(hooks.getPermalink(button, ctx));
        if (typeof v === 'string' && v) return v;
      }
    } catch (_) { /* ignore and fallback */ }
    const siteConfig = runtime.siteConfig;
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
  async function processClick(button) {
    const host = runtime.host;
    const siteConfig = runtime.siteConfig;
    const hooks = runtime.hooks;
    const ctx = runtime.hookContext;
    // Only proceed if the click resulted in toggled ON state (like/upvote on)
    let toggledOn = false;
    try {
      if (hooks && typeof hooks.toggledOnAfterClick === 'function') {
        const hookResult = await Promise.resolve(hooks.toggledOnAfterClick(button, ctx));
        if (hookResult === true) {
          toggledOn = true;
          if (DEBUG) console.debug('[Tributary] Hook toggle detection: ON');
        } else if (hookResult === false) {
          toggledOn = false;
          if (DEBUG) console.debug('[Tributary] Hook toggle detection: OFF');
        } else {
          toggledOn = await isToggledOnAfterClick(button);
          if (DEBUG) console.debug('[Tributary] Hook indeterminate, generic toggle=', toggledOn);
        }
      } else {
        toggledOn = await isToggledOnAfterClick(button);
      }
    } catch (_) {
      toggledOn = await isToggledOnAfterClick(button);
    }
    if (!toggledOn) {
      if (DEBUG) console.debug('[Tributary] Click ignored (toggle not ON)');
      return; // ignore neutral->off or on->off transitions
    }
    // Additional protection for all hosts: require rising edge (prev OFF -> now ON)
    try {
      const prev = preClickOnState.get(button);
      preClickOnState.delete(button);
      if (prev === true) {
        if (DEBUG) console.debug('[Tributary] Ignoring toggle-off (was ON before click)');
        return;
      }
    } catch (_) { /* ignore */ }
    const url = await computePermalink(button);
    // Deduplicate by URL to avoid double saves from multiple detectors
    try {
      const now = Date.now();
      const prev = recentUrlsTS.get(url);
      if (prev && (now - prev) < 2000) {
        if (DEBUG) console.debug('[Tributary] Skipping duplicate URL save', url);
        return;
      }
      recentUrlsTS.set(url, now);
    } catch (_) { /* ignore */ }
    if (!url) {
      showToast('Error: Unable to extract link.', false);
      return;
    }
    // Provide immediate feedback
    showToast('Saving to Raindrop.io…', null, { reuseActive: true });
    let title = document.title || '';
    // Site hooks may override title or excerpt for richer extraction.
    let excerpt = '';
    try {
      if (hooks && typeof hooks.getTitle === 'function') {
        const t = await Promise.resolve(hooks.getTitle(button, ctx));
        if (typeof t === 'string' && t) title = t;
      }
      if (hooks && typeof hooks.getExcerpt === 'function') {
        const e = await Promise.resolve(hooks.getExcerpt(button, ctx));
        if (typeof e === 'string' && e) excerpt = e;
      }
    } catch (_) { /* ignore hook errors and fall back */ }
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
    if (DEBUG) console.debug('[Tributary] Saving', { url, titleLen: (title||'').length, excerptLen: (excerpt||'').length });
    if (!chrome?.runtime?.id) {
      if (DEBUG) console.warn('[Tributary] runtime context missing; skipping save');
      recentUrlsTS.delete(url);
      showToast('Extension restarted. Reload the page to continue.', false, { reuseActive: true });
      return;
    }
    try {
      await chrome.runtime.sendMessage({
        action: 'save',
        data: {
          url,
          title,
          excerpt
        }
      });
    } catch (err) {
      recentUrlsTS.delete(url);
      const message = (err && err.message) || '';
      if (DEBUG) console.error('[Tributary] Failed to send save message', err);
      if (typeof message === 'string' && message.includes('Extension context invalidated')) {
        showToast('Extension restarted. Reload the page to continue.', false, { reuseActive: true });
        return;
      }
      showToast('Unable to save. Please refresh and try again.', false, { reuseActive: true });
      return;
    }
    // Mark button as processed to avoid immediate re-processing
    try { processedButtonsTS.set(button, Date.now()); } catch (_) {}
  }

  /**
   * Initialise the content script: load configuration, check if the
   * current site is enabled, then register click and message
   * handlers.
   */
  async function init() {
    const host = window.location.hostname.replace(/^www\./, '');
    const siteConfig = await loadConfig();
    if (!siteConfig) {
      return; // unsupported site
    }
    runtime.host = host;
    runtime.siteConfig = siteConfig;
    runtime.hooks = (siteConfig && typeof siteConfig.hooks === 'object') ? siteConfig.hooks : {};
    // Retrieve enablement settings
    const stored = await getFromStorage([STORAGE_KEYS.ENABLED_DOMAINS, STORAGE_KEYS.DEBUG_LOGGING]);
    const enabled = stored[STORAGE_KEYS.ENABLED_DOMAINS] || {};
    DEBUG = !!stored[STORAGE_KEYS.DEBUG_LOGGING];
    if (DEBUG) console.debug('[Tributary] Init', { host, enabled: !(Object.prototype.hasOwnProperty.call(enabled, host) && enabled[host] === false) });
    // Domain is enabled by default if not explicitly set to false
    if (Object.prototype.hasOwnProperty.call(enabled, host) && enabled[host] === false) {
      return;
    }
    const buttonSelectors = Array.isArray(siteConfig.buttonSelector)
      ? siteConfig.buttonSelector.filter(Boolean)
      : [siteConfig.buttonSelector].filter(Boolean);
    runtime.buttonSelectors = buttonSelectors;
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
        let btn = findButtonInComposedPath(event, runtime.buttonSelectors);
        if (!btn) {
          btn = findButton(event.target, runtime.buttonSelectors);
        }
        if (btn) {
          // Element-level dedupe window
          const ts = processedButtonsTS.get(btn);
          if (ts && (Date.now() - ts) < BUTTON_DEDUPE_WINDOW) return;
          // Capture pre-click ON state to detect rising edge vs falling edge later
          try {
            const ap0 = btn.getAttribute('aria-pressed');
            const ac0 = btn.getAttribute('aria-checked');
            const wasOn = ap0 === 'true' || ac0 === 'true';
            preClickOnState.set(btn, wasOn);
          } catch (_) { }
          if (DEBUG) console.debug('[Tributary] Matched button', btn);
          processClick(btn).catch((err) => {
            if (DEBUG) console.error('[Tributary] processClick error', err);
          });
        } else if (runtime.hooks && typeof runtime.hooks.handleUnmatchedClick === 'function') {
          try {
            runtime.hooks.handleUnmatchedClick(event, runtime.hookContext);
          } catch (_) { /* ignore */ }
        }
      };
    const attachInputListeners = (root) => {
      if (!root) return;
      try {
        for (const evt of runtime.eventsToListen) {
          root.addEventListener(evt, handleInputEvent, true);
        }
      } catch (_) { /* ignore */ }
    };

    const hookContext = createHookContext({ attachInputListeners });
    runtime.hookContext = hookContext;

    attachInputListeners(document);

    if (runtime.hooks && typeof runtime.hooks.onInit === 'function') {
      try {
        runtime.hooks.onInit(hookContext);
      } catch (err) {
        if (DEBUG) console.error('[Tributary] onInit hook error', err);
      }
    }

    // Listen for responses from the background
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === 'saveResult') {
        if (message.status === 'success') {
          showToast('Saved to Raindrop.io!', true, { reuseActive: true });
        } else {
          showToast(message.error || 'Error saving bookmark.', false, { reuseActive: true });
          if (DEBUG) console.debug('[Tributary] Save error', message);
        }
      }
    });
  }

  // Kick off the initialisation when the content script loads
  init().catch((err) => {
    console.error('Raindrop extension initialisation failed:', err);
  });
})();