(function () {
  var config = window.MerchMonkWebflow || {};
  var localOrigin = config.localOrigin || "http://localhost:5173";
  var normalizedLocalOrigin = localOrigin.replace(/\/$/, "");
  var localEntry = config.localEntry || normalizedLocalOrigin + "/src/webflow.tsx";
  var productionBase = config.productionBaseUrl || "https://cdn.jsdelivr.net/gh/diegoliv/merch-monk@main/webflow-dist/";
  var normalizedProductionBase = productionBase.replace(/\/$/, "") + "/";
  var productionEntry = config.productionEntry || normalizedProductionBase + "merch-monk-webflow.js";
  var productionCss = config.productionCss || normalizedProductionBase + "style.css";
  var timeoutMs = config.localTimeoutMs || 1200;
  var loaded = false;
  var hasCustomEditor = typeof config.editor === "boolean";
  var hasCustomModelUrl = Boolean(config.modelUrl);

  if (!hasCustomEditor) config.editor = true;
  if (!hasCustomModelUrl) config.modelUrl = normalizedLocalOrigin + "/models/merch_monk_website.glb";
  window.MerchMonkWebflow = config;

  function appendCss(href) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function appendModule(src, onLoad, onError) {
    var script = document.createElement("script");
    script.type = "module";
    script.src = src;
    script.onload = onLoad;
    script.onerror = onError;
    document.head.appendChild(script);
    return script;
  }

  function appendInlineModule(source, onLoad, onError) {
    var script = document.createElement("script");
    script.type = "module";
    script.textContent = source;
    script.onload = onLoad;
    script.onerror = onError;
    document.head.appendChild(script);
    return script;
  }

  function loadProduction() {
    if (loaded) return;
    loaded = true;
    if (!hasCustomEditor) config.editor = false;
    if (!hasCustomModelUrl) config.modelUrl = normalizedProductionBase + "models/merch_monk_website.glb";
    appendCss(productionCss);
    appendModule(productionEntry);
  }

  function loadLocal() {
    var refreshPreamble = [
      'import RefreshRuntime from "' + normalizedLocalOrigin + '/@react-refresh";',
      'RefreshRuntime.injectIntoGlobalHook(window);',
      'window.$RefreshReg$ = function () {};',
      'window.$RefreshSig$ = function () { return function (type) { return type; }; };',
      'window.__vite_plugin_react_preamble_installed__ = true;',
      'import "' + normalizedLocalOrigin + '/@vite/client";',
    ].join("\n");

    appendInlineModule(
      refreshPreamble,
      function () {
        appendModule(
          localEntry,
          function () {
            if (loaded) return;
            loaded = true;
            window.clearTimeout(timeout);
          },
          function () {
            window.clearTimeout(timeout);
            loadProduction();
          },
        );
      },
      function () {
        window.clearTimeout(timeout);
        loadProduction();
      },
    );
  }

  var timeout = window.setTimeout(loadProduction, timeoutMs);
  loadLocal();
})();
