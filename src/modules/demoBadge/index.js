// src/modules/demoBadge/index.js
(function () {
  "use strict";
  const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  const AO3H = (W.AO3H = W.AO3H || {});
  const { onReady, ensureStyle } = AO3H.kit || {};

  AO3H.modules.register(
    "DemoBadge",
    { title: "Demo Badge", enabledByDefault: true },
    () => {
      let host = null;

      return {
        init() {
          console.log("[DemoBadge] init");

          ensureStyle?.(
            "ao3h-demo-style",
            `
            #ao3h-demo-badge{
              position:fixed; top:12px; right:12px; z-index:999999;
              font:12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
              padding:6px 10px; border-radius:12px;
              background:rgba(16,16,16,.85); color:#fff;
              box-shadow:0 6px 18px rgba(0,0,0,.25);
              backdrop-filter: saturate(1.2) blur(3px);
            }
            #ao3h-demo-badge b{ font-weight:600 }
            `
          );

          onReady?.(() => {
            if (document.getElementById("ao3h-demo-badge")) return;
            host = document.createElement("div");
            host.id = "ao3h-demo-badge";
            host.textContent = "AO3H Demo v2 ✓";
            (document.body || document.documentElement).appendChild(host);
            console.log("[DemoBadge] badge mounted");
          });
        },
        dispose() {
          if (host) {
            host.remove();
            host = null;
            console.log("[DemoBadge] disposed");
          }
        }
      };
    }
  );
})();
