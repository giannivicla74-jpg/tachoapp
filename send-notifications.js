const admin = require('firebase-admin');

// 1. Inizializza Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://tachocontrol-ad132-default-rtdb.europe-west1.firebasedatabase.app"
});

const db = admin.database();

async function start() {
    console.log("Inizio controllo scadenze...");
    try {
        const snapshot = await db.ref('operai').once('value');
        const operai = snapshot.val();

        if (!operai) {
            console.log("Nessun operaio trovato nel database.");
            process.exit(0);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let inviate = 0;

        for (let id in operai) {
            const operaio = operai[id];
            if (operaio.lastDownloadDate && operaio.fcmToken) {
                const downloadDate = new Date(operaio.lastDownloadDate);
                downloadDate.setHours(0, 0, 0, 0);
                const nextDeadline = new Date(downloadDate);
                nextDeadline.setDate(nextDeadline.getDate() + 28);
                
                const timeDiff = nextDeadline.getTime() - today.getTime();
                const daysRem = Math.ceil(timeDiff / (1000 * 3600 * 24));

                // INVIA SE MANCANO 7, 3, 2, o 0 GIORNI (ho aggiunto il 2 così lo testi subito senza cambiare data!)
                if (daysRem === 7 || daysRem === 3 || daysRem === 2 || daysRem === 0) {
                    console.log(`Trovato ${operaio.name} con scadenza tra ${daysRem} giorni. Invio notifica...`);
                    
                    const payload = {
                        token: operaio.fcmToken,
                        notification: {
                            title: 'Scadenza Download Tacho',
                            body: `Attenzione ${operaio.name}: Mancano ${daysRem} giorni alla scadenza del download dati tachigrafo.`
                        }
                    };

                    try {
                        const response = await admin.messaging().send(payload);
                        console.log('Notifica inviata con successo a:', operaio.name, response);
                        inviate++;
                    } catch (error) {
                        console.error('Errore invio notifica a:', operaio.name, error);
                    }
                }
            }
        }
        
        console.log(`Controllo terminato. Notifiche inviate: ${inviate}`);
    } catch (error) {
        console.error("Errore di connessione al database:", error);
    }
    
    // Spegne il server correttamente
    process.exit(0);
}

start();
