const CACHE_NAME = 'offgrid-v4';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './teacher.html',
    './manifest.json',
    './tailwindcss.js',
    './pouchdb.min.js',
    './src/db.js',
    './src/sync.js',
    './src/teacher-app.js',
    './src/teacher-peerjs.js',
    './src/teacher-webtorrent.js',
    './src/student-app.js',
    './src/student-peerjs.js',
    './icons/icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching assets');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[Service Worker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Navigation fallback for SPA/PWA behavior
    if (event.request.mode === 'navigate') {
        event.respondWith(
            caches.match('./index.html').then((response) => {
                return response || fetch(event.request);
            }).catch(() => {
                return caches.match('./index.html');
            })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
