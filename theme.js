// Tema giorno / notte: la scelta resta salvata su questo dispositivo. Il tema predefinito e' quello chiaro.
(function () {
    const KEY = 'tacho_theme';
    const DARK_BAR = '#0B1626';
    const LIGHT_BAR = '#eef2f7';
    const SUN = '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    const MOON = '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';

    function savedTheme() {
        try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; }
    }
    function isLight() {
        return document.documentElement.getAttribute('data-theme') === 'light';
    }
    function updateButton() {
        const light = isLight();
        const label = light ? 'Passa al tema notte' : 'Passa al tema giorno';
        document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
            btn.innerHTML = light ? MOON : SUN;
            btn.title = label;
            btn.setAttribute('aria-label', label);
        });
    }
    function apply(theme) {
        if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
        else document.documentElement.removeAttribute('data-theme');
        const bar = document.querySelector('meta[name="theme-color"]');
        if (bar) bar.setAttribute('content', theme === 'light' ? LIGHT_BAR : DARK_BAR);
        updateButton();
    }

    apply(savedTheme()); // subito, per evitare il lampo di colore all'apertura

    document.addEventListener('DOMContentLoaded', () => {
        // Luci di sfondo della pagina di accesso (mostrate e animate dal foglio di stile)
        const lights = document.createElement('div');
        lights.id = 'loginLights';
        lights.setAttribute('aria-hidden', 'true');
        lights.innerHTML = '<span></span>'.repeat(8);
        document.body.insertBefore(lights, document.body.firstChild);

        const makeButton = (id, cls) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = id;
            btn.className = cls + ' no-print';
            btn.setAttribute('data-theme-toggle', '');
            btn.onclick = () => {
                const next = isLight() ? 'dark' : 'light';
                try { localStorage.setItem(KEY, next); } catch (e) {}
                apply(next);
            };
            return btn;
        };
        // Nell'area amministratore sta nell'intestazione; nelle altre schermate resta in basso a destra
        const headerActions = document.querySelector('#adminHeader .flex-shrink-0.flex.items-center.flex-wrap');
        if (headerActions) headerActions.insertBefore(makeButton('themeToggleHeader', 'theme-toggle-header'), headerActions.firstChild);
        // Nella pagina di accesso sta nel riquadro Area Amministrativa
        const loginRow = document.querySelector('#loginAdminBox > div');
        if (loginRow) loginRow.appendChild(makeButton('themeToggleLogin', 'theme-toggle-header'));
        document.body.appendChild(makeButton('themeToggle', 'theme-toggle'));
        apply(savedTheme());
    });
})();
