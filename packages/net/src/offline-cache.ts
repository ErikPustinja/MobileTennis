/**
 * Registers the site's service worker (served at the site root, next to the
 * game) and hands it the URLs this page already loaded, so the page also
 * works offline after the very first visit.
 */
export function registerOfflineCache(swUrl: string, scope: string): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(swUrl, { scope })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        const urls = [
          location.href.split('#')[0]!,
          ...performance.getEntriesByType('resource').map((e) => e.name),
        ];
        reg.active?.postMessage({ cache: urls });
      })
      .catch(() => {});
  });
}
