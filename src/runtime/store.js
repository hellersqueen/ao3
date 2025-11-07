// src/runtime/store.js
;(function () {
  'use strict';
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H = W.AO3H || {};
  const NS = (AO3H.env && AO3H.env.NS) || 'ao3h';

  // STORAGE (GM_* + localStorage mirror)
  const Store = {
    key: (k) => `${NS}:${k}`,
    async get(k, d = null) { try { return await GM_getValue(this.key(k), d); } catch { return d; } },
    async set(k, v)        { try { GM_setValue(this.key(k), v); } catch (e) { console.error('[AO3H][store] GM_setValue', e); } return v; },
    async del(k)           { try { GM_deleteValue(this.key(k)); } catch (e) { console.error('[AO3H][store] GM_deleteValue', e); } },
    lsGet(k, d = null)     { try { const v = localStorage.getItem(this.key(k)); return v == null ? d : JSON.parse(v); } catch { return d; } },
    lsSet(k, v)            { try { localStorage.setItem(this.key(k), JSON.stringify(v)); } catch (e) { console.error('[AO3H][store] lsSet', e); } return v; },
    lsDel(k)               { try { localStorage.removeItem(this.key(k)); } catch (e) { console.error('[AO3H][store] lsDel', e); } },
  };

  // EVENT BUS
  const Bus = AO3H.bus || { on(){}, off(){}, emit(){} };

  // FLAGS
  const Flags = (() => {
    const DEF_KEY = 'flags';
    let cache = null;
    const watchers = new Map(); // key => Set<fn>

    function _ensureLoaded() { if (cache) return cache; cache = Store.lsGet(DEF_KEY, null); return cache; }

    async function init(defaults = {}) {
      const fromGM = await Store.get(DEF_KEY, {});
      cache = Object.assign({}, defaults, fromGM);
      await Store.set(DEF_KEY, cache);
      Store.lsSet(DEF_KEY, cache);
      console.log('[AO3H][flags] initialized', cache);
    }

    function getAll()                { return cache || _ensureLoaded() || {}; }
    function get(key, d = null)      { const all = getAll(); return (key in all) ? all[key] : d; }

    async function set(key, val) {
      const all  = getAll();
      const prev = all[key];
      if (prev === val) return val;
      all[key] = val;
      await Store.set(DEF_KEY, all);
      Store.lsSet(DEF_KEY, all);
      const set = watchers.get(key);
      if (set) for (const fn of set) try { fn(val); } catch (e) { console.error('[AO3H][flags] watcher', e); }
      return val;
    }

    function watch(key, fn) {
      if (!watchers.has(key)) watchers.set(key, new Set());
      watchers.get(key).add(fn);
      return () => watchers.get(key)?.delete(fn);
    }

    return { init, getAll, get, set, watch };
  })();

  // SETTINGS (per-module)
  const Settings = (() => {
    const KEY = (name) => `mod:${name}:settings`;
    const Defaults = new Map(); // name -> defaults object

    return {
      async define(name, defaults = {}) {
        Defaults.set(name, { ...defaults });
        let cur = await Store.get(KEY(name), null);

        if (!cur || typeof cur !== 'object') {
          cur = { ...defaults };
          await Store.set(KEY(name), cur);
          Store.lsSet(KEY(name), cur);
          try { Bus.emit('settings:changed', { module: name, value: cur }); } catch {}
          return cur;
        }

        // Merge newly-added defaults
        let changed = false;
        for (const [k, v] of Object.entries(defaults)) {
          if (!(k in cur)) { cur[k] = v; changed = true; }
        }
        if (changed) {
          await Store.set(KEY(name), cur);
          Store.lsSet(KEY(name), cur);
          try { Bus.emit('settings:changed', { module: name, value: cur }); } catch {}
        }
        return cur;
      },

      async get(name) {
        const gm = await Store.get(KEY(name), null);
        if (gm && typeof gm === 'object') {
          Store.lsSet(KEY(name), gm);
          return gm;
        }
        return { ...(Defaults.get(name) || {}) };
      },

      async set(name, patch = {}) {
        const cur = await this.get(name);
        const next = Object.assign({}, cur, patch);
        await Store.set(KEY(name), next);
        Store.lsSet(KEY(name), next);
        try { Bus.emit('settings:changed', { module: name, value: next }); } catch {}
        return next;
      },

      async reset(name) {
        await Store.del(KEY(name));
        Store.lsDel(KEY(name));
        const def = Defaults.get(name) || {};
        await Store.set(KEY(name), { ...def });
        Store.lsSet(KEY(name), { ...def });
        try { Bus.emit('settings:changed', { module: name, value: { ...def } }); } catch {}
        return { ...def };
      },

      watch(name, fn) {
        const cb = (evt) => { if (evt && evt.module === name) { try { fn(evt.value); } catch (e) { console.error(e); } } };
        Bus.on('settings:changed', cb);
        return () => Bus.off('settings:changed', cb);
      },
    };
  })();

  // Préparer l'espace 'menu' et la clé 'submenuState'
(function(){
  const s = AO3H.store?.ns && AO3H.store.ns('menu');
  if (s && s.get('submenuState') == null) s.set('submenuState', {});
})();

  // Expose
  AO3H.store    = AO3H.store    || Store;
  AO3H.flags    = AO3H.flags    || Flags;
  AO3H.settings = AO3H.settings || Settings;
})();
