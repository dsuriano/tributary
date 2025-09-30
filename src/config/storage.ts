/**
 * Promise-based wrappers around chrome.storage.local API
 */

export function getFromStorage<T = Record<string, unknown>>(
  keys: string | string[]
): Promise<T> {
  return new Promise((resolve) => {
    const lookup = Array.isArray(keys) ? keys : [keys];
    chrome.storage.local.get(lookup, (result) => {
      resolve(result as T);
    });
  });
}

export function setToStorage(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

export function removeFromStorage(keys: string | string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const list = Array.isArray(keys) ? keys : [keys];
    chrome.storage.local.remove(list, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}
