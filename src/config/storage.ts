/**
 * Promise-based wrappers around browser.storage.local API
 */
import browser from 'webextension-polyfill';

export async function getFromStorage<T = Record<string, unknown>>(
  keys: string | string[]
): Promise<T> {
  const lookup = Array.isArray(keys) ? keys : [keys];
  const result = await browser.storage.local.get(lookup);
  return result as T;
}

export async function setToStorage(values: Record<string, unknown>): Promise<void> {
  await browser.storage.local.set(values);
}

export async function removeFromStorage(keys: string | string[]): Promise<void> {
  const list = Array.isArray(keys) ? keys : [keys];
  await browser.storage.local.remove(list);
}
