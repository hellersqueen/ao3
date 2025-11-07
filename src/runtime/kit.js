// src/runtime/kit.js
;(function () {
  'use strict';
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H = W.AO3H || {};

  // ───────────────────────────────────────────────────────────────────────────
  // Minimal internal style registry (idempotent)
  const _ids = new Set();
  function _injectStyle(text, id) {
    if (id && _ids.has(id)) return;
    try {
      // Works under GM_* if available, else DOM
      if (typeof GM_addStyle === 'function') {
        GM_addStyle(text);
      } else {
        const el = document.createElement('style');
        el.textContent = text;
        (document.head || document.documentElement).appendChild(el);
      }
      if (id) _ids.add(id);
    } catch (e) {
      console.error('[AO3H][kit] style inject failed', e);
    }
  }

  function ensureStyle(id, cssText) { _injectStyle(String(cssText || ''), id); }

  // Tagged template convenience: css`...` or css('text','optional-key')
  let _cssBlockIdx = 0;
  function css(first, ...rest) {
    let text = '';
    let key  = `css-block-${_cssBlockIdx++}`;
    if (Array.isArray(first) && Object.prototype.hasOwnProperty.call(first, 'raw')) {
      const strings = first, vals = rest;
      text = strings.map((s, i) => s + (i < vals.length ? vals[i] : '')).join('');
    } else {
      text = String(first ?? '');
      if (typeof rest[0] === 'string') key = rest[0];
    }
    ensureStyle(key, text);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DOM helpers (inchangés)
  const onReady  = (fn) => (document.readyState === 'loading')
      ? document.addEventListener('DOMContentLoaded', fn, { once: true })
      : fn();
  const $        = (sel, root = document) => root.querySelector(sel);
  const $$       = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on       = (el, evt, cb, opts) => el && el.addEventListener(evt, cb, opts);
  const once     = (el, evt, cb, opts) => on(el, evt, (e) => { el.removeEventListener(evt, cb, opts); cb(e); }, opts);

  // observe(root?, opts?, cb)  or observe(cb)
  function observe(rootOrCb, optsOrCb, maybeCb) {
    let root = document.documentElement;
    let opts = { childList: true, subtree: true };
    let cb;
    if (typeof rootOrCb === 'function') {
      cb = rootOrCb;
    } else {
      if (rootOrCb) root = rootOrCb;
      if (typeof optsOrCb === 'function') cb = optsOrCb;
      else { if (optsOrCb) opts = optsOrCb; cb = maybeCb; }
    }
    if (typeof cb !== 'function') { console.warn('[AO3H] observe(): missing callback'); cb = () => {}; }
    const mo = new MutationObserver(cb);
    mo.observe(root, opts);
    return mo;
  }

  // timing utils (inchangés)
  const sleep    = (ms) => new Promise(r => setTimeout(r, ms));
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const throttle = (fn, ms = 200) => { let t = 0; return (...a) => { const n = Date.now(); if (n - t >= ms) { t = n; fn(...a); } }; };

  // ───────────────────────────────────────────────────────────────────────────
  // dialogs: helpers génériques pour <dialog>
  const dialogs = {
    ensure(id, html, wire) {
      let dlg = document.getElementById(id);
      if (!dlg) {
        dlg = document.createElement('dialog');
        dlg.id = id;
        dlg.classList.add('ao3h-dialog');
        dlg.innerHTML = html;
        (document.body || document.documentElement).appendChild(dlg);

        // Fermer si clic hors du rectangle
        dlg.addEventListener('click', (e) => {
          const r = dlg.getBoundingClientRect();
          const inside = e.clientX >= r.left && e.clientX <= r.right &&
                         e.clientY >= r.top && e.clientY <= r.bottom;
          if (!inside) dlg.close();
        });

        try { wire && wire(dlg); } catch (e) { console.error('[AO3H][dialogs] wire failed', e); }
      }
      return dlg;
    },
    open(dlg) {
      try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
    },
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Spécifique: Hidden Works Import/Export (pour menu.js)
  const hiddenWorksIE = {
    ensureAndOpen(AO3Href) {
      const id = 'ao3h-ie-dialog';
      const html = `
        <form method="dialog" style="margin:0">
          <h3 id="ao3h-ie-title" style="font-weight:800;margin:0 0 10px;font-size:16px;letter-spacing:.2px;">Hidden works</h3>
          <p id="ao3h-ie-desc" style="margin:0 0 14px;font-size:13px;"></p>
          <div id="ao3h-ie-row" style="display:flex;gap:10px;margin-top:8px;">
            <button type="button" id="ao3h-ie-export">Export JSON</button>
            <button type="button" id="ao3h-ie-import">Import JSON</button>
            <button type="button" id="ao3h-ie-try" style="display:none">Try enable module</button>
          </div>
          <div id="ao3h-ie-foot" style="display:flex;justify-content:flex-end;margin-top:10px;">
            <button id="ao3h-ie-cancel">Close</button>
          </div>
        </form>`;

      const dlg = dialogs.ensure(id, html, (dlgEl) => {
        const get = (i)=> document.getElementById(i);
        const ex = get('ao3h-ie-export');
        const im = get('ao3h-ie-import');
        const tr = get('ao3h-ie-try');
        const cancel = get('ao3h-ie-cancel');

        ex?.addEventListener('click', () => {
          if (typeof window.ao3hExportHiddenWorks === 'function') {
            try { window.ao3hExportHiddenWorks(); } finally { dlgEl.close(); }
          }
        });
        im?.addEventListener('click', () => {
          if (typeof window.ao3hImportHiddenWorks === 'function') {
            try { window.ao3hImportHiddenWorks(); } finally { dlgEl.close(); }
          }
        });
        tr?.addEventListener('click', async () => {
          try {
            const mods = AO3Href?.modules?.all ? AO3Href.modules.all() : [];
            const hit = mods.find(m => /hidden/i.test(m?.meta?.title || m?.name || ''));
            if (!hit) {
              alert('No module matching “hidden” was found in AO3H.modules.');
              return;
            }
            await AO3Href.modules.setEnabled(hit.name, true);
            dialogs.open(dlgEl);
            alert(`Enabled: ${hit.meta?.title || hit.name}`);
          } catch (e) {
            console.error('[AO3H] enable hidden module failed', e);
            alert('Failed to enable module. See console for details.');
          }
        });

        cancel?.addEventListener('click', () => dlgEl.close());
      });

      // État dynamique des boutons
      const hasExport = (typeof window.ao3hExportHiddenWorks === 'function');
      const hasImport = (typeof window.ao3hImportHiddenWorks === 'function');

      const desc = document.getElementById('ao3h-ie-desc');
      if (desc) {
        desc.textContent = (hasExport || hasImport)
          ? 'Choose what you want to do with your hidden-works list.'
          : 'The Hidden works module is not loaded on this page. Actions enable once the module loads.';
      }

      const exBtn = document.getElementById('ao3h-ie-export');
      const imBtn = document.getElementById('ao3h-ie-import');
      const tryBtn = document.getElementById('ao3h-ie-try');

      if (exBtn) exBtn.disabled = !hasExport;
      if (imBtn) imBtn.disabled = !hasImport;
      if (tryBtn) tryBtn.style.display = (hasExport || hasImport) ? 'none' : 'inline-block';

      dialogs.open(dlg);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Expose combiné (merge pour ne rien casser côté core.js et modules)
  AO3H.kit = Object.assign(AO3H.kit || {}, {
    ensureStyle, css,
    onReady, $, $$, on, once,
    observe, sleep, debounce, throttle,
    dialogs, hiddenWorksIE,
  });

  // Provide util alias for legacy modules expecting AO3H.util.*
  AO3H.util = Object.assign(AO3H.util || {}, {
    $, $$, on, once, onReady, observe, debounce, throttle, sleep, css,
  });
})();
