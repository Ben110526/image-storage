/* Minimal DOM shim for testing .tsx context logic under node --test.
 * Only what AuthContext/AppearanceContext-touching code paths use:
 * localStorage map, document.documentElement attributes, matchMedia. */
export function installDomShim() {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  };
  const attrs = new Map();
  globalThis.document = {
    documentElement: {
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      setAttribute: (k, v) => attrs.set(k, String(v)),
      removeAttribute: (k) => attrs.delete(k),
      style: { setProperty: () => {} },
    },
  };
  globalThis.window = globalThis;
  globalThis.matchMedia = () => ({
    matches: false, addEventListener: () => {}, removeEventListener: () => {},
  });
  return { storage, attrs };
}
