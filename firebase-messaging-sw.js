// Service Worker GC-TachoControl v9.6 Pro - Supporto Notifiche Push & Offline PWA Caching
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

const CACHE_NAME = 'tachocontrol-offline-v9.9';
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'manifest.json',
    'favicon.ico',
    'logo-192.png',
    'logo-512.png',
    'icon-192.png',
    'icon-512.png',
    'logo.jpg',
    'assets/logo_tachocontrol_3d.jpg',
    'assets/logo_tachocontrol_3d.png',
    'assets/icon_truck_driver.png',
    'assets/logo_area_conducenti.png',
    'https://cdn.tailwindcss.com',
    'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js',
    'https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js',
    'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.css'
];

// --- 1. INSTALLAZIONE: Pre-caching di tutti i file e risorse statiche ---
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW v9.6] Memorizzazione risorse offline in corso...');
            return Promise.allSettled(
                ASSETS_TO_CACHE.map((url) => {
                    return cache.add(url).catch((err) => {
                        console.warn('[SW v9.6] File non pre-caricato:', url, err);
                    });
                })
            );
        })
    );
});

// --- 2. ATTIVAZIONE: Pulizia delle vecchie cache obsolete ---
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW v9.6] Rimozione vecchia cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// --- 3. FETCH: Strategia Network-First con Fallback Istantaneo su Cache Locale ---
self.addEventListener('fetch', (event) => {
    // Ignora richieste non-HTTP, WebSocket Firebase Realtime e chiamate dirette API Google
    if (!event.request.url.startsWith('http') || 
        event.request.url.includes('firebasedatabase.app') || 
        event.request.url.includes('googleapis.com/v1') ||
        event.request.url.includes('fcm.googleapis.com')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    if (event.request.mode === 'navigate') {
                        return caches.match('./') || caches.match('index.html');
                    }
                    return new Response('Offline', { status: 503, statusText: 'Offline' });
                });
            })
    );
});

// --- 4. CONFIGURAZIONE NOTIFICHE PUSH FIREBASE CLOUD MESSAGING (FCM) ---
firebase.initializeApp({
    apiKey: "AIzaSyB2jGY3q3s4vDD_ARy-xltsjcwS3VDch7E",
    authDomain: "tachocontrol-ad132.firebaseapp.com",
    databaseURL: "https://tachocontrol-ad132-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "tachocontrol-ad132",
    storageBucket: "tachocontrol-ad132.firebasestorage.app",
    messagingSenderId: "337602106666",
    appId: "1:337602106666:web:d57e633e9cd487cf6fba53"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[SW v9.6] Ricevuto messaggio in background ', payload);
    const notificationTitle = payload.notification.title || '🔔 Avviso TachoControl';
    const notificationOptions = {
        body: payload.notification.body || "Promemoria scarico tachigrafo",
        icon: 'https://gccodelab.it/logo.jpg',
        badge: 'https://gccodelab.it/logo.jpg',
        vibrate: [200, 100, 200],
        data: {
            url: payload.data && payload.data.url ? payload.data.url : 'https://gccodelab.it/'
        }
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// GESTIONE CLICK SULLA NOTIFICA
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : 'https://gccodelab.it/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
