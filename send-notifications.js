const admin = require('firebase-admin');

// Legge la chiave segreta che hai appena salvato
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://tachocontrol-ad132-default-rtdb.europe-west1.firebasedatabase.app"
});

const db = admin.database();

async function checkDeadlinesAndNotify() {
    console.log("Inizio controllo scadenze...");
    const snapshot = await db.ref('operai').once('value');
    const operai = snapshot.val();

    if (!operai) {
        console.log("Nessun operaio trovato nel database.");
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const id in operai) {
        const d = operai[id];
        if (!d.lastDownloadDate || !d.fcmToken) continue;

        const targetDate = new Date(d.lastDownloadDate);
        targetDate.setHours(0, 0, 0, 0);

        // Calcola giorni mancanti
        const diffTime = targetDate - today;
        const daysRem = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let title = "";
        let body = "";

        // Qui decidi quando inviare le notifiche (es. a 0, 3 e 7 giorni)
        if (daysRem === 0) {
            title = "⚠️ SCADENZA CARTA TACHIGRAFO";
            body = `Ciao ${d.name}, la tua carta deve essere scaricata OGGI! Consegnala subito.`;
        } else if (daysRem === 3) {
            title = "⏳ ATTENZIONE SCADENZA";
            body = `Ciao ${d.name}, mancano solo 3 giorni allo scarico della tua carta.`;
        } else if (daysRem === 7) {
            title = "📅 Promemoria Scarico Carta";
            body = `Ciao ${d.name}, mancano 7 giorni allo scarico della tua carta.`;
        }

        if (title !== "" && body !== "") {
            console.log(`Tentativo di invio a ${d.name} (${daysRem} giorni rimasti)...`);
            const message = {
                notification: { title, body },
                token: d.fcmToken
            };

            try {
                await admin.messaging().send(message);
                console.log(`✅ Notifica inviata con successo a ${d.name}!`);
            } catch (error) {
                console.log(`❌ Errore invio a ${d.name}:`, error.message);
            }
        }
    }
    console.log("Controllo terminato.");
}

checkDeadlinesAndNotify().then(() => process.exit(0));
