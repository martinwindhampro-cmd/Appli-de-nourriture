/* Mes repas — service worker : l'app s'ouvre vite et même sans réseau.
   • Fichiers de l'appli (page, scripts) : réseau d'abord → toujours la dernière version publiée ; copie de secours hors ligne.
   • Bibliothèques (Firebase, pdf.js), police et icônes : copie locale d'abord (leurs adresses ne changent pas).
   • Les données (Firestore) ne passent pas par ici : Firebase gère lui-même le hors-ligne. */
const V = 'repas-v4';
const CORE = ['./', './index.html', './app.js', './data.js', './ticket.js', './extras.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const LIBS = /^https:\/\/(www\.gstatic\.com\/firebasejs\/|cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/|fonts\.googleapis\.com\/|fonts\.gstatic\.com\/|unpkg\.com\/@zxing\/)/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const url = new URL(r.url);
  const own = url.origin === location.origin;
  if (r.mode === 'navigate' || (own && /(\/|\.html|\.js)$/.test(url.pathname) && !/sw\.js$/.test(url.pathname))) {
    const key = r.mode === 'navigate' || /\/$/.test(url.pathname) ? './index.html' : '.' + url.pathname.slice(url.pathname.lastIndexOf('/'));
    e.respondWith(fetch(r.url, { cache: 'no-store', credentials: 'same-origin' })
      .then(res => { if (!res.ok) throw 0; const cp = res.clone(); caches.open(V).then(c => c.put(key, cp)); return res; })
      .catch(() => caches.match(key)));
    return;
  }
  if (LIBS.test(r.url) || (own && /\.(png|webmanifest)$/.test(url.pathname))) {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok || res.type === 'opaque') { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; })));
  }
});
