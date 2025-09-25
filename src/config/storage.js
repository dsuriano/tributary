export function getFromStorage(keys) {
  return new Promise((resolve) => {
    const lookup = Array.isArray(keys) ? keys : [keys];
    chrome.storage.local.get(lookup, resolve);
  });
}

export function setToStorage(values) {
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

export function removeFromStorage(keys) {
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
