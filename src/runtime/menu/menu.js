// src/modules/menu.js
;(function () {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H = W.AO3H || {};

  // ✅ Routes globales (définies dans runtime/routes.js)
  const routes = AO3H.routes || {};

  // ✅ Kit & bus globaux (déjà attachés par core.js)
  const kit = AO3H.kit || {};
  const bus = AO3H.bus || {};
  const EVENTS = bus.EVENTS || {};

  const NS = 'ao3h';
  const STYLE_ID = 'ao3h-menu-style';
  const MENU_CSS = AO3H.styles?.menu || ''; // injecté via kit.ensureStyle

  const M_FLAGS = AO3H.flags;
  const M_MODULES = AO3H.modules;

  const HOVER_CLOSE_DELAY = 280;

  // ---------------------------------------------------------------------------
  // LABEL HELPERS
  // ---------------------------------------------------------------------------

  function moduleNameFromFlagKey(flagKey) {
    const mods = (M_MODULES && M_MODULES.all ? M_MODULES.all() : []);
    const hit = mods.find(m => m.enabledKey === flagKey || m.enabledKeyAlt === flagKey);
    return hit ? hit.name : null;
  }

  function inferLabelFromRegistry(flagKey) {
    const mods = (M_MODULES && M_MODULES.all ? M_MODULES.all() : []);
    const hit = mods.find(m => m.enabledKey === flagKey || m.enabledKeyAlt === flagKey);
    return hit?.meta?.title || hit?.name || null;
  }

  function humanizeFromFlag(flagKey) {
    const m = /mod:([^:]+):/.exec(flagKey);
    const base = m ? m[1] : String(flagKey);
    const withSpaces = base
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[\W_]+/g, ' ')
      .trim();
    return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
  }

  function sanitizeLabel(label, flagKey) {
    if (typeof label === 'string') {
      const t = label.trim();
      if (t && t.toLowerCase() !== 'true' && t.toLowerCase() !== 'false') return t;
    }
    return inferLabelFromRegistry(flagKey) || humanizeFromFlag(flagKey);
  }

  // ---------------------------------------------------------------------------
  // MENU STATE
  // ---------------------------------------------------------------------------

  let M_rootLI, M_toggleEl, M_menuUL;
  const M_customItems = [];  // {type:'toggle'|'action'|'sep', label, flagKey, defaultOn, ...}

  function closeAllSubmenus() {
    if (!M_menuUL) return;
    M_menuUL.querySelectorAll(`.${NS}-submenu.open, .ao3h-submenu.open`).forEach(sub => {
      sub.classList.remove('open');
      const toggle = sub.previousElementSibling;
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
  }

  // ---------------------------------------------------------------------------
  // MENU ITEM BUILDERS
  // ---------------------------------------------------------------------------

  function itemToggle(label, flagKey, current) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#';
    a.dataset.flag = flagKey;
    a.setAttribute('role', 'menuitemcheckbox');
    a.setAttribute('aria-checked', String(!!current));
    if (current) a.classList.add(`${NS}-on`, 'ao3h-on');
    a.innerHTML = `
      <span class="${NS}-label ao3h-label">${sanitizeLabel(label, flagKey)}</span>
      <span class="${NS}-switch ao3h-switch" aria-hidden="true"></span>
    `;
    li.appendChild(a);
    return li;
  }

  function itemAction(label, hint, handler) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#';
    a.innerHTML =
      `<span class="${NS}-label ao3h-label">${label}</span>` +
      (hint ? `<span class="${NS}-kbd ao3h-kbd">${hint}</span>` : '');
    a.addEventListener('click', e => {
      e.preventDefault();
      handler?.();
    });
    li.appendChild(a);
    return li;
  }

  function itemDivider() {
    const li = document.createElement('li');
    li.className = `${NS}-divider ao3h-divider`;
    return li;
  }

  function itemSubmenu(label, buildChildren) {
    const li = document.createElement('li');

    const a = document.createElement('a');
    a.href = '#';
    a.innerHTML =
      `<span class="${NS}-label ao3h-label">${label}</span>` +
      `<span class="${NS}-caret ao3h-caret">▾</span>`;
    a.setAttribute('aria-haspopup', 'true');
    a.setAttribute('aria-expanded', 'false');

    const sub = document.createElement('ul');
    sub.className = `menu dropdown-menu ${NS}-submenu ao3h-submenu`;
    sub.setAttribute('role', 'menu');

    buildChildren(sub);

    const toggle = force => {
      const isOpen = sub.classList.contains('open');
      const next = typeof force === 'boolean' ? force : !isOpen;
      sub.classList.toggle('open', next);
      a.setAttribute('aria-expanded', String(next));
    };

    a.addEventListener('click', e => {
      e.preventDefault();
      toggle();
    });

    a.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle(true);
        sub.querySelector('a')?.focus();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        toggle(true);
        sub.querySelector('a')?.focus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        toggle(false);
      }
    });

    sub.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'Escape') {
        e.preventDefault();
        toggle(false);
        a.focus();
      }
    });

    document.addEventListener('pointerdown', ev => {
      if (!li.contains(ev.target)) toggle(false);
    });

    li.append(a, sub);
    return li;
  }

  // ---------------------------------------------------------------------------
  // MENU RENDER
  // ---------------------------------------------------------------------------

  function fillMenu() {
    M_menuUL.innerHTML = '';

    // 1) Auto toggles
    const mods = (M_MODULES && M_MODULES.all ? M_MODULES.all() : []);
    if (mods.length) {
      for (const { name, meta, enabledKey } of mods) {
        const lbl = sanitizeLabel(meta?.title || name, enabledKey);
        const onNow = !!M_FLAGS.get(enabledKey, !!meta?.enabledByDefault);
        M_menuUL.appendChild(itemToggle(lbl, enabledKey, onNow));
      }
    } else {
      const li = document.createElement('li');
      li.innerHTML = `<a><span class="${NS}-label ao3h-label">No modules registered</span></a>`;
      M_menuUL.appendChild(li);
    }

    // 2) Divider
    M_menuUL.appendChild(itemDivider());

    // 3) Custom toggles only
    for (const it of M_customItems) {
      if (it.type === 'sep') {
        M_menuUL.appendChild(itemDivider());
        continue;
      }
      if (it.type === 'toggle') {
        const onNow = !!M_FLAGS.get(it.flagKey, !!it.defaultOn);
        M_menuUL.appendChild(
          itemToggle(sanitizeLabel(it.label, it.flagKey), it.flagKey, onNow)
        );
        continue;
      }
    }

    // 4) Manage submenu
    const manageSep = itemDivider();
    manageSep.classList.add(`${NS}-manage-sep`);
    M_menuUL.appendChild(manageSep);

    const manage = itemSubmenu('Manage', sub => {
      sub.appendChild(
        itemAction('Hidden tags…', '', () => {
          bus.emit(EVENTS.OPEN_HIDE_MANAGER);
        })
      );

      sub.appendChild(
        itemAction('Hidden works…', 'Import / Export', () => {
          bus.emit(EVENTS.OPEN_HIDDEN_WORKS_IE);
        })
      );

      sub.appendChild(
        itemAction('Text Replacer…', '', () => {
          bus.emit(EVENTS.OPEN_TEXTREPLACER_MANAGER);
        })
      );
    });

    manage.classList.add(`${NS}-manage-tail`);
    M_menuUL.appendChild(manage);
  }

  // ---------------------------------------------------------------------------
  // MENU OPEN / CLOSE
  // ---------------------------------------------------------------------------

  let M_closeTimer = null;

  function cancelCloseTimer() {
    if (M_closeTimer) {
      clearTimeout(M_closeTimer);
      M_closeTimer = null;
    }
  }

  function openMenu() {
    cancelCloseTimer();
    M_rootLI.classList.add('open');
    M_toggleEl.setAttribute('aria-expanded', 'true');
  }

  function closeMenu(opts = {}) {
    const { defer = false, delay = HOVER_CLOSE_DELAY } = opts;
    if (defer) {
      cancelCloseTimer();
      M_closeTimer = setTimeout(() => closeMenu({ defer: false }), delay);
      return;
    }
    cancelCloseTimer();
    closeAllSubmenus();
    M_rootLI.classList.remove('open');
    M_toggleEl.setAttribute('aria-expanded', 'false');
  }

  // ---------------------------------------------------------------------------
  // MENU CONSTRUCTION
  // ---------------------------------------------------------------------------

  function buildMenu() {
    if (document.querySelector(`li.${NS}-root, li.ao3h-root`)) return;

    M_rootLI = document.createElement('li');
    M_rootLI.className = `dropdown ${NS}-root ao3h-root`;
    M_rootLI.setAttribute('aria-haspopup', 'true');
    M_rootLI.tabIndex = 0;

    M_toggleEl = document.createElement('span');
    M_toggleEl.className = `${NS}-navlink ao3h-navlink`;
    M_toggleEl.textContent = 'AO3 Helper';

    M_menuUL = document.createElement('ul');
    M_menuUL.className = `menu dropdown-menu ${NS}-menu ao3h-menu`;
    M_menuUL.setAttribute('role', 'menu');

    M_rootLI.append(M_toggleEl, M_menuUL);

    const navUL =
      document.querySelector('ul.primary.navigation.actions') ||
      document.querySelector('#header .primary.navigation ul') ||
      document.querySelector('#header .navigation ul');

    if (navUL) {
      navUL.insertBefore(M_rootLI, navUL.firstChild);
    } else {
      const floater = document.createElement('div');
      floater.style.cssText =
        'position:fixed;right:14px;bottom:14px;z-index:999999;';
      floater.appendChild(M_rootLI);
      (document.body || document.documentElement).appendChild(floater);
    }

    // Hover, focus, click
    kit.on?.(M_rootLI, 'mouseenter', openMenu);
    kit.on?.(M_rootLI, 'mouseleave', () => closeMenu({ defer: true }));
    kit.on?.(M_rootLI, 'focusin', openMenu);
    kit.on?.(M_rootLI, 'focusout', e => {
      if (!M_rootLI.contains(e.relatedTarget)) closeMenu();
    });

    kit.on?.(M_toggleEl, 'click', e => {
      e.preventDefault();
      M_rootLI.classList.contains('open') ? closeMenu() : openMenu();
    });

    // Keyboard navigation
    kit.on?.(M_menuUL, 'keydown', e => {
      const items = Array.from(M_menuUL.querySelectorAll('a'));
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        (items[i + 1] || items[0])?.focus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        (items[i - 1] || items[items.length - 1])?.focus();
      }
      if (e.key === 'Home') {
        e.preventDefault();
        items[0]?.focus();
      }
      if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1]?.focus();
      }
    });

    // Toggles
    kit.on?.(M_menuUL, 'click', async e => {
      const a = e.target.closest('a[data-flag]');
      if (!a) return;
      e.preventDefault();

      const key = a.dataset.flag;
      const mods = M_MODULES.all ? M_MODULES.all() : [];
      const hit = mods.find(
        m => m.enabledKey === key || m.enabledKeyAlt === key
      );

      const next = !M_FLAGS.get(key, false);

      try {
        if (hit) {
          await M_MODULES.setEnabled(hit.name, next);
        } else {
          await M_FLAGS.set(key, next);
        }
      } catch (err) {
        console.error('[AO3H][menu] toggle failed', key, err);
      }

      a.setAttribute('aria-checked', String(next));
      a.classList.toggle(`${NS}-on`, next);
      a.classList.toggle('ao3h-on', next);

      bus.emit?.(EVENTS.FLAGS_UPDATED, { key, value: next });
    });

    // Close when clicking outside or pressing Escape
    kit.on?.(document, 'click', e => {
      if (!M_rootLI.contains(e.target)) closeMenu();
    });
    kit.on?.(document, 'keydown', e => {
      if (e.key === 'Escape') closeMenu();
    });

    fillMenu();
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------

  function addToggle(flagKey, labelOrDefault, maybeDefault) {
    let defaultOn = false;
    let label = '';

    if (
      typeof labelOrDefault === 'boolean' &&
      typeof maybeDefault === 'undefined'
    ) {
      defaultOn = labelOrDefault;
      label = null;
    } else {
      label = labelOrDefault == null ? '' : String(labelOrDefault);
      defaultOn = !!maybeDefault;
    }

    const cleanLabel = sanitizeLabel(label, flagKey);

    M_customItems.push({
      type: 'toggle',
      flagKey,
      label: cleanLabel,
      defaultOn,
      moduleName: moduleNameFromFlagKey(flagKey),
    });

    if (M_menuUL) fillMenu();
  }

  function addAction(label, handler, hint = '') {
    M_customItems.push({ type: 'action', label, handler, hint });
    if (M_menuUL) fillMenu();
  }

  function addSeparator() {
    M_customItems.push({ type: 'sep' });
    if (M_menuUL) fillMenu();
  }

  function rebuild() {
    if (M_menuUL) fillMenu();
  }

  AO3H.menu = { addToggle, addAction, addSeparator, rebuild };

  // ---------------------------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------------------------

  kit.onReady?.(() => {
    // Inject CSS (exporté par src/styles/menu.css.js)
    kit.ensureStyle?.(STYLE_ID, MENU_CSS);

    // ❌ Ne pas afficher le menu sur Kudos History
    if (routes.isKudosHistory?.()) return;

    try {
      buildMenu();

      // Sync des switches quand flags changent ailleurs
      bus.on?.(EVENTS.FLAGS_UPDATED, () => {
        if (!M_menuUL) return;
        const get = k => (M_FLAGS.get ? M_FLAGS.get(k, false) : false);
        M_menuUL.querySelectorAll('a[data-flag]').forEach(a => {
          const on = !!get(a.dataset.flag);
          a.setAttribute('aria-checked', String(on));
          a.classList.toggle(`${NS}-on`, on);
          a.classList.toggle('ao3h-on', on);
        });
      });

      // Brancher Hidden Works IE
      bus.on?.(EVENTS.OPEN_HIDDEN_WORKS_IE, () => {
        AO3H.kit?.hiddenWorksIE?.ensureAndOpen?.(AO3H);
      });

      // Tampermonkey entrée
      try {
        GM_registerMenuCommand?.('AO3 Helper — Open', () => {
          const tab = document.querySelector(`li.${NS}-root, li.ao3h-root`);
          tab?.dispatchEvent(new Event('mouseenter'));
        });
      } catch {}

    } catch (err) {
      console.error('[AO3H][menu] build failed', err);
    }
  });
})();
