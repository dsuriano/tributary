import { TIMING, STORAGE_KEYS } from '../config/constants.js';
import { getFromStorage } from '../config/storage.js';
import type { SiteConfig, HookContext } from './sites/types.js';

/**
 * Content script for the Tributary extension.
 *
 * This script is injected into supported social media sites (Twitter/X,
 * YouTube, Reddit) and listens for clicks on the native like/upvote
 * buttons. When such a click occurs the script performs a smart link
 * extraction algorithm to determine the correct URL to bookmark and
 * sends a message to the background service worker to create the
 * raindrop. Feedback is provided to the user via toast messages.
 */

interface LastEvent {
  x: number;
  y: number;
  time: number;
}

interface ToastOptions {
  reuseActive?: boolean;
}

interface SaveMessage {
  action: 'save';
  data: {
    url: string;
    title: string;
    excerpt: string;
  };
}

interface SaveResultMessage {
  type: 'saveResult';
  status: 'success' | 'error';
  error?: string;
}

interface RuntimeState {
  host: string | null;
  siteConfig: SiteConfig | null;
  hooks: SiteConfig['hooks'];
  buttonSelectors: string[];
  eventsToListen: string[];
  hookContext: HookContext | null;
}

interface StorageData {
  [STORAGE_KEYS.ENABLED_DOMAINS]?: Record<string, boolean>;
  [STORAGE_KEYS.DEBUG_LOGGING]?: boolean;
}

(() => {
  const DEBOUNCE_DELAY = TIMING.CONTENT_CLICK_DEBOUNCE_MS;
  const BUTTON_DEDUPE_WINDOW = TIMING.BUTTON_DEDUPE_WINDOW_MS;
  const TOAST_DURATION = TIMING.TOAST_DURATION_MS;
  const TOAST_FADE = TIMING.TOAST_FADE_MS;
  
  let lastClickTime = 0;
  let DEBUG = false;
  let activeToast: HTMLElement | null = null;
  let activeToastTimer: ReturnType<typeof setTimeout> | null = null;
  let activeToastRemovalTimer: ReturnType<typeof setTimeout> | null = null;
  
  // Track last pointer/mouse position and time to correlate with fallback scans
  const LAST_EVENT: LastEvent = { x: 0, y: 0, time: 0 };
  
  // Deduplicate saves by button element and URL within a short window
  const processedButtonsTS = new WeakMap<Element, number>();
  const recentUrlsTS = new Map<string, number>();
  
  // Track last known ON state (aria-pressed/checked true) per element
  const lastOnState = new WeakMap<Element, boolean>();
  
  // Track pre-click ON state captured at input event time
  const preClickOnState = new WeakMap<Element, boolean>();

  const runtime: RuntimeState = {
    host: null,
    siteConfig: null,
    hooks: {},
    buttonSelectors: [],
    eventsToListen: ['click', 'pointerup', 'mousedown'],
    hookContext: null
  };

  /**
   * Load the site configuration for the current hostname via the modular site registry.
   */
  async function loadConfig(): Promise<SiteConfig | null> {
    const host = (window.location.hostname || '').replace(/^www\./, '');
    const module = await import(chrome.runtime.getURL('scripts/sites/index.js'));
    const loader = module.loadSiteConfigFor || module.default?.loadSiteConfigFor;
    if (typeof loader === 'function') {
      return await loader(host);
    }
    return null;
  }

  function wait(ms = 60): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Determine if the clicked control is transitioning to the positive state.
   * We only save when moving from neutral -> liked/upvoted, not when unliking.
   */
  async function isToggledOnAfterClick(button: Element): Promise<boolean> {
    await wait(80);
    
    const inContainer = (root: Element | null): boolean => {
      if (!root) return false;
      return !!root.querySelector('[aria-pressed="true"], [aria-checked="true"], [aria-selected="true"], .style-default-active');
    };
    
    const hasPressed = (el: Element | null): boolean => {
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
   */
  function waitForCondition(
    predicate: () => boolean,
    { timeout = 1500, interval = 50 }: { timeout?: number; interval?: number } = {}
  ): Promise<boolean> {
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
   */
  function normaliseText(text: string | null | undefined, maxLen = 0): string {
    if (!text) return '';
    let t = String(text).replace(/\s+/g, ' ').trim();
    if (maxLen > 0 && t.length > maxLen) {
      t = t.slice(0, maxLen);
    }
    return t;
  }

  function createHookContext({ attachInputListeners }: { attachInputListeners: (root: Element | Document) => void }): HookContext {
    return {
      host: runtime.host || '',
      buttonSelectors: runtime.buttonSelectors.slice(),
      events: runtime.eventsToListen.slice(),
      attachInputListeners: (root: Element | Document) => {
        try {
          attachInputListeners(root);
        } catch (_) { /* noop */ }
      },
      processButton: (button: Element) => processClick(button),
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
      debugLog: (...args: unknown[]) => {
        if (DEBUG) console.debug('[Tributary]', ...args);
      }
    };
  }

  function dismissActiveToast(immediate = false): void {
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

  function createToastElement(): HTMLElement {
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

  function applyToastState(toast: HTMLElement, message: string, success: boolean | null): void {
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
      const replacement = existingProgress.cloneNode(false) as HTMLElement;
      replacement.className = 'raindrop-toast__progress';
      existingProgress.replaceWith(replacement);
    } else {
      const progress = document.createElement('span');
      progress.className = 'raindrop-toast__progress';
      toast.appendChild(progress);
    }
  }

  function scheduleToastLifecycle(toast: HTMLElement): void {
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

  function ensureToastStyles(): void {
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
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 255, 255, 0.4), transparent 70%);
        top: -60px;
        right: -60px;
        mix-blend-mode: overlay;
      }
      .raindrop-toast__icon {
        position: absolute;
        left: 18px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 20px;
        line-height: 1;
      }
      .raindrop-toast__label {
        display: block;
        position: relative;
        z-index: 1;
      }
      .raindrop-toast__progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: rgba(255, 255, 255, 0.5);
        width: 100%;
        transform-origin: left;
        animation: rd-toast-progress var(--rd-toast-duration, 3000ms) linear forwards;
      }
      .raindrop-toast--neutral {
        background: linear-gradient(135deg, rgba(58, 70, 95, 0.95), rgba(42, 52, 75, 0.96));
      }
      .raindrop-toast--success {
        background: linear-gradient(135deg, rgba(52, 168, 83, 0.95), rgba(39, 140, 67, 0.96));
      }
      .raindrop-toast--error {
        background: linear-gradient(135deg, rgba(234, 67, 53, 0.95), rgba(211, 47, 47, 0.96));
      }
      .raindrop-toast--closing {
        animation: rd-toast-exit 0.5s cubic-bezier(0.36, 0, 0.66, -0.56) forwards;
      }
      @keyframes rd-toast-enter {
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes rd-toast-exit {
        to {
          opacity: 0;
          transform: translateY(-16px) scale(0.92);
        }
      }
      @keyframes rd-toast-progress {
        from {
          transform: scaleX(1);
        }
        to {
          transform: scaleX(0);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureToastContainer(): HTMLElement {
    ensureToastStyles();
    let container = document.getElementById('raindrop-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'raindrop-toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Display a toast message at the bottom of the page.
   */
  function showToast(message: string, success: boolean | null = null, options: ToastOptions = {}): HTMLElement {
    const opts = (options && typeof options === 'object') ? options : {};
    const reuseActive = !!opts.reuseActive;
    const container = ensureToastContainer();
    const canReuseActive = reuseActive && activeToast && activeToast.isConnected;

    let toast: HTMLElement;
    if (canReuseActive) {
      toast = activeToast!;
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
   * Traverse up the DOM tree to find a matching element.
   */
  function findButton(el: EventTarget | null, selectors: string[]): Element | null {
    let current = el as Element | null;
    while (current && current !== document.documentElement && current.nodeType === Node.ELEMENT_NODE) {
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
   * Scan the composed path for Shadow DOM support.
   */
  function findButtonInComposedPath(event: Event, selectors: string[]): Element | null {
    try {
      if (!event || typeof event.composedPath !== 'function') return null;
      const path = event.composedPath();
      for (const node of path) {
        if (node && (node as Node).nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          for (const sel of selectors) {
            if (typeof sel === 'string' && element.matches && element.matches(sel)) {
              return element;
            }
          }
        }
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  /**
   * Extract the URL to bookmark based on the smart link extraction algorithm.
   */
  function extractLink(button: Element, containerSelectors: string | string[]): string {
    let container: Element | Document | null = null;
    
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
    
    // Find external link
    const anchors = Array.from(container.querySelectorAll('a[href]'));
    for (const anchor of anchors) {
      const href = anchor.getAttribute('href');
      if (!href) continue;
      if (href.startsWith('#') || href.startsWith('javascript:')) continue;
      
      try {
        const url = new URL((anchor as HTMLAnchorElement).href, document.baseURI);
        if (url.hostname && url.hostname !== window.location.hostname) {
          return url.href;
        }
      } catch (err) {
        // ignore malformed URLs
      }
    }
    
    // Canonical or page URL
    const canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (canonicalEl?.href) {
      return canonicalEl.href;
    }
    return window.location.href;
  }

  /**
   * Compute permalink using site-specific hook or fallback.
   */
  async function computePermalink(button: Element): Promise<string> {
    try {
      const hooks = runtime.hooks;
      const ctx = runtime.hookContext;
      if (hooks && typeof hooks.getPermalink === 'function') {
        const v = await Promise.resolve(hooks.getPermalink(button, ctx!));
        if (typeof v === 'string' && v) return v;
      }
    } catch (_) { /* ignore and fallback */ }
    
    const siteConfig = runtime.siteConfig;
    const containerSelectors = Array.isArray(siteConfig?.containerSelector)
      ? siteConfig.containerSelector
      : [siteConfig?.containerSelector].filter(Boolean) as string[];
    return extractLink(button, containerSelectors);
  }

  /**
   * Handle a valid button click: extract the link and send it to the background script.
   */
  async function processClick(button: Element): Promise<void> {
    const siteConfig = runtime.siteConfig;
    const hooks = runtime.hooks;
    const ctx = runtime.hookContext;
    
    // Only proceed if the click resulted in toggled ON state
    let toggledOn = false;
    try {
      if (hooks && typeof hooks.toggledOnAfterClick === 'function') {
        const hookResult = await Promise.resolve(hooks.toggledOnAfterClick(button, ctx!));
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
      return;
    }
    
    // Additional protection: require rising edge (prev OFF -> now ON)
    try {
      const prev = preClickOnState.get(button);
      preClickOnState.delete(button);
      if (prev === true) {
        if (DEBUG) console.debug('[Tributary] Ignoring toggle-off (was ON before click)');
        return;
      }
    } catch (_) { /* ignore */ }
    
    const url = await computePermalink(button);
    
    // Deduplicate by URL
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
    
    showToast('Saving to Raindrop.io…', null, { reuseActive: true });
    
    let title = document.title || '';
    let excerpt = '';
    
    try {
      if (hooks && typeof hooks.getTitle === 'function') {
        const t = await Promise.resolve(hooks.getTitle(button, ctx!));
        if (typeof t === 'string' && t) title = t;
      }
      if (hooks && typeof hooks.getExcerpt === 'function') {
        const e = await Promise.resolve(hooks.getExcerpt(button, ctx!));
        if (typeof e === 'string' && e) excerpt = e;
      }
    } catch (_) { /* ignore hook errors */ }
    
    // Generic fallback if excerpt still empty
    if (!excerpt) {
      const containerSelectors = Array.isArray(siteConfig?.containerSelector)
        ? siteConfig.containerSelector
        : [siteConfig?.containerSelector].filter(Boolean) as string[];
      const container = button.closest((containerSelectors?.[0]) || '') || document;
      if (container?.textContent) {
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
      } as SaveMessage);
    } catch (err) {
      recentUrlsTS.delete(url);
      const message = (err && (err as Error).message) || '';
      if (DEBUG) console.error('[Tributary] Failed to send save message', err);
      if (typeof message === 'string' && message.includes('Extension context invalidated')) {
        showToast('Extension restarted. Reload the page to continue.', false, { reuseActive: true });
        return;
      }
      showToast('Unable to save. Please refresh and try again.', false, { reuseActive: true });
      return;
    }
    
    try { processedButtonsTS.set(button, Date.now()); } catch (_) {}
  }

  /**
   * Initialize the content script.
   */
  async function init(): Promise<void> {
    const host = window.location.hostname.replace(/^www\./, '');
    const siteConfig = await loadConfig();
    
    if (!siteConfig) {
      return; // unsupported site
    }
    
    runtime.host = host;
    runtime.siteConfig = siteConfig;
    runtime.hooks = (siteConfig && typeof siteConfig.hooks === 'object') ? siteConfig.hooks : {};
    
    const stored = await getFromStorage<StorageData>([STORAGE_KEYS.ENABLED_DOMAINS, STORAGE_KEYS.DEBUG_LOGGING]);
    const enabled = stored[STORAGE_KEYS.ENABLED_DOMAINS] || {};
    DEBUG = !!stored[STORAGE_KEYS.DEBUG_LOGGING];
    
    if (DEBUG) console.debug('[Tributary] Init', { host, enabled: !(Object.prototype.hasOwnProperty.call(enabled, host) && enabled[host] === false) });
    
    // Domain is enabled by default if not explicitly set to false
    if (Object.prototype.hasOwnProperty.call(enabled, host) && enabled[host] === false) {
      return;
    }
    
    const buttonSelectors = Array.isArray(siteConfig.buttonSelector)
      ? siteConfig.buttonSelector.filter(Boolean) as string[]
      : [siteConfig.buttonSelector].filter(Boolean) as string[];
    runtime.buttonSelectors = buttonSelectors;
    
    const handleInputEvent = (event: Event): void => {
      const now = Date.now();
      if (now - lastClickTime < DEBOUNCE_DELAY) {
        return;
      }
      lastClickTime = now;
      
      // Remember pointer position/time
      try {
        const pt = event as MouseEvent | PointerEvent;
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
        const ts = processedButtonsTS.get(btn);
        if (ts && (Date.now() - ts) < BUTTON_DEDUPE_WINDOW) return;
        
        // Capture pre-click ON state
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
          runtime.hooks.handleUnmatchedClick(event, runtime.hookContext!);
        } catch (_) { /* ignore */ }
      }
    };
    
    const attachInputListeners = (root: Element | Document): void => {
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
    chrome.runtime.onMessage.addListener((message: SaveResultMessage) => {
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

  // Kick off initialization
  init().catch((err) => {
    console.error('Raindrop extension initialisation failed:', err);
  });
})();
