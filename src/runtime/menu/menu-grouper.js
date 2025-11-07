// AO3H • Menu Grouper (compact orchestrator, safe AO3H bootstrap, Manage pinned last)
;(function(){
  'use strict';

  // ── Safe globals
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H = W.AO3H || {};
  const onReady = (fn)=> (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', fn, { once:true })
    : fn();

  // ── NS & utils
  const NS  = (AO3H.env && AO3H.env.NS) || 'ao3h';
  const lc  = s => String(s||'').toLowerCase();

  // ── Modèle des groupes
  const GROUPS = [
    { label: 'Reading',
      include: ['saveScroll','chapterWordCount','readingStats','readingTime','progressBar','readingProgress','tweakFormatting','autoScroll','jumpToPage'],
      match: /(scroll|chapter\s*word|read|progress|time|page|format)/i },
    { label: 'Search',
      include: ['autoSearchFilters'],
      match: /(search|filter)/i },
    { label: 'Hiding / Filtering',
      include: ['hideByTags','hideFanficWithNotes','hideWordCount','hideDates'],
      match: /(hide|block|filter|mute)/i },
    { label: 'Glossary',
      include: ['inlineGlossary','autoHideGlossary'],
      match: /(glossary|define|inline|auto)/i },
    { label: 'Bookmarks & Status',
      include: ['bookmarkStatus','markForLaterStatus'],
      match: /(bookmark|mark|later|status)/i },
    { label: 'Engagement',
      include: ['kudosHitRatio','checkForKudos'],
      match: /(kudos|ratio|like|engagement)/i },
    { label: 'Layout & UI',
      include: ['cleanLayout','textReplacer', 'demoBadge'],
      match: /(layout|ui|font|size|wrap|dropdown|actions)/i },
  ];

  function decideGroup(mod){
    const name  = mod?.name || '';
    const title = mod?.meta?.title || name;
    if (mod?.meta?.group) {
      const g = GROUPS.find(G => lc(G.label) === lc(mod.meta.group));
      if (g) return g.label;
    }
    for (const g of GROUPS) {
      if (g.include && g.include.map(lc).includes(lc(name))) return g.label;
      if (g.match && (g.match.test(title) || g.match.test(name))) return g.label;
    }
    return null;
  }

  // ── Sélecteurs & helpers DOM
  const SEL = {
    rootLI:        `li.${NS}-root`,
    navlink:       `.${NS}-navlink`,
    menuUL:        `ul.${NS}-menu`,
    topLevelA:     `ul.${NS}-menu > li > a`,
    submenuUL:     `ul.${NS}-submenu, ul.ao3h-submenu`,
  };

  function clearPrevious(menuUL){
    menuUL.querySelectorAll(`li[data-ao3h-submenu="1"]`).forEach(li => {
      const prev = li.previousElementSibling;
      if (prev && prev.classList.contains(`${NS}-divider`) && prev.getAttribute('data-ao3h-submenu') === '1') prev.remove();
      li.remove();
    });
    let originals = [];
    try {
      originals = menuUL.querySelectorAll(`:scope > li[data-ao3h-grouped-original="1"]`);
    } catch {
      originals = Array.from(menuUL.children).filter(el => el.matches(`li[data-ao3h-grouped-original="1"]`));
    }
    originals.forEach(li => li.removeAttribute('data-ao3h-grouped-original'));
  }

  const isToggle = (a)=> a && a.matches('[data-flag]');
  function collectFollowingModuleRows(startLI){
    const rows = [];
    let cur = startLI.nextElementSibling;
    while (cur) {
      const a = cur.querySelector(':scope > a');
      if (!a) break;
      if (isToggle(a)) break;
      if (cur.classList.contains(`${NS}-manage-tail`) || cur.classList.contains(`${NS}-manage-sep`)) break;
      rows.push(cur);
      cur = cur.nextElementSibling;
    }
    return rows;
  }

  function ensureGroup(menuUL, label){
    if (!AO3H._menuGroups) AO3H._menuGroups = new Map();
    if (AO3H._menuGroups.has(label)) return AO3H._menuGroups.get(label);

    const make = AO3H.ui?.buildSubmenu
      ? AO3H.ui.buildSubmenu
      : (lbl)=> {
          // Fallback minimal (rare)
          const li  = document.createElement('li');
          li.setAttribute('data-ao3h-submenu','1');
          const a   = document.createElement('a');
          a.href = '#';
          a.innerHTML = `<span class="${NS}-label">${lbl}</span><span class="${NS}-caret ao3h-caret">▾</span>`;
          a.setAttribute('aria-haspopup','true');
          a.setAttribute('aria-expanded','false');
          const ul  = document.createElement('ul');
          ul.className = `menu dropdown-menu ${NS}-submenu ao3h-submenu`;
          ul.setAttribute('role','menu');
          const setOpen = (next) => {
            ul.classList.toggle('open', !!next);
            a.setAttribute('aria-expanded', String(!!next));
          };
          const toggle = (force)=>{
            const open = ul.classList.contains('open');
            setOpen(typeof force === 'boolean' ? force : !open);
          };
          a.addEventListener('click', (e)=>{ e.preventDefault(); toggle(); });
          li.append(a, ul);
          li.__ao3hSetOpen = setOpen;
          return { li, ul, header:a, setOpen, toggle };
        };

    const { li, ul, toggle, header } = make(label, { ns: NS });

    const divider = document.createElement('li');
    divider.className = `${NS}-divider`;
    divider.setAttribute('data-ao3h-submenu','1');
    menuUL.appendChild(divider);
    menuUL.appendChild(li);

    const rec = { li, ul, toggle, header };
    AO3H._menuGroups.set(label, rec);
    return rec;
  }

  // ── Manage en dernier (robuste + observer)
  const MANAGE_LABELS = ['Manage','Gestion','Gérer'];

  function getSubmenuLabel(li){
    const lab = li.querySelector(`a[aria-haspopup="true"] .${NS}-label`);
    return (lab?.textContent || '').trim();
  }
  function isManageLi(li){
    if (!li || li.tagName !== 'LI') return false;
    if (li.classList.contains(`${NS}-manage`) || li.hasAttribute('data-role') && li.getAttribute('data-role') === 'manage') return true;
    const label = getSubmenuLabel(li);
    return !!label && MANAGE_LABELS.some(x => lc(x) === lc(label));
  }
  function findManageLi(menuUL){
    // d’abord nos sous-menus
    const subs = menuUL.querySelectorAll(`li[data-ao3h-submenu="1"]`);
    for (const li of subs){
      if (isManageLi(li)) return li;
    }
    // sinon, n’importe quel LI marqué manage
    return Array.from(menuUL.children).find(isManageLi) || null;
  }
  function moveManageToEnd(menuUL){
    const manage = findManageLi(menuUL);
    if (!manage) return;

    // si déjà le dernier enfant, on ne fait rien
    if (manage === menuUL.lastElementChild) return;

    // transporter un divider grouper immédiatement avant (pour garder l’esthétique)
    const prev = manage.previousElementSibling;
    const carryDivider = prev &&
      prev.tagName === 'LI' &&
      prev.classList.contains(`${NS}-divider`) &&
      prev.getAttribute('data-ao3h-submenu') === '1';

    if (carryDivider) menuUL.appendChild(prev);
    menuUL.appendChild(manage);
  }

  let manageObserver = null;
  function startManageObserver(menuUL){
    if (manageObserver) manageObserver.disconnect();
    // Debounce simple : regrouper plusieurs mutations
    let scheduled = false;
    manageObserver = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        moveManageToEnd(menuUL);
      }, 0);
    });
    manageObserver.observe(menuUL, { childList: true }); // pas besoin de subtree
  }

  function buildOnce(){
    const menuUL = document.querySelector(SEL.menuUL);
    if (!menuUL) return;

    const topAs = Array.from(document.querySelectorAll(SEL.topLevelA));
    if (!topAs.length) return;

    clearPrevious(menuUL);
    AO3H._menuGroups = new Map();

    // flag -> module
    const mods = (AO3H.modules?.all?.() ?? []);
    const byFlag = new Map();
    for (const m of mods) {
      if (m.enabledKey) byFlag.set(m.enabledKey, m);
      if (m.enabledKeyAlt && m.enabledKeyAlt !== m.enabledKey) byFlag.set(m.enabledKeyAlt, m);
    }

    // clone
    const topToggleAs = topAs.filter(a => a.matches('[data-flag]'));
    for (const a of topToggleAs){
      const li = a.closest('li');
      if (!li) continue;
      const mod = byFlag.get(a.dataset.flag);
      if (!mod) continue;

      const groupLabel = decideGroup(mod);
      if (!groupLabel) continue;

      const { ul } = ensureGroup(menuUL, groupLabel);

      ul.appendChild(li.cloneNode(true));
      li.setAttribute('data-ao3h-grouped-original', '1');

      const tails = collectFollowingModuleRows(li);
      for (const row of tails){
        ul.appendChild(row.cloneNode(true));
        row.setAttribute('data-ao3h-grouped-original', '1');
      }
    }

    // Toujours pousser "Manage" à la fin, puis observer les ajouts ultérieurs
    moveManageToEnd(menuUL);
    startManageObserver(menuUL);
  }

  // ── Sync états (flags + open/closed)
  function syncCloneStates(){
    const flags = AO3H?.flags;
    if (!flags) return;
    document.querySelectorAll(`${SEL.submenuUL} a[data-flag]`).forEach(a => {
      const on = !!flags.get(a.dataset.flag, false);
      a.setAttribute('aria-checked', String(on));
      a.classList.toggle(`${NS}-on`, on);
      a.classList.toggle('ao3h-on', on);
    });
  }

  function reapplySubmenuState(){
    document.querySelectorAll(`li[data-ao3h-submenu="1"]`).forEach(li => {
      const header = li.querySelector('a[aria-haspopup="true"]');
      const ul = li.querySelector(`.${NS}-submenu, .ao3h-submenu`);
      if (!header || !ul) return;
      const isOpen = header.getAttribute('aria-expanded') === 'true' || ul.classList.contains('open');
      ul.classList.toggle('open', isOpen);
      header.setAttribute('aria-expanded', String(isOpen));
    });
  }

  // ── Hooks + init (build à la première ouverture)
  let builtOnceFlag = false;
  function buildIfNeeded(){
    if (builtOnceFlag) return;
    builtOnceFlag = true;
    setTimeout(()=>{ buildOnce(); syncCloneStates(); reapplySubmenuState(); }, 0);
  }
  function reapplyOnOpen(){ setTimeout(reapplySubmenuState, 0); }

  function hookOpenOnce(){
    const root = document.querySelector(SEL.rootLI);
    if (!root || root.__ao3hOpenGroupOnce) return;
    root.addEventListener('mouseenter', buildIfNeeded, { passive:true });
    root.addEventListener('focusin',    buildIfNeeded);
    root.querySelector(SEL.navlink)?.addEventListener('click', buildIfNeeded);
    root.addEventListener('mouseenter', reapplyOnOpen, { passive:true });
    root.addEventListener('focusin',    reapplyOnOpen);
    root.__ao3hOpenGroupOnce = true;
  }

  function hookMenuRebuild(){
    const api = AO3H?.menu;
    if (api && typeof api.rebuild === 'function' && !api.__ao3hGroupPatch){
      const orig = api.rebuild.bind(api);
      api.rebuild = function(){
        const r = orig();
        builtOnceFlag = false;
        const root = document.querySelector(SEL.rootLI);
        if (root && root.classList.contains('open')) {
          setTimeout(()=>{ buildOnce(); syncCloneStates(); reapplySubmenuState(); }, 0);
        }
        return r;
      };
      api.__ao3hGroupPatch = true;
    }
  }

  function hookFlagSync(){
    document.addEventListener(`${NS}:flags-updated`, () => {
      setTimeout(syncCloneStates, 0);
    });
  }

  // Attend que AO3H *et* le menu soient prêts
  function waitFor(cond, next){
    if (cond()) next(); else setTimeout(()=>waitFor(cond, next), 50);
  }

  function init(){
    waitFor(
      ()=> !!(AO3H && (AO3H.modules?.all || document.querySelector(SEL.menuUL))),
      ()=>{
        waitFor(()=> !!document.querySelector(SEL.menuUL), ()=>{
          hookOpenOnce();
          hookMenuRebuild();
          hookFlagSync();
        });
      }
    );
  }

  // Bootstrap
  onReady(init);
})();
