// src/runtime/core.js
;(function () {
  'use strict';
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  // ───────────────────────────────────────────────────────────────────────────
  // ENV / NS / LOG
  const NS      = 'ao3h';
  const VERSION = '1.2.3';
  const DEBUG   = false;   // set true for verbose debug
  const LOG_LVL = 1;       // 0: silent, 1: info, 2: debug

  const log = {
    info: (...a) => { if (LOG_LVL >= 1) console.log('[AO3H]', ...a); },
    dbg : (...a) => { if (DEBUG && LOG_LVL >= 2) console.log('[AO3H][D]', ...a); },
    warn: (...a) => { console.warn('[AO3H][!]', ...a); },
    err : (...a) => { console.error('[AO3H][X]', ...a); },
  };

  const AO3H = W.AO3H = W.AO3H || {};
  AO3H.env = Object.assign(AO3H.env || {}, { NS, VERSION, DEBUG, LOG_LVL });
  AO3H.log = AO3H.log || log;

  // Keep util alias available (kit will fill real functions)
  AO3H.util = AO3H.util || {};

  // ───────────────────────────────────────────────────────────────────────────
  // BUS (may be filled by runtime/bus.js; fallback to no-op until then)
  const Bus = AO3H.bus || { on(){}, off(){}, emit(){} };

  // ───────────────────────────────────────────────────────────────────────────
  // guard(): protect module init/stop
  async function guard(fn, label = '') {
    try { return await fn(); }
    catch (e) {
      console.error('[AO3H][guard]', label, e);
      try { Bus.emit('error', { label, error: e }); } catch {}
      return undefined;
    }
  }
  AO3H.guard = guard;                 // convenience
  AO3H.util.guard = guard;            // legacy alias

  // ───────────────────────────────────────────────────────────────────────────
  // Module registry
  function slugify(name) {
    return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  const Modules = (() => {
    // name => { meta, init, enabledKey, enabledKeyAlt, _booted, _dispose }
    const list = new Map();

    function _disposer(ret) {
      if (typeof ret === 'function') return ret;
      if (ret && typeof ret.dispose === 'function') return () => ret.dispose();
      return null;
    }
    function _keyPair(name) {
      const canonical = `mod:${name}:enabled`;
      const alt = `mod:${slugify(name)}:enabled`;
      return { canonical, alt };
    }
    function _effectiveOn(m) {
      const Flags = AO3H.flags; // from store.js
      return !!Flags?.get(m.enabledKey, !!m.meta?.enabledByDefault)
          || !!Flags?.get(m.enabledKeyAlt, false);
    }

    async function bootOne(name) {
      const m = list.get(name);
      if (!m || m._booted) return false;
      return await guard(async () => {
        log.info(`Boot ${name}`);
        const ret = await m.init?.();
        m._dispose = _disposer(ret);
        m._booted  = true;
        Bus.emit('module:started', { name });
        return true;
      }, `init:${name}`);
    }

    async function stopOne(name) {
      const m = list.get(name);
      if (!m || !m._booted) return false;
      return await guard(async () => {
        log.info(`Stop ${name}`);
        try { m._dispose?.(); } catch (e) { log.err('dispose failed', e); }
        m._dispose = null;
        m._booted  = false;
        Bus.emit('module:stopped', { name });
        return true;
      }, `stop:${name}`);
    }

    async function _refresh(name) {
      const m = list.get(name); if (!m) return;
      const want = _effectiveOn(m);
      if (want && !m._booted) await bootOne(name);
      else if (!want && m._booted) await stopOne(name);
    }

    function register(name, meta, init) {
      const { canonical, alt } = _keyPair(name);
      const prev = list.get(name);
      const base = {
        meta: meta || prev?.meta || {},
        init: init || prev?.init,
        enabledKey: canonical,
        enabledKeyAlt: alt,
        _booted: false,
        _dispose: null,
      };
      list.set(name, base);

      // Watch both keys — start/stop only (flags live in store.js)
      const Flags = AO3H.flags;
      Flags?.watch(canonical, () => { _refresh(name); });
      if (alt !== canonical) Flags?.watch(alt, () => { _refresh(name); });
    }

    async function bootAll() { for (const [name, m] of list) { if (_effectiveOn(m)) await bootOne(name); } }
    async function stopAll() { for (const [name] of list) await stopOne(name); }

    async function setEnabled(name, val) {
      const m = list.get(name); if (!m) return;
      const Flags = AO3H.flags;
      await Flags?.set(m.enabledKey, !!val);
      if (m.enabledKeyAlt !== m.enabledKey) await Flags?.set(m.enabledKeyAlt, !!val);
      // watchers call _refresh
    }

    function all() {
      return Array.from(list.entries()).map(([name, m]) => ({ name, ...m }));
    }

    return { register, all, bootAll, stopAll, setEnabled, _bootOne: bootOne, _stopOne: stopOne, _list: list };
  })();

  AO3H.modules = AO3H.modules || Modules;

  // ───────────────────────────────────────────────────────────────────────────
  // Menu placeholder (filled by menu module later)
  AO3H.menu = AO3H.menu || { addToggle(){}, addAction(){}, addSeparator(){}, rebuild(){} };

  // ───────────────────────────────────────────────────────────────────────────
  // Base CSS (moved from old core.css injections) — keep inline for dev
  const ensureStyle = (AO3H.kit && AO3H.kit.ensureStyle) || ((id, text) => {
    const el = document.createElement('style'); el.textContent = text;
    (document.head || document.documentElement).appendChild(el);
  });

  ensureStyle('base-colors', `
    :root { --${NS}-ink:#222; --${NS}-bg:#111a; --${NS}-accent:#c21; }
    .${NS}-hidden { display:none !important; }
  `);

  ensureStyle('fix-tags-wrap', `
    /* Work header meta list: force tags to wrap properly */
    dl.work.meta.group dd.tags { overflow: visible !important; white-space: normal !important; }
    dl.work.meta.group dd.tags ul.tags,
    dl.work.meta.group dd.tags ul.tags.commas { display: block !important; overflow: visible !important; white-space: normal !important; }
    dl.work.meta.group dd.tags ul.tags li { display: inline !important; white-space: normal !important; }
    dl.work.meta.group dd.tags a.tag {
      display: inline !important; white-space: normal !important;
      overflow: visible !important; text-overflow: clip !important; max-width: none !important;
    }
  `);

  // ───────────────────────────────────────────────────────────────────────────
  // Defaults + boot
  const DEFAULT_FLAGS = {
    'ui:showMenuButton': false,
    'mod:SaveScroll:enabled': true,
    // Your note: default ON for the work-page scanner
    'mod:CheckForKudos:enabled': true,
  };

  (async function boot() {
    // store.js must populate AO3H.flags before this runs (the DEV loader order handles it)
    if (!AO3H.flags || !AO3H.flags.init) {
      console.warn('[AO3H] flags missing at boot; continuing but modules may not auto-start');
    } else {
      await AO3H.flags.init(DEFAULT_FLAGS);
    }
    Bus.emit('core:ready', { version: VERSION });
    await AO3H.modules.bootAll();
    log.info('Core ready', VERSION);

    try {
      AO3H.modules.all().forEach(m => {
        log.info('Module registered:', m.name, 'keys:', m.enabledKey, m.enabledKeyAlt);
      });
    } catch {}
  })();
})();
