(function () {
  var config = window.MerchMonkStudio || {};
  var localOrigin = (config.localOrigin || "http://localhost:5173").replace(/\/$/, "");
  var localEntry = config.localEntry || localOrigin + "/src/studio.tsx";
  var productionBase = (config.productionBaseUrl || "https://cdn.jsdelivr.net/gh/diegoliv/merch-monk@main/studio-dist/").replace(/\/$/, "") + "/";
  var productionEntry = config.productionEntry || productionBase + "merch-monk-studio.js";
  var productionCss = config.productionCss || productionBase + "studio.css";
  var preferLocal = config.preferLocal === true;
  var loaded = false;

  function ensureProcessEnv(mode) {
    window.process = window.process || {};
    window.process.env = window.process.env || {};
    window.process.env.NODE_ENV = window.process.env.NODE_ENV || mode;
    window.globalThis.process = window.process;
  }

  function appendCss(href) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function appendModule(src, onError) {
    var script = document.createElement("script");
    script.type = "module";
    script.src = src;
    script.onerror = onError;
    document.head.appendChild(script);
  }

  function appendInlineModule(source) {
    var script = document.createElement("script");
    script.type = "module";
    script.textContent = source;
    document.head.appendChild(script);
  }

  function loadProduction() {
    if (loaded) return;
    loaded = true;
    ensureProcessEnv("production");
    config.runtimeSource = "production";
    config.modelUrl = config.modelUrl || productionBase + "models/merch_monk_website.glb";
    window.MerchMonkStudio = config;
    appendCss(productionCss);
    appendModule(productionEntry, function (error) {
      console.error("[Merch Monk Studio] Could not load the production bundle.", error);
    });
  }

  function loadLocal() {
    ensureProcessEnv("development");
    config.runtimeSource = "local";
    config.modelUrl = config.modelUrl || localOrigin + "/models/merch_monk_website.glb";
    window.MerchMonkStudio = config;

    var callbackName = "__merchMonkStudioLocal_" + Date.now().toString(36);
    var refreshPreamble = [
      "import RefreshRuntime from " + JSON.stringify(localOrigin + "/@react-refresh") + ";",
      "RefreshRuntime.injectIntoGlobalHook(window);",
      "window.$RefreshReg$ = function () {};",
      "window.$RefreshSig$ = function () { return function (type) { return type; }; };",
      "window.__vite_plugin_react_preamble_installed__ = true;",
      "import " + JSON.stringify(localOrigin + "/@vite/client") + ";",
      "import(" + JSON.stringify(localEntry) + ")",
      "  .then(function () { window[" + JSON.stringify(callbackName) + "](); })",
      "  .catch(function (error) { window[" + JSON.stringify(callbackName) + "](error); });",
    ].join("\n");

    window[callbackName] = function (error) {
      delete window[callbackName];
      if (error) {
        console.error("[Merch Monk Studio] Local runtime failed; loading production.", error);
        loaded = false;
        loadProduction();
        return;
      }
      loaded = true;
    };

    appendInlineModule(refreshPreamble);
  }

  window.MerchMonkStudio = config;
  if (preferLocal) loadLocal();
  else loadProduction();
})();
