// src/runtime/routes.js
;(function () {
  'use strict';

  // Window + AO3H global
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H = W.AO3H || {};

  // ——— helpers de base
  function href() { return location.href; }
  function path() { return location.pathname; }
  function search() { return location.search || ''; }

  // ——— routes AO3
  function isWork()        { return /^\/works\/\d+(?:\/chapters\/\d+)?$/.test(path()); }
  function isWorkShow()    { return /^\/works\/\d+$/.test(path()); }
  function isChapter()     { return /^\/works\/\d+\/chapters\/\d+$/.test(path()); }
  function isTagWorks()    { return /^\/tags\/[^/]+\/works/.test(path()); }
  function isBookmarks()   { return /^\/users\/[^/]+\/bookmarks/.test(path()); }
  function isKudosHistory(){ return /^\/users\/[^/]+\/kudos-history(?:\/|$)/.test(path()); }

  function isSearch() {
    if (!/^\/works$/.test(path())) return false;
    const q = new URLSearchParams(search());
    return q.has('work_search[query]') || search().includes('tag_id');
  }

  // ——— compat héritée (certains anciens modules lisent ce drapeau)
  try {
    W.__AO3H_ROUTE_FLAGS__ = W.__AO3H_ROUTE_FLAGS__ || {};
    W.__AO3H_ROUTE_FLAGS__.isKudosHistory = !!isKudosHistory();
    if (W.__AO3H_ROUTE_FLAGS__.isKudosHistory) {
      console.log('[AO3H][routes] Kudos History detected — modules should self-guard.');
    }
  } catch (e) {
    console.warn('[AO3H][routes] route flag init failed:', e);
  }

  // ——— expose sur AO3H.routes (utilisé par core ET par menu.js)
  AO3H.routes = Object.assign(AO3H.routes || {}, {
    href, path, search,
    isWork, isWorkShow, isChapter,
    isTagWorks, isSearch, isBookmarks,
    isKudosHistory,
  });

  // Petit alias facultatif pour débogage (lisible en console)
  W.AO3H_ROUTES = AO3H.routes;

})();
