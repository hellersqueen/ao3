/* ──────────────────────────────────────────────────────────────────────────
   AO3H • UI Bits • buildSubmenu(label, { ns })
   ────────────────────────────────────────────────────────────────────── */
(function(){
  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const AO3H = W.AO3H = W.AO3H || {};
  const NS = (AO3H.env && AO3H.env.NS) || 'ao3h';

  AO3H.ui = AO3H.ui || {};

  AO3H.ui.buildSubmenu = function buildSubmenu(label, { ns = NS } = {}){
    const s = AO3H.store?.ns ? AO3H.store.ns('menu') : null;

    const li  = document.createElement('li');
    li.setAttribute('data-ao3h-submenu','1');

    const a   = document.createElement('a');
    a.href = '#';
    a.innerHTML = `<span class="${ns}-label">${label}</span><span class="${ns}-caret ao3h-caret">▾</span>`;
    a.setAttribute('aria-haspopup','true');
    a.setAttribute('aria-expanded','false');

    const ul  = document.createElement('ul');
    ul.className = `menu dropdown-menu ${ns}-submenu ao3h-submenu`;
    ul.setAttribute('role','menu');

    const saved = new Map(Object.entries(s?.get('submenuState', {}) || {}));
    const setOpen = (next) => {
      ul.classList.toggle('open', !!next);
      a.setAttribute('aria-expanded', String(!!next));
      saved.set(label, !!next);
      if (s) s.set('submenuState', Object.fromEntries(saved));
      else localStorage.setItem(`${ns}-submenu-state`, JSON.stringify(Object.fromEntries(saved)));
    };

    // restore
    if (saved.has(label)) setOpen(!!saved.get(label));
    else {
      // si pas de store, fallback localStorage
      if (!s) {
        try {
          const raw = JSON.parse(localStorage.getItem(`${ns}-submenu-state`) || '{}');
          if (raw && Object.prototype.hasOwnProperty.call(raw, label)) setOpen(!!raw[label]);
        } catch {}
      }
    }

    const toggle = (force)=>{
      const open = ul.classList.contains('open');
      setOpen(typeof force === 'boolean' ? force : !open);
    };

    a.addEventListener('click', (e)=>{ e.preventDefault(); toggle(); });
    a.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); ul.querySelector('a')?.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(false); }
    });
    ul.addEventListener('keydown', (e)=>{
      if (e.key === 'ArrowUp' || e.key === 'Escape') { e.preventDefault(); setOpen(false); a.focus(); }
    });

    li.append(a, ul);
    li.__ao3hSetOpen = setOpen;

    return { li, ul, header:a, setOpen, toggle };
  };
})();
