// Tema giorno / notte: la scelta resta salvata su questo dispositivo. Il tema predefinito e' quello scuro.
(function () {
    const KEY = 'tacho_theme';
    const DARK_BAR = '#0B1626';
    const LIGHT_BAR = '#eef2f7';
    const SUN = '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    const MOON = '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';

    function savedTheme() {
        try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; }
    }
    function isLight() {
        return document.documentElement.getAttribute('data-theme') === 'light';
    }
    function updateButton() {
        const btn = document.getElementById('themeToggle');
        if (!btn) return;
        const light = isLight();
        btn.innerHTML = light ? MOON : SUN;
        const label = light ? 'Passa al tema notte' : 'Passa al tema giorno';
        btn.title = label;
        btn.setAttribute('aria-label', label);
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
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'themeToggle';
        btn.className = 'theme-toggle no-print';
        btn.onclick = () => {
            const next = isLight() ? 'dark' : 'light';
            try { localStorage.setItem(KEY, next); } catch (e) {}
            apply(next);
        };
        document.body.appendChild(btn);
        apply(savedTheme());
    });
})();
