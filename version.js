// Versione dell'app: a OGNI pubblicazione si aumenta questo numero (es. 15.0 -> 15.1).
// Lo usano la scritta visibile nell'app e il service worker per riconoscere l'aggiornamento e mostrare la barra "Aggiorna".
self.APP_VERSION = '16.2';

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-app-version]').forEach((el) => { el.textContent = 'v' + self.APP_VERSION; });
    });
}
