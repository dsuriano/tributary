/**
 * Options page script for the Tributary extension.
 *
 * This script handles loading and saving user preferences such as the
 * Raindrop API token, default collection, default tags and enabled
 * domains. It communicates with the background service worker to
 * validate the token and fetch available collections.
 */

interface StoredSettings {
  raindropToken?: string;
  defaultCollection?: number;
  defaultTags?: string[];
  enabledDomains?: Record<string, boolean>;
  debugLogging?: boolean;
}

interface CurrentState {
  token: string;
  defaultCollection: number | null;
  tags: string[];
  enabledDomains: Record<string, boolean>;
  debugLogging: boolean;
}

interface Collection {
  _id: number;
  title?: string;
}

interface ValidationResponse {
  valid: boolean;
}

interface CollectionsResponse {
  collections?: Collection[];
  error?: string;
}

/**
 * Load supported domains from the modular site registry for building
 * the list of domains in the options page.
 */
async function loadSupportedDomains(): Promise<string[]> {
  const mod = await import(chrome.runtime.getURL('scripts/sites/index.js'));
  const getSupportedDomains = mod.getSupportedDomains || mod.default?.getSupportedDomains;
  if (typeof getSupportedDomains === 'function') {
    return getSupportedDomains();
  }
  return [];
}

/**
 * Initialise the options page: populate form fields with saved
 * values, build the domain checkboxes and fetch collections if a
 * token is available.
 */
async function init(): Promise<void> {
  // Get stored settings
  const stored = await new Promise<StoredSettings>((resolve) => {
    chrome.storage.local.get(
      ['raindropToken', 'defaultCollection', 'defaultTags', 'enabledDomains', 'debugLogging'],
      (result) => resolve(result as StoredSettings)
    );
  });
  
  const tokenInput = document.getElementById('token') as HTMLInputElement;
  const tokenStatus = document.getElementById('token-status') as HTMLElement;
  const collectionSelect = document.getElementById('collection') as HTMLSelectElement;
  const tagsInput = document.getElementById('tags') as HTMLInputElement;
  const domainsContainer = document.getElementById('domains') as HTMLElement;
  const saveButton = document.getElementById('save') as HTMLButtonElement;
  const debugCheckbox = document.getElementById('debugLogging') as HTMLInputElement;

  let initialSerializedState = '';

  const serialiseState = (state: CurrentState): string => {
    const sortedDomains = Object.keys(state.enabledDomains)
      .sort()
      .reduce((acc, key) => {
        acc[key] = !!state.enabledDomains[key];
        return acc;
      }, {} as Record<string, boolean>);
    return JSON.stringify({
      token: state.token,
      defaultCollection: state.defaultCollection,
      tags: state.tags,
      enabledDomains: sortedDomains,
      debugLogging: state.debugLogging
    });
  };

  const getCurrentState = (): CurrentState => {
    const tags = tagsInput.value
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const checkboxes = domainsContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const enabledDomains: Record<string, boolean> = {};
    checkboxes.forEach((cb) => {
      const domain = cb.dataset.domain;
      if (domain) {
        enabledDomains[domain] = cb.checked;
      }
    });
    const defaultCollection = collectionSelect.value ? Number(collectionSelect.value) : null;
    return {
      token: tokenInput.value.trim(),
      defaultCollection,
      tags,
      enabledDomains,
      debugLogging: !!debugCheckbox.checked
    };
  };

  const setInitialState = (): void => {
    initialSerializedState = serialiseState(getCurrentState());
    saveButton.disabled = true;
  };

  const updateSaveButtonState = (): void => {
    const currentSerializedState = serialiseState(getCurrentState());
    saveButton.disabled = currentSerializedState === initialSerializedState;
  };

  saveButton.disabled = true;

  tokenInput.value = stored.raindropToken || '';
  tagsInput.value = Array.isArray(stored.defaultTags) ? stored.defaultTags.join(', ') : '';
  debugCheckbox.checked = !!stored.debugLogging;
  
  // Build domain checkboxes from the site registry
  const domains = await loadSupportedDomains();
  const enabled = stored.enabledDomains || {};
  domainsContainer.innerHTML = '';
  
  domains.forEach((domain) => {
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

  setInitialState();

  domainsContainer.addEventListener('change', updateSaveButtonState);
  tokenInput.addEventListener('input', updateSaveButtonState);
  collectionSelect.addEventListener('change', updateSaveButtonState);
  tagsInput.addEventListener('input', updateSaveButtonState);
  debugCheckbox.addEventListener('change', updateSaveButtonState);

  // Populate collections if token present
  if (tokenInput.value) {
    tokenStatus.textContent = 'Connecting…';
    updateCollections(tokenInput.value, collectionSelect, tokenStatus, stored.defaultCollection, setInitialState);
  } else {
    tokenStatus.textContent = 'Not connected';
  }
  
  // Save handler
  saveButton.addEventListener('click', async () => {
    const currentState = getCurrentState();
    // Persist settings
    chrome.storage.local.set({
      raindropToken: currentState.token,
      defaultCollection: currentState.defaultCollection,
      defaultTags: currentState.tags,
      enabledDomains: currentState.enabledDomains,
      debugLogging: currentState.debugLogging
    }, () => {
      // After saving, validate token and update collections
      if (currentState.token) {
        tokenStatus.textContent = 'Connecting…';
        updateCollections(currentState.token, collectionSelect, tokenStatus, currentState.defaultCollection, setInitialState);
      } else {
        tokenStatus.textContent = 'Not connected';
        // Clear collection select
        collectionSelect.innerHTML = '<option value="">-- select collection --</option>';
        setInitialState();
      }
    });
  });
}

/**
 * Fetch collections via the background script, populate the select
 * element and update the token status indicator.
 */
function updateCollections(
  _token: string,
  select: HTMLSelectElement,
  statusEl: HTMLElement,
  currentSelection: number | null | undefined,
  onComplete?: () => void
): void {
  chrome.runtime.sendMessage({ action: 'validateToken' }, (validateRes: ValidationResponse) => {
    if (!validateRes || !validateRes.valid) {
      statusEl.textContent = 'Invalid token';
      select.innerHTML = '<option value="">-- select collection --</option>';
      if (onComplete) {
        onComplete();
      }
      return;
    }
    // Token valid: fetch collections
    chrome.runtime.sendMessage({ action: 'getCollections' }, (res: CollectionsResponse) => {
      if (!res || res.error) {
        statusEl.textContent = 'Error fetching collections';
        select.innerHTML = '<option value="">-- select collection --</option>';
        if (onComplete) {
          onComplete();
        }
        return;
      }
      const collections = res.collections || [];
      // Sort collections alphabetically by title
      collections.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      // Build options
      select.innerHTML = '<option value="">-- select collection --</option>';
      collections.forEach((col) => {
        const opt = document.createElement('option');
        opt.value = String(col._id);
        opt.textContent = col.title || `(Untitled ${col._id})`;
        if (currentSelection && Number(currentSelection) === col._id) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });
      statusEl.textContent = 'Connected';
      if (onComplete) {
        onComplete();
      }
    });
  });
}

// Initialise when DOM content is ready
document.addEventListener('DOMContentLoaded', init);
