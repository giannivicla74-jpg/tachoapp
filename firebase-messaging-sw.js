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
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: 'https://cdn-icons-png.flaticon.com/512/1042/1042339.png'
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});
