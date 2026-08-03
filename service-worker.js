const CACHE_NAME = 'hl-footprint-cache-v3';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './screenshots/mobile-1.png',
  './screenshots/wide-1.png'
];

// Instala el service worker y guarda en cache los archivos base de la app.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Limpia caches antiguas cuando se activa una nueva versión.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Estrategia: intenta red primero (para precios en vivo vía API),
// y si falla (sin conexión) sirve lo que haya en cache.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});

// Sincronización en segundo plano (Background Sync, "one-off"):
// si el usuario pierde la conexión mientras usa la app, esto reintenta
// refrescar los datos de mercado en cuanto vuelva a haber internet.
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-market-data') {
    event.waitUntil(
      fetch('./index.html')
        .then((response) => caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', response)))
        .catch(() => {})
    );
  }
});

// Sincronización periódica en segundo plano (si el navegador la soporta):
// permite refrescar datos de mercado aunque la app no esté abierta.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'refresh-market-data') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.add('./index.html'))
    );
  }
});

// Notificaciones push: muestra una notificación al usuario cuando
// el servidor (si en el futuro se agrega uno) envíe un evento push.
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'HL Footprint';
  const options = {
    body: data.body || 'Tienes una alerta de precio activa.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
