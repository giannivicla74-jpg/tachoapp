/*
 * TachoControl - Accesso sicuro (Firebase Authentication)
 * Condiviso da index.html, test_license.html e test_gps.html.
 *
 * Modello dati:
 *   utenti/{uid}                         -> { companyId, role: 'superadmin'|'admin'|'driver', driverId? }
 *   login_autisti/{azienda}/{nome-slug}  -> { email, driverId }   (lettura pubblica SOLO per chiave esatta)
 *   aziende_privato/{azienda}/pin_autisti/{driverId} -> PIN a 6 cifre (solo admin)
 *   aziende_privato/{azienda}/login_keys/{driverId}  -> { nome-slug: true } (solo admin)
 *
 * Il PIN dell'autista e' la sua password Firebase. Gli account autisti vengono
 * creati dall'admin tramite una seconda istanza Firebase, cosi' l'admin resta collegato.
 */
(function () {
    'use strict';

    const auth = firebase.auth();
    const db = firebase.database();
    const DRIVER_EMAIL_DOMAIN = 'autisti.tachoapp.gccodelab.it';
    const SESSION_HINT_KEY = 'tacho_auth_uid';
    const PROFILE_CACHE_KEY = 'tacho_auth_profile';

    // --- Emulatore locale per i collaudi: http://localhost:xxxx/?emu=1 ---
    const isLocalHost = ['localhost', '127.0.0.1'].includes(location.hostname);
    let useEmulator = false;
    try {
        if (isLocalHost && new URLSearchParams(location.search).has('emu')) sessionStorage.setItem('tacho_emu', '1');
        useEmulator = isLocalHost && sessionStorage.getItem('tacho_emu') === '1';
    } catch (e) {}
    function attachEmulators(app) {
        if (!useEmulator) return;
        app.auth().useEmulator('http://127.0.0.1:9099');
        app.database().useEmulator('127.0.0.1', 9000);
    }
    if (useEmulator) {
        attachEmulators(firebase.app());
        console.warn('[TachoAuth] Collegato agli EMULATORI locali Firebase (nessun dato reale).');
    }

    // --- Stato ---
    let currentUser = null;
    let currentProfile = null;
    let resolvedOnce = false;
    let profileSeq = 0; // evita che una lettura vecchia sovrascriva un profilo appena creato
    const listeners = [];
    let readyResolve;
    const ready = new Promise((r) => { readyResolve = r; });

    function readCachedProfile(uid) {
        try {
            const c = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || 'null');
            return c && c.uid === uid ? c.profile : null;
        } catch (e) { return null; }
    }
    function writeCachedProfile(uid, profile) {
        try {
            if (uid && profile) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ uid, profile }));
            else localStorage.removeItem(PROFILE_CACHE_KEY);
        } catch (e) {}
    }

    function withTimeout(promise, ms) {
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'tacho/timeout' })), ms);
            promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
        });
    }

    async function fetchProfile(uid) {
        const snap = await withTimeout(db.ref('utenti/' + uid).once('value'), 8000);
        return snap.val();
    }

    function setProfile(uid, profile) {
        profileSeq++;
        currentProfile = profile;
        writeCachedProfile(uid, profile);
    }

    function notify() {
        listeners.forEach((cb) => {
            try { cb(currentUser, currentProfile); } catch (e) { console.error('[TachoAuth] listener', e); }
        });
    }

    auth.onAuthStateChanged(async (user) => {
        currentUser = user || null;
        if (!user) {
            currentProfile = null;
            writeCachedProfile(null, null);
            try { localStorage.removeItem(SESSION_HINT_KEY); } catch (e) {}
        } else {
            try { localStorage.setItem(SESSION_HINT_KEY, user.uid); } catch (e) {}
            // Offline-first: usa il profilo in cache, poi aggiorna dal cloud
            const seq = ++profileSeq;
            const cached = readCachedProfile(user.uid);
            currentProfile = cached || null;
            try {
                const fresh = await fetchProfile(user.uid);
                if (seq === profileSeq) {
                    currentProfile = fresh || null;
                    writeCachedProfile(user.uid, currentProfile);
                }
            } catch (e) {
                console.warn('[TachoAuth] Profilo non aggiornato (offline?):', e && e.message);
            }
        }
        if (!resolvedOnce) { resolvedOnce = true; readyResolve(); }
        notify();
    });

    // --- Utilita' ---
    function nameKey(fullName) {
        return String(fullName || '')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
    function driverNameKeys(name, surname) {
        const keys = [nameKey(`${name} ${surname}`), nameKey(`${surname} ${name}`)].filter(Boolean);
        return Array.from(new Set(keys));
    }
    function randomId(len) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        const buf = new Uint32Array(len);
        crypto.getRandomValues(buf);
        return Array.from(buf, (n) => chars[n % chars.length]).join('');
    }
    function generatePin() {
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        return String(100000 + (buf[0] % 900000));
    }
    function companyPath(cid, sub) {
        return (!cid || cid === 'AZ-MAIN') ? sub : `aziende/${cid}/${sub}`;
    }
    function fail(code, message) {
        const e = new Error(message || code);
        e.code = code;
        return e;
    }

    let secondary = null;
    function secondaryApp() {
        if (!secondary) {
            secondary = firebase.initializeApp(firebase.app().options, 'tacho-secondary');
            attachEmulators(secondary);
            secondary.auth().setPersistence(firebase.auth.Auth.Persistence.NONE).catch(() => {});
        }
        return secondary;
    }
    async function createUserWithoutSwitching(email, password) {
        const app = secondaryApp();
        const cred = await app.auth().createUserWithEmailAndPassword(email, password);
        const uid = cred.user.uid;
        await app.auth().signOut().catch(() => {});
        return uid;
    }

    // --- Ruoli ---
    function role() { return currentProfile ? currentProfile.role : null; }
    function isSuperAdmin() { return !!currentUser && role() === 'superadmin'; }
    function isAdminOf(cid) {
        if (!currentUser || !currentProfile) return false;
        if (isSuperAdmin()) return true;
        return role() === 'admin' && currentProfile.companyId === (cid || 'AZ-MAIN');
    }
    function canAccess(cid) {
        if (!currentUser || !currentProfile) return false;
        if (isSuperAdmin()) return true;
        return currentProfile.companyId === (cid || 'AZ-MAIN');
    }
    function requireAdminOf(cid) {
        if (!isAdminOf(cid)) throw fail('tacho/not-admin', 'Operazione riservata all\'amministratore della flotta.');
    }

    // --- Login / Logout ---
    async function loginAdmin(email, password) {
        const cred = await auth.signInWithEmailAndPassword(String(email).trim(), password);
        const profile = await fetchProfile(cred.user.uid);
        if (!profile || (profile.role !== 'admin' && profile.role !== 'superadmin')) {
            await auth.signOut();
            throw fail('tacho/not-admin', 'Questo account non e\' abilitato all\'Area Amministrativa.');
        }
        setProfile(cred.user.uid, profile);
        return profile;
    }

    async function loginDriver(cid, fullName, pin) {
        const companyId = (cid || 'AZ-MAIN').toUpperCase();
        const key = nameKey(fullName);
        if (!key) throw fail('tacho/driver-not-found');
        const snap = await withTimeout(db.ref(`login_autisti/${companyId}/${key}`).once('value'), 10000);
        const entry = snap.val();
        if (!entry || !entry.email) throw fail('tacho/driver-not-found');
        if (currentUser) await auth.signOut();
        const cred = await auth.signInWithEmailAndPassword(entry.email, String(pin));
        const profile = await fetchProfile(cred.user.uid);
        if (!profile || profile.role !== 'driver' || profile.companyId !== companyId) {
            await auth.signOut();
            throw fail('tacho/no-access', 'Accesso non abilitato. Chiedi al tuo responsabile un nuovo PIN.');
        }
        setProfile(cred.user.uid, profile);
        return profile;
    }

    function logout() {
        writeCachedProfile(null, null);
        try { localStorage.removeItem(SESSION_HINT_KEY); } catch (e) {}
        return auth.signOut().catch(() => {});
    }

    function sendPasswordReset(email) {
        return auth.sendPasswordResetEmail(String(email).trim());
    }

    function changePassword(newPassword) {
        if (!currentUser) return Promise.reject(fail('tacho/not-logged'));
        return currentUser.updatePassword(newPassword);
    }

    // --- Gestione account autisti (solo admin) ---
    async function createDriverAccount(cid, driverId, name, surname, pin) {
        const companyId = cid || 'AZ-MAIN';
        requireAdminOf(companyId);
        if (!/^\d{6}$/.test(String(pin))) throw fail('tacho/bad-pin', 'Il PIN deve avere 6 cifre.');

        const keys = driverNameKeys(name, surname);
        if (!keys.length) throw fail('tacho/bad-name', 'Nome e cognome non validi.');

        // Il nome principale (nome cognome) non deve appartenere a un altro autista
        const primary = await db.ref(`login_autisti/${companyId}/${keys[0]}`).once('value');
        if (primary.exists() && primary.val().driverId !== driverId) {
            throw fail('tacho/duplicate-name', `Esiste gia' un autista chiamato "${name} ${surname}". Aggiungi un secondo nome o un'iniziale.`);
        }
        const usableKeys = [keys[0]];
        for (const k of keys.slice(1)) {
            const s = await db.ref(`login_autisti/${companyId}/${k}`).once('value');
            if (!s.exists() || s.val().driverId === driverId) usableKeys.push(k);
        }

        const [oldUidSnap, oldKeysSnap] = await Promise.all([
            db.ref(companyPath(companyId, `operai/${driverId}/authUid`)).once('value'),
            db.ref(`aziende_privato/${companyId}/login_keys/${driverId}`).once('value')
        ]);
        const oldUid = oldUidSnap.val();
        const oldKeys = Object.keys(oldKeysSnap.val() || {});

        const email = `${randomId(10)}.${companyId.toLowerCase()}@${DRIVER_EMAIL_DOMAIN}`;
        const uid = await createUserWithoutSwitching(email, String(pin));

        const updates = {};
        oldKeys.forEach((k) => { if (!usableKeys.includes(k)) updates[`login_autisti/${companyId}/${k}`] = null; });
        if (oldUid && oldUid !== uid) updates[`utenti/${oldUid}`] = null;
        updates[`utenti/${uid}`] = { companyId, role: 'driver', driverId, createdAt: Date.now() };
        const keyMap = {};
        usableKeys.forEach((k) => {
            updates[`login_autisti/${companyId}/${k}`] = { email, driverId };
            keyMap[k] = true;
        });
        updates[`aziende_privato/${companyId}/login_keys/${driverId}`] = keyMap;
        updates[`aziende_privato/${companyId}/pin_autisti/${driverId}`] = String(pin);
        updates[companyPath(companyId, `operai/${driverId}/authUid`)] = uid;
        updates[companyPath(companyId, `operai/${driverId}/pin`)] = null;
        await db.ref().update(updates);
        return { uid, pin: String(pin) };
    }

    async function removeDriverAccount(cid, driverId, authUid) {
        const companyId = cid || 'AZ-MAIN';
        requireAdminOf(companyId);
        const keysSnap = await db.ref(`aziende_privato/${companyId}/login_keys/${driverId}`).once('value');
        const updates = {};
        Object.keys(keysSnap.val() || {}).forEach((k) => { updates[`login_autisti/${companyId}/${k}`] = null; });
        updates[`aziende_privato/${companyId}/login_keys/${driverId}`] = null;
        updates[`aziende_privato/${companyId}/pin_autisti/${driverId}`] = null;
        if (authUid) updates[`utenti/${authUid}`] = null;
        await db.ref().update(updates);
    }

    // Crea gli accessi per tutti gli autisti che non ne hanno ancora uno (migrazione dal vecchio PIN a 4 cifre)
    async function migrateDrivers(cid, driversMap, onProgress) {
        const companyId = cid || 'AZ-MAIN';
        requireAdminOf(companyId);
        const results = [];
        const ids = Object.keys(driversMap || {}).filter((id) => driversMap[id] && !driversMap[id].authUid);
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const d = driversMap[id];
            if (onProgress) onProgress(i + 1, ids.length, d);
            try {
                const pin = generatePin();
                await createDriverAccount(companyId, id, d.name || '', d.surname || '', pin);
                results.push({ id, name: `${d.name || ''} ${d.surname || ''}`.trim(), phone: d.phone, pin, ok: true });
            } catch (e) {
                results.push({ id, name: `${d.name || ''} ${d.surname || ''}`.trim(), ok: false, error: errorMessage(e) });
            }
        }
        return results;
    }

    // --- Aziende ---
    // Crea una nuova azienda con il suo amministratore.
    // asCurrentUser=true: auto-registrazione (l'utente resta collegato come admin della nuova azienda).
    async function createCompanyWithAdmin(company, email, password, asCurrentUser) {
        const cid = company.code;
        let uid;
        if (asCurrentUser) {
            if (currentUser) await auth.signOut();
            const cred = await auth.createUserWithEmailAndPassword(String(email).trim(), password);
            uid = cred.user.uid;
        } else {
            if (!isSuperAdmin()) throw fail('tacho/not-admin', 'Solo il supervisore puo\' creare aziende per conto terzi.');
            uid = await createUserWithoutSwitching(String(email).trim(), password);
        }
        const registryEntry = Object.assign({}, company, { ownerUid: uid });
        delete registryEntry.adminPin;
        const updates = {};
        updates[`utenti/${uid}`] = { companyId: cid, role: 'admin', createdAt: Date.now() };
        updates[`aziende_registry/${cid}`] = registryEntry;
        await db.ref().update(updates);
        if (asCurrentUser) {
            setProfile(uid, updates[`utenti/${uid}`]);
            notify();
        }
        return uid;
    }

    // Dati pubblici minimi di un'azienda (visibili anche prima del login)
    async function publicCompanyInfo(cid) {
        const companyId = String(cid || '').trim().toUpperCase();
        if (!companyId) return null;
        try {
            const [n, p, l] = await withTimeout(Promise.all([
                db.ref(`aziende_registry/${companyId}/name`).once('value'),
                db.ref(`aziende_registry/${companyId}/phone`).once('value'),
                db.ref(`aziende_registry/${companyId}/logoBase64`).once('value')
            ]), 10000);
            if (!n.exists()) return null;
            return { code: companyId, name: n.val(), phone: p.val() || '', logoBase64: l.val() || '' };
        } catch (e) {
            return null;
        }
    }

    // --- Messaggi di errore in italiano ---
    function errorMessage(err) {
        const code = (err && err.code) || '';
        const map = {
            'auth/wrong-password': 'Password o PIN non corretti.',
            'auth/user-not-found': 'Account non trovato. Controlla l\'email.',
            'auth/invalid-email': 'Indirizzo email non valido.',
            'auth/invalid-credential': 'Credenziali non corrette.',
            'auth/too-many-requests': 'Troppi tentativi. Attendi qualche minuto e riprova.',
            'auth/network-request-failed': 'Connessione assente. Controlla internet e riprova.',
            'auth/email-already-in-use': 'Questa email e\' gia\' registrata. Usa "Accedi" oppure un\'altra email.',
            'auth/weak-password': 'La password deve avere almeno 6 caratteri.',
            'auth/requires-recent-login': 'Per sicurezza esci, rientra con la password attuale e riprova.',
            'auth/operation-not-allowed': 'Accesso con email non attivo su Firebase (Authentication > Sign-in method > Email/Password).',
            'tacho/driver-not-found': 'Nome non trovato. Scrivi nome e cognome come registrati in azienda.',
            'tacho/timeout': 'Il server non risponde. Controlla la connessione e riprova.',
            'PERMISSION_DENIED': 'Permesso negato dal database.'
        };
        if (map[code]) return map[code];
        const msg = (err && err.message) || String(err || 'Errore sconosciuto');
        // Firebase 8 a volte restituisce il codice del server dentro il testo (es. INVALID_LOGIN_CREDENTIALS)
        if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND/.test(msg)) return 'Email o password non corretti.';
        if (/TOO_MANY_ATTEMPTS/.test(msg)) return map['auth/too-many-requests'];
        if (/USER_DISABLED/.test(msg)) return 'Questo account e\' stato disattivato.';
        if (/^\s*\{/.test(msg)) return 'Accesso non riuscito. Controlla i dati e riprova.';
        if (/PERMISSION_DENIED|permission_denied/i.test(msg)) return map.PERMISSION_DENIED;
        return msg;
    }

    // --- Interfaccia: finestre dinamiche (Tailwind CDN applica le classi anche al DOM creato via JS) ---
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function openModal(innerHtml) {
        const wrap = document.createElement('div');
        wrap.className = 'no-print fixed inset-0 z-[99990] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4';
        wrap.innerHTML = `<div class="bg-[#15243E] w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-700/80 shadow-2xl p-6 space-y-4 text-left">${innerHtml}</div>`;
        document.body.appendChild(wrap);
        return { el: wrap, close: () => wrap.remove() };
    }
    function driverAccessMessage(cid, companyName, name, pin) {
        const url = `https://tachoapp.gccodelab.it/?az=${encodeURIComponent(cid)}&role=driver`;
        return `🚛 *TACHOCONTROL • NUOVO ACCESSO SICURO*\n\n` +
            `Ciao *${name}*,\nl'app e' stata aggiornata con un accesso piu' sicuro.\n\n` +
            `👉 Apri: ${url}\n` +
            `👤 *Nome:* ${name}\n` +
            `🔑 *Nuovo PIN (6 cifre):* *${pin}*\n\n` +
            `🏢 *Azienda:* ${companyName || cid}\n` +
            `_Inserisci nome e cognome e il nuovo PIN. Il telefono restera' collegato._`;
    }

    function showMigrationResults(cid, companyName, results) {
        const rows = results.map((r, i) => r.ok
            ? `<div class="flex items-center justify-between gap-2 bg-[#0F1C32] border border-slate-700/70 rounded-xl px-3 py-2">
                   <div class="min-w-0"><div class="text-xs font-bold text-white truncate">${esc(r.name)}</div>
                   <div class="text-[11px] text-slate-400">PIN: <span class="font-mono font-black text-amber-300 tracking-widest">${esc(r.pin)}</span></div></div>
                   <button data-i="${i}" class="tac-wa shrink-0 bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-bold px-3 py-2 rounded-lg">WhatsApp</button>
               </div>`
            : `<div class="bg-red-950/40 border border-red-800 rounded-xl px-3 py-2 text-xs text-red-300"><b>${esc(r.name)}</b>: ${esc(r.error)}</div>`
        ).join('');
        const m = openModal(`
            <h3 class="text-base font-black text-white">✅ Accessi sicuri creati</h3>
            <p class="text-xs text-slate-400 leading-relaxed">Ogni autista ha un <b>nuovo PIN a 6 cifre</b>. Invialo con WhatsApp: il vecchio PIN a 4 cifre non funzionera' piu'. Puoi rivedere i PIN in ogni momento dalla scheda dell'autista.</p>
            <div class="space-y-2">${rows || '<div class="text-xs text-slate-400">Nessun autista da aggiornare.</div>'}</div>
            <button id="tacMigClose" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-3 rounded-xl text-xs">Chiudi</button>`);
        m.el.querySelector('#tacMigClose').onclick = m.close;
        m.el.querySelectorAll('.tac-wa').forEach((b) => {
            b.onclick = () => {
                const r = results[Number(b.dataset.i)];
                const msg = driverAccessMessage(cid, companyName, r.name, r.pin);
                const phone = String(r.phone || '').replace(/[^0-9]/g, '');
                const base = phone.length >= 8 ? `https://api.whatsapp.com/send?phone=${phone}&` : 'https://api.whatsapp.com/send?';
                window.open(`${base}text=${encodeURIComponent(msg)}`, '_blank');
            };
        });
    }

    // Banner nel pannello admin quando ci sono autisti ancora senza accesso sicuro
    function updateMigrationBanner(cid, companyName, driversMap) {
        let banner = document.getElementById('tachoMigrationBanner');
        const pending = Object.keys(driversMap || {}).filter((id) => driversMap[id] && !driversMap[id].authUid);
        const host = document.getElementById('adminSection');
        if (!isAdminOf(cid) || !pending.length || !host) {
            if (banner) banner.remove();
            return;
        }
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'tachoMigrationBanner';
            banner.className = 'no-print mb-4 bg-amber-950/60 border border-amber-500/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3';
            host.insertBefore(banner, host.firstChild);
        }
        banner.innerHTML = `
            <div class="flex-1 text-xs text-amber-100 leading-relaxed"><b>🔒 Aggiornamento sicurezza:</b> ${pending.length} autist${pending.length === 1 ? 'a deve' : 'i devono'} ricevere il nuovo PIN a 6 cifre.</div>
            <button id="tachoMigrationBtn" class="shrink-0 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs px-4 py-2.5 rounded-xl">Crea accessi sicuri</button>`;
        banner.querySelector('#tachoMigrationBtn').onclick = async () => {
            const btn = banner.querySelector('#tachoMigrationBtn');
            btn.disabled = true;
            try {
                const results = await migrateDrivers(cid, driversMap, (i, n) => { btn.textContent = `Creazione ${i}/${n}...`; });
                showMigrationResults(cid, companyName, results);
            } catch (e) {
                alert(errorMessage(e));
            } finally {
                btn.disabled = false;
                btn.textContent = 'Crea accessi sicuri';
            }
        };
    }

    // --- PIN GC CodeLab per i link portali ---
    // Il PIN e' la password di un account dedicato: lo verifica Firebase, che limita anche i tentativi.
    // Le regole del database permettono di scrivere i link solo a questo account.
    const LINK_EDITOR_EMAIL = 'pin-link@gestione.tachoapp.gccodelab.it';
    let linkApp = null;
    function linkEditorApp() {
        if (!linkApp) {
            linkApp = firebase.initializeApp(firebase.app().options, 'tacho-link');
            attachEmulators(linkApp);
            linkApp.auth().setPersistence(firebase.auth.Auth.Persistence.NONE).catch(() => {});
        }
        return linkApp;
    }
    function linkPinError(e) {
        if (e && e.code === 'auth/too-many-requests') return fail('tacho/pin-limit', 'Troppi tentativi con PIN errato. Riprova tra qualche minuto.');
        if (e && e.code === 'auth/network-request-failed') return fail('tacho/offline', 'Connessione assente: riprova quando sei online.');
        return fail('tacho/bad-pin', 'PIN non corretto.');
    }
    async function unlockLinkEditing(pin) {
        try {
            await linkEditorApp().auth().signInWithEmailAndPassword(LINK_EDITOR_EMAIL, String(pin));
        } catch (e) {
            throw linkPinError(e);
        }
    }
    function lockLinkEditing() {
        return linkApp && linkApp.auth().currentUser ? linkApp.auth().signOut().catch(() => {}) : Promise.resolve();
    }
    async function saveProtectedLinks(links) {
        const app = linkEditorApp();
        if (!app.auth().currentUser) throw fail('tacho/locked', 'Modifica bloccata: inserisci di nuovo il PIN.');
        await withTimeout(app.database().ref('link_portali').set(links), 10000);
        await lockLinkEditing();
    }
    async function setLinkPin(currentPin, newPin) {
        if (!isSuperAdmin()) throw fail('tacho/not-admin', 'Operazione riservata al Supervisore.');
        if (!/^\d{6,12}$/.test(newPin)) throw fail('tacho/weak-pin', 'Il PIN deve avere da 6 a 12 cifre.');
        const app = linkEditorApp();
        if (currentPin) {
            await unlockLinkEditing(currentPin);
            await app.auth().currentUser.updatePassword(newPin);
        } else {
            try {
                await app.auth().createUserWithEmailAndPassword(LINK_EDITOR_EMAIL, newPin);
            } catch (e) {
                if (e && e.code === 'auth/email-already-in-use') throw fail('tacho/pin-exists', 'Il PIN esiste gia\': inserisci il PIN attuale per cambiarlo.');
                throw e;
            }
        }
        await db.ref('utenti/' + app.auth().currentUser.uid).set({ companyId: 'GC-LINK', role: 'link_editor' });
        await lockLinkEditing();
    }

    window.TachoAuth = {
        unlockLinkEditing, lockLinkEditing, saveProtectedLinks, setLinkPin,
        ready,
        onChange(cb) { listeners.push(cb); if (resolvedOnce) cb(currentUser, currentProfile); },
        get user() { return currentUser; },
        get profile() { return currentProfile; },
        hasSessionHint() { try { return !!localStorage.getItem(SESSION_HINT_KEY); } catch (e) { return false; } },
        isEmulator: useEmulator,
        isSuperAdmin, isAdminOf, canAccess,
        loginAdmin, loginDriver, logout, sendPasswordReset, changePassword,
        createDriverAccount, removeDriverAccount, migrateDrivers, generatePin,
        createCompanyWithAdmin, publicCompanyInfo,
        nameKey, companyPath, errorMessage,
        ui: { updateMigrationBanner, showMigrationResults }
    };
})();
