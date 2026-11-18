// Demo state is optional and separate from authenticated purchase recovery.
const browserStorage = () => window.sessionStorage;
export function readDemoStorage(key: string, storage = browserStorage) {
  try { return storage().getItem(key); } catch { return null; }
}
export function writeDemoStorage(key: string, value: string, storage = browserStorage) {
  try { storage().setItem(key, value);return true; } catch { return false; }
}
export function removeDemoStorage(key: string, storage = browserStorage) {
  try { storage().removeItem(key); } catch { /* The demo still works in memory. */ }
}
