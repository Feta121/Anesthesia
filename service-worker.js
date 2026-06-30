/* ============================================================
   AAU Anesthesia Portal — Service Worker
   Provides offline access: caches the app shell on install,
   then caches study-resource files (PDF/PPTX/DOCX) the first
   time a student opens them, so they're available offline
   afterwards without trying to pre-download the entire
   ~500MB resources folder up front.
   ============================================================ */

const APP_SHELL_CACHE = 'anesthesia-app-shell-v1';
const RESOURCE_CACHE   = 'anesthesia-resources-v1';

// Files that make the app itself work — cached immediately on install.
const APP_SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ── INSTALL: pre-cache the app shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  self.skipWaiting();
});

// ── ACTIVATE: clean up old cache versions ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_SHELL_CACHE && k !== RESOURCE_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH: routing strategy ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never try to cache/intercept calls to the Anthropic API — those
  // need a live network connection for the AI tutor and must always
  // go straight to the network.
  if (url.hostname.includes('anthropic.com')) {
    return; // let the browser handle it normally
  }

  // Study resources (PDF/PPTX/DOC files inside /resources/) —
  // "cache, falling back to network, then save a copy" so each file
  // becomes available offline the first time a student opens it.
  if (url.pathname.includes('/resources/')) {
    event.respondWith(
      caches.open(RESOURCE_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached); // offline and never cached -> fails gracefully
        })
      )
    );
    return;
  }

  // App shell (HTML/CSS/JS/icons) — "network first, fall back to cache"
  // so students always get the latest version when online, but the
  // app still opens normally with no internet connection at all.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(APP_SHELL_CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
