importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

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
    console.log('[firebase-messaging-sw.js] Ricevuto messaggio in background ', payload);
    const notificationTitle = payload.notification.title || '🔔 Avviso TachoControl';
    const notificationOptions = {
        body: payload.notification.body,
        icon: 'https://giannivicla74-jpg.github.io/tachoapp/logo.jpg',
        badge: 'https://giannivicla74-jpg.github.io/tachoapp/logo.jpg',
        vibrate: [200, 100, 200]
    };

    // Imposta il pallino rosso dell'icona dell'App sul cellulare
    if ('setAppBadge' in navigator) {
        navigator.setAppBadge(1).catch(() => {});
    }

    self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if ('clearAppBadge' in navigator) {
        navigator.clearAppBadge().catch(() => {});
    }
    if ('setAppBadge' in navigator) {
        navigator.setAppBadge(0).catch(() => {});
    }
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if (client.url.includes('tachoapp') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('https://giannivicla74-jpg.github.io/tachoapp/');
            }
        })
    );
});
