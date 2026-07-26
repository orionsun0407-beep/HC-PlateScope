(() => {
  "use strict";

  const APP_VERSION = "2026-07-26-pdf-plot-preview";
  const scripts = [
    "app-core.js",
    "app-dashboard.js",
    "app-options.js",
    "app-init.js",
    "app-run.js",
  ];

  function loadScript(path) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${path}?v=${encodeURIComponent(APP_VERSION)}`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`加载失败：${path}`));
      document.body.appendChild(script);
    });
  }

  (async () => {
    for (const script of scripts) {
      await loadScript(script);
    }
  })().catch((err) => {
    console.error(err);
    const main = document.querySelector("main") || document.body;
    const div = document.createElement("div");
    div.className = "hc-info-card hc-error";
    div.textContent = err.message || String(err);
    main.prepend(div);
  });
})();
