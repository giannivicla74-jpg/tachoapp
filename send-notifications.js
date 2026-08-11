const admin = require('firebase-admin');

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
            console.log(`\n--- Analizzo: ${operaio.name} ${operaio.surname || ''} ---`);
            
            if (!operaio.lastDownloadDate) console.log(" ERRORE: Nessuna data di scadenza (lastDownloadDate).");
            if (!operaio.fcmToken) console.log(" ERRORE: Nessun Token registrato (l'operaio deve loggarsi dal telefono e accettare le notifiche).");

            if (operaio.lastDownloadDate && operaio.fcmToken) {
                // --- CONTROLLO FERIE ---
                let inVacation = false;
                let daysToVacation = null;
                if (operaio.vacationStartDate && operaio.vacationEndDate) {
                    const vStart = new Date(operaio.vacationStartDate);
                    vStart.setHours(0, 0, 0, 0);
                    const vEnd = new Date(operaio.vacationEndDate);
                    vEnd.setHours(0, 0, 0, 0);
                    
                    if (today >= vStart && today <= vEnd) {
                        inVacation = true;
                    }
                    
                    const timeDiffVacation = vStart.getTime() - today.getTime();
                    daysToVacation = Math.round(timeDiffVacation / (1000 * 3600 * 24));
                }

                if (inVacation) {
                    console.log(` -> 🏖️ AUTISTA IN FERIE: Notifiche standard sospese.`);
                    continue; // Salta il resto del ciclo per questo autista (nessuna notifica 28gg)
                }

                if (daysToVacation === 1 || daysToVacation === 2) {
                    console.log(` -> 🚨 PRE-PARTENZA: Mancano ${daysToVacation} giorni alle ferie, invio avviso speciale!`);
                    const payloadFerie = {
                        token: operaio.fcmToken,
                        notification: {
                            title: '🏖️ Ferie in Avvicinamento!',
                            body: `Attenzione ${operaio.name}: Mancano ${daysToVacation} giorni all'inizio delle tue ferie. Ricorda di scaricare la carta prima di partire!`
                        }
                    };
                    try {
                        await admin.messaging().send(payloadFerie);
                        console.log(' -> Avviso pre-ferie inviato con successo!');
                        inviate++;
                    } catch (error) {
                        console.error(' -> Errore invio avviso pre-ferie:', error);
                    }
                }
                // --- FINE CONTROLLO FERIE ---

                // Ora calcoliamo la normale scadenza dei 28 giorni
                const nextDeadline = new Date(operaio.lastDownloadDate);
                nextDeadline.setHours(0, 0, 0, 0);
                
                const timeDiff = nextDeadline.getTime() - today.getTime();
                const daysRem = Math.round(timeDiff / (1000 * 3600 * 24));

                console.log(` -> Giorni rimanenti calcolati (Scarico): ${daysRem}`);

                if (daysRem === 7 || daysRem === 3 || daysRem === 2 || daysRem === 1 || daysRem === 0 || daysRem < 0) {
                    console.log(` -> INVIO NOTIFICA IN CORSO...`);
                    const payload = {
                        token: operaio.fcmToken,
                        notification: {
                            title: '🔔 Scadenza Download Tacho!',
                            body: daysRem <= 0 
                                ? `Attenzione ${operaio.name}: La scadenza per il download dati della carta è SCADUTA!`
                                : `Attenzione ${operaio.name}: Mancano solo ${daysRem} giorn${daysRem === 1 ? 'o' : 'i'} alla scadenza del download carta.`
                        }
                    };

                    try {
                        const response = await admin.messaging().send(payload);
                        console.log(' -> VITTORIA! Notifica inviata con successo!', response);
                        inviate++;
                    } catch (error) {
                        console.error(' -> FALLIMENTO! Errore invio notifica:', error);
                    }
                } else {
                    console.log(` -> Nessuna notifica oggi (giorni rimanenti: ${daysRem}, non è 7, 3, 2 o 0).`);
                }
            }
        }
        
        console.log(`\nControllo terminato. Notifiche totali inviate: ${inviate}`);
    } catch (error) {
        console.error("Errore di connessione:", error);
    }
    process.exit(0);
}

start();
