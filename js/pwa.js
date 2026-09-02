/** Register the service worker and detect an installed / standalone display. */

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true;

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

/** iPhone "Add to Home Screen" hint — iOS has no beforeinstallprompt. */
export function iosInstallHint() {
  if (!isIos() || isStandalone()) return null;
  const p = document.createElement('p');
  p.className = 'pwa-hint';
  p.innerHTML = 'On iPhone 15 Pro: tap <b>Share</b> → <b>Add to Home Screen</b> to install Formulaic.';
  return p;
}
