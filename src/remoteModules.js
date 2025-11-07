// remoteModules.js — dynamic module loader for AO3 Helper (CSP-safe)
;(function () {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H = W.AO3H || {};
  const NS = (AO3H.env && AO3H.env.NS) || 'ao3h';

  // --- Garde le même manifest que dans ton repo actuel ---
  const MANIFEST_URL = 'https://raw.githubusercontent.com/hellersqueen/ao3/refs/heads/main/src/ao3h-manifest.json';

  // ---------------------------- Utils ----------------------------
  function isCssUrl(u) {
    try { const url = new URL(u, location.href); return url.pathname.toLowerCase().endsWith('.css'); }
    catch { return /\.css(\?.*)?$/i.test(u); }
  }
  function isJsUrl(u) {
    try { const url = new URL(u, location.href); return url.pathname.toLowerCase().endsWith('.js'); }
    catch { return /\.js(\?.*)?$/i.test(u); }
  }

  function getText(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          headers: { 'Accept': 'text/plain,*/*;q=0.9' },
          onload: (res) => (res.status >= 200 && res.status < 300)
            ? resolve(res.responseText)
            : reject(new Error(`HTTP ${res.status} for ${url}`)),
          onerror: () => reject(new Error(`Network error for ${url}`)),
          ontimeout: () => reject(new Error(`Timeout for ${url}`)),
        });
      } else {
        fetch(url, { cache: 'no-store', credentials: 'omit' })
          .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status} for ${url}`)))
          .then(resolve, reject);
      }
    });
  }

  function evalJsFrom(url, code) {
    const wrapped = `${code}\n//# sourceURL=${url}`;
    // eslint-disable-next-line no-new-func
    new Function(wrapped)();
  }

  function injectCss(cssText) {
    if (typeof GM_addStyle === 'function') {
      GM_addStyle(cssText);
    } else {
      const style = document.createElement('style');
      style.textContent = cssText;
      (document.head || document.documentElement).appendChild(style);
    }
  }

  const Store = AO3H.store || {
    get(k, d){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
  };

  async function runMigrationsIfNeeded(manifest) {
    const KEY = `${NS}:manifestVersion`;
    const prev = Store.get(KEY, null);
    const curr = manifest.version || '0.0.0';
    if (prev === curr) return;
    try {
      // Placeholders de migration si besoin
      Store.set(KEY, curr);
      console.log(`[AO3H] Migrations checked for version ${curr}`);
    } catch (err) {
      console.warn('[AO3H] Migration error:', err);
    }
  }

  async function fetchManifest() {
    const text = await getText(MANIFEST_URL);
    return JSON.parse(text);
  }

  // Charge dans l’ordre : core → menu → modules (comme avant).
  // Accepte JS et CSS dans n’importe quel groupe.
  async function loadFromManifest(manifest) {
    const list = [];
    if (manifest.core?.length)    list.push(...manifest.core);
    if (manifest.menu?.length)    list.push(...manifest.menu);
    if (manifest.modules?.length) list.push(...manifest.modules);

    const v = encodeURIComponent(manifest.version || '');
    for (const baseUrl of list) {
      const url = v ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}v=${v}` : baseUrl;
      try {
        if (isCssUrl(url)) {
          console.log('[AO3H] CSS  →', url);
          const css = await getText(url);
          injectCss(css);
        } else if (isJsUrl(url)) {
          console.log('[AO3H] JS   →', url);
          const js = await getText(url);
          evalJsFrom(url, js);
        } else {
          // Si l’extension est inconnue, on tente JS puis fallback CSS
          console.log('[AO3H] ?JS →', url);
          const txt = await getText(url);
          try { evalJsFrom(url, txt); }
          catch (e) { console.warn('[AO3H] Fallback CSS for', url, e); injectCss(txt); }
        }
      } catch (e) {
        console.error('[AO3H] Error loading', url, e);
      }
    }
  }

  async function boot() {
    try {
      const manifest = await fetchManifest();
      await runMigrationsIfNeeded(manifest);
      await loadFromManifest(manifest);

      if (W.AO3H?.modules?.bootAll) {
        await W.AO3H.modules.bootAll();
        W.AO3H.menu?.rebuild?.();
        console.log('[AO3H] Modules booted via manifest and menu rebuilt');
      } else {
        console.warn('[AO3H] modules.bootAll not found; verify core/menu loaded from manifest');
      }
    } catch (e) {
      console.error('[AO3H] Manifest boot error:', e);
    }
  }

  boot();
})();
