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
        addPasswordEyes();
    });

    // Occhio nei campi password e PIN: mostra cio' che si e' scritto e si richiude quando il campo sparisce dalla schermata.
    function addPasswordEyes() {
        const EYE = '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
        const EYE_OFF = '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4M6.5 6.6A16.6 16.6 0 002 12s3.6 7 10 7a10 10 0 005-1.4M9.9 9.9a3 3 0 004.2 4.2"/></svg>';
        const style = document.createElement('style');
        style.textContent = 'input::-ms-reveal,input::-ms-clear{display:none}';
        document.head.appendChild(style);

        // Il PIN del conducente e' un campo di testo con i pallini: cosi' il browser non lo salva come password.
        const canMask = !!(window.CSS && CSS.supports('-webkit-text-security', 'disc'));
        document.querySelectorAll('input[type="password"], input[data-pin-mask]').forEach((input) => {
            const useMask = input.hasAttribute('data-pin-mask') && canMask;
            if (input.hasAttribute('data-pin-mask') && !canMask) input.type = 'password';
            const small = input.classList.contains('text-xs');
            const room = small ? '1.75rem' : '2.75rem';
            input.style.paddingRight = room;
            if (input.classList.contains('text-center')) input.style.paddingLeft = room;

            const wrap = document.createElement('div');
            wrap.className = 'relative w-full';
            input.parentNode.insertBefore(wrap, input);
            wrap.appendChild(input);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'absolute inset-y-0 right-0 flex items-center text-slate-400 hover:text-white no-print ' + (small ? 'px-1.5' : 'px-3');
            const isHidden = () => (useMask ? input.style.webkitTextSecurity !== 'none' : input.type === 'password');
            const show = (visible) => {
                if (useMask) input.style.webkitTextSecurity = visible ? 'none' : 'disc';
                else input.type = visible ? 'text' : 'password';
                btn.innerHTML = visible ? EYE_OFF : EYE;
                const label = visible ? 'Nascondi' : 'Mostra';
                btn.title = label;
                btn.setAttribute('aria-label', label);
            };
            // Il tocco sull'occhio non deve togliere il cursore dal campo
            btn.addEventListener('mousedown', (e) => e.preventDefault());
            btn.addEventListener('click', () => show(isHidden()));
            show(false);
            wrap.appendChild(btn);

            if ('IntersectionObserver' in window) {
                new IntersectionObserver((entries) => {
                    if (!entries[entries.length - 1].isIntersecting) show(false);
                }).observe(input);
            }
        });
    }
})();
