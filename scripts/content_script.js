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
    // Special handling for Twitter/X: prefer the tweet's canonical permalink
    try {
      const host = window.location.hostname.replace(/^www\./, '');
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
  function processClick(button, containerSelectors) {
    const url = extractLink(button, containerSelectors);
    if (!url) {
      showToast('Error: Unable to extract link.', false);
      return;
    }
    // Provide immediate feedback
    showToast('Saving to Raindrop.io…');
    let title = document.title || '';
    // Extract a brief excerpt. For Twitter/X, prefer the tweet text within the article.
    let excerpt = '';
    const host = window.location.hostname.replace(/^www\./, '');
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