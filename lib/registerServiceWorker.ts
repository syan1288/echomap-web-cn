export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    void (async () => {
      const reloadFlag = 'echo-sw-cleared';
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const hadController = Boolean(navigator.serviceWorker.controller);
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }

        if ((registrations.length > 0 || hadController) && sessionStorage.getItem(reloadFlag) !== '1') {
          sessionStorage.setItem(reloadFlag, '1');
          window.location.reload();
        }
      } catch {
        /* empty */
      }
    })();
  });
}
