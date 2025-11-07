// src/runtime/bus.js
;(function () {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H = W.AO3H || {};

  // Namespace pour les CustomEvent DOM (pont de compat)
  const NS = (AO3H.env && AO3H.env.NS) || 'ao3h';

  // Table des listeners (événements "internes" du bus)
  const map = new Map();

  // Catalogue d’événements conseillés (utilisé par menu.js et ailleurs)
  const EVENTS = Object.freeze({
    FLAGS_UPDATED: 'flags-updated',
    OPEN_HIDE_MANAGER: 'open-hide-manager',
    OPEN_TEXTREPLACER_MANAGER: 'open-textreplacer-manager',
    OPEN_HIDDEN_WORKS_IE: 'open-hidden-works-ie',
  });

  // --- API standard (identique à ta version existante) ---
  function on(evt, fn) {
    if (!map.has(evt)) map.set(evt, new Set());
    map.get(evt).add(fn);
  }

  function off(evt, fn) {
    const set = map.get(evt);
    if (set) set.delete(fn);
  }

  // Émet sur le bus ET relaye en CustomEvent DOM `${NS}:${evt}` (compat)
  function emit(evt, detail) {
    // 1) Listeners internes
    const set = map.get(evt);
    if (set) {
      for (const fn of set) {
        try { fn(detail); } catch (e) { console.error('[AO3H][bus] handler error', e); }
      }
    }
    // 2) Relais DOM (évite l’écho via __fromBus)
    try {
      const payload = (detail && typeof detail === 'object')
        ? Object.assign({ __fromBus: true }, detail)
        : { value: detail, __fromBus: true };
      const ev = new CustomEvent(`${NS}:${evt}`, { detail: payload, bubbles: false, cancelable: false });
      (document || W.document).dispatchEvent(ev);
    } catch (e) {
      // En contextes très restreints, CustomEvent peut échouer: on ignore.
    }
  }

  // --- Pont d’entrée DOM → bus (compat modules historiques) ---
  // Si un ancien module fait: document.dispatchEvent(new CustomEvent(`${NS}:flags-updated`, {detail:...}))
  // alors on ré-émets sur le bus interne (sans boucle grâce à __fromBus).
  try {
    (document || W.document).addEventListener(`${NS}:*`, function noop(){}, { once: true });
  } catch (_) { /* certains environnements ne supportent pas le wildcard */ }

  // On enregistre explicitement les quelques événements connus.
  // Tu peux en ajouter d’autres ici si nécessaire.
  const knownDomEvents = new Set(Object.values(EVENTS));

  knownDomEvents.forEach((name) => {
    try {
      (document || W.document).addEventListener(`${NS}:${name}`, (e) => {
        const d = e && e.detail;
        if (d && d.__fromBus) return; // déjà émis par le bus; éviter la boucle
        // Ré-émets sur le bus interne pour unifier la consommation
        const set = map.get(name);
        if (set) {
          for (const fn of set) {
            try { fn(d); } catch (err) { console.error('[AO3H][bus dom→bus] handler error', err); }
          }
        }
      });
    } catch (e) {
      // Environnements sans addEventListener dispo: silencieux.
    }
  });

  // Expose global (merge pour ne rien casser)
  AO3H.bus = Object.assign(AO3H.bus || {}, { on, off, emit, EVENTS });

})();
