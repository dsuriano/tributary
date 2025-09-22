// Options page script for the Social Media to Raindrop.io extension.
//
// This script handles loading and saving user preferences such as the
// Raindrop API token, default collection, default tags and enabled
// domains. It communicates with the background service worker to
// validate the token and fetch available collections.

/**
 * Load the site selector configuration. Used to build the list of
 * domains in the options page.
 */
async function loadSiteSelectors() {
  const module = await import(chrome.runtime.getURL('../scripts/site_selectors.js'));
  return module.default || module.siteSelectors;
}

/**
 * Initialise the options page: populate form fields with saved
 * values, build the domain checkboxes and fetch collections if a
 * token is available.
 */
async function init() {
  // Get stored settings
  const stored = await new Promise((resolve) => {
    chrome.storage.local.get(['raindropToken', 'defaultCollection', 'defaultTags', 'enabledDomains', 'debugLogging'], resolve);
  });
  const tokenInput = document.getElementById('token');
  const tokenStatus = document.getElementById('token-status');
  const collectionSelect = document.getElementById('collection');
  const tagsInput = document.getElementById('tags');
  const domainsContainer = document.getElementById('domains');
  const saveButton = document.getElementById('save');
  const debugCheckbox = document.getElementById('debugLogging');

  tokenInput.value = stored.raindropToken || '';
  tagsInput.value = Array.isArray(stored.defaultTags) ? stored.defaultTags.join(', ') : '';
  debugCheckbox.checked = !!stored.debugLogging;
  // Build domain checkboxes
  const selectors = await loadSiteSelectors();
  const enabled = stored.enabledDomains || {};
  domainsContainer.innerHTML = '';
  Object.keys(selectors).forEach((domain) => {
    const wrapper = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.domain = domain;
    // Default to true if not explicitly false
    checkbox.checked = !(domain in enabled) || enabled[domain] !== false;
    const span = document.createElement('span');
    span.textContent = domain;
    wrapper.appendChild(checkbox);
    wrapper.appendChild(span);
    domainsContainer.appendChild(wrapper);
  });
  // Populate collections if token present
  if (tokenInput.value) {
    tokenStatus.textContent = 'Connecting…';
    updateCollections(tokenInput.value, collectionSelect, tokenStatus, stored.defaultCollection);
  } else {
    tokenStatus.textContent = 'Not connected';
  }
  // Save handler
  saveButton.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    const tags = tagsInput.value
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    // Gather enabled domains
    const checkboxes = domainsContainer.querySelectorAll('input[type="checkbox"]');
    const enabledDomains = {};
    checkboxes.forEach((cb) => {
      const domain = cb.dataset.domain;
      enabledDomains[domain] = cb.checked;
    });
    const defaultCollection = collectionSelect.value ? Number(collectionSelect.value) : null;
    // Persist settings
    chrome.storage.local.set({
      raindropToken: token,
      defaultCollection: defaultCollection,
      defaultTags: tags,
      enabledDomains: enabledDomains,
      debugLogging: !!debugCheckbox.checked
    }, () => {
      // After saving, validate token and update collections
      if (token) {
        tokenStatus.textContent = 'Connecting…';
        updateCollections(token, collectionSelect, tokenStatus, defaultCollection);
      } else {
        tokenStatus.textContent = 'Not connected';
        // Clear collection select
        collectionSelect.innerHTML = '<option value="">-- select collection --</option>';
      }
    });
  });
}

/**
 * Fetch collections via the background script, populate the select
 * element and update the token status indicator.
 *
 * @param {string} token API token to validate.
 * @param {HTMLSelectElement} select The select element to populate.
 * @param {HTMLElement} statusEl Element for displaying status messages.
 * @param {number|null} currentSelection Currently stored collection id.
 */
function updateCollections(token, select, statusEl, currentSelection) {
  chrome.runtime.sendMessage({ action: 'validateToken' }, (validateRes) => {
    if (!validateRes || !validateRes.valid) {
      statusEl.textContent = 'Invalid token';
      select.innerHTML = '<option value="">-- select collection --</option>';
      return;
    }
    // Token valid: fetch collections
    chrome.runtime.sendMessage({ action: 'getCollections' }, (res) => {
      if (!res || res.error) {
        statusEl.textContent = 'Error fetching collections';
        select.innerHTML = '<option value="">-- select collection --</option>';
        return;
      }
      const collections = res.collections || [];
      // Sort collections alphabetically by title
      collections.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      // Build options
      select.innerHTML = '<option value="">-- select collection --</option>';
      collections.forEach((col) => {
        const opt = document.createElement('option');
        opt.value = col._id;
        opt.textContent = col.title || `(Untitled ${col._id})`;
        if (currentSelection && Number(currentSelection) === col._id) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });
      statusEl.textContent = 'Connected';
    });
  });
}

// Initialise when DOM content is ready
document.addEventListener('DOMContentLoaded', init);