/* Service worker : vérifie à chaque ouverture si les fichiers de l'app ont changé sur le
   serveur et garde la dernière version pour le mode hors ligne. L'app-shell est aussi
   pré-mis en cache à l'installation, pour qu'un tout premier lancement hors ligne (avant
   toute visite en ligne réussie) affiche l'app au lieu d'un écran blanc. */
const CACHE = 'mon-budget-v2';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/theme.css',
  './css/base.css',
  './css/components.css',
  './css/layout.css',
  './css/views/budget.css',
  './css/minimal.css',
  './js/main.js',
  './js/config/firebase-config.js',
  './js/core/dates.js',
  './js/core/money.js',
  './js/core/month-state.js',
  './js/core/schema.js',
  './js/core/selectors.js',
  './js/core/store.js',
  './js/core/utils.js',
  './js/core/validation.js',
  './js/services/firebase.js',
  './js/services/storage.js',
  './js/features/pin.js',
  './js/features/recurring.js',
  './js/ui/charts.js',
  './js/ui/dialog.js',
  './js/ui/icons.js',
  './js/ui/status.js',
  './js/ui/theme.js',
  './js/ui/toast.js',
  './js/views/analysis.js',
  './js/views/common.js',
  './js/views/goals.js',
  './js/views/month.js',
  './js/views/quickadd.js',
  './js/views/settings.js',
  './js/views/transactions.js',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

async function precache() {
  const cache = await caches.open(CACHE);
  // addAll échouerait en bloc au premier fichier manquant ; on isole chaque échec
  // pour que le reste de l'app-shell reste disponible hors ligne.
  await Promise.all(PRECACHE_URLS.map(url => cache.add(url).catch(err => console.warn('[sw] précache échoué:', url, err))));
}

self.addEventListener('install', e => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Firebase (base de données) : non concerné, toujours en réseau direct.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('./') : Response.error())))
  );
});
