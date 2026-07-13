(function () {
  var config = window.MerchMonkWebflow || {};
  var localOrigin = config.localOrigin || "http://localhost:5173";
  var normalizedLocalOrigin = localOrigin.replace(/\/$/, "");
  var localEntry = config.localEntry || normalizedLocalOrigin + "/src/webflow.tsx";
  var productionBase = config.productionBaseUrl || "https://cdn.jsdelivr.net/gh/diegoliv/merch-monk@main/webflow-dist/";
  var normalizedProductionBase = productionBase.replace(/\/$/, "") + "/";
  var productionEntry = config.productionEntry || normalizedProductionBase + "merch-monk-webflow.js";
  var productionCss = config.productionCss || normalizedProductionBase + "style.css";
  var localTimeoutMs = config.localTimeoutMs || 2500;
  var editorRequested = new URLSearchParams(window.location.search).get("editor") === "true";
  var preferLocal = editorRequested || config.preferLocal === true;
  var loaded = false;
  var productionLoading = false;
  var localFallbackTimer = null;
  var hasCustomEditor = typeof config.editor === "boolean";
  var hasCustomModelUrl = Boolean(config.modelUrl);

  function ensureProcessEnv(mode) {
    window.process = window.process || {};
    window.process.env = window.process.env || {};
    window.process.env.NODE_ENV = window.process.env.NODE_ENV || mode;
    window.globalThis.process = window.process;
  }

  if (editorRequested) config.editor = true;
  else if (!hasCustomEditor) config.editor = false;
  if (!hasCustomModelUrl) {
    config.modelUrl = preferLocal
      ? normalizedLocalOrigin + "/models/merch_monk_website.glb"
      : normalizedProductionBase + "models/merch_monk_website.glb";
  }
  window.MerchMonkWebflow = config;
  ensureProcessEnv("development");

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

  function appendInlineModule(source) {
    var script = document.createElement("script");
    script.type = "module";
    script.textContent = source;
    document.head.appendChild(script);
    return script;
  }

  function isValidTheatreState(state) {
    return Boolean(
      state &&
      typeof state === "object" &&
      typeof state.definitionVersion === "string" &&
      state.sheetsById &&
      typeof state.sheetsById === "object"
    );
  }

  function loadProduction() {
    if (loaded || productionLoading) return;
    productionLoading = true;
    ensureProcessEnv("production");
    if (!hasCustomEditor) config.editor = editorRequested;
    if (!hasCustomModelUrl) config.modelUrl = normalizedProductionBase + "models/merch_monk_website.glb";
    appendCss(productionCss);

    if (config.theatreState && !isValidTheatreState(config.theatreState)) {
      console.warn("[Merch Monk] Invalid inline Theatre state. Using URL or bundled fallback.");
      delete config.theatreState;
    }

    function startProductionModule() {
      productionLoading = false;
      if (loaded) return;
      loaded = true;
      config.runtimeSource = "production";
      appendModule(productionEntry);
    }

    if (config.theatreState || !config.theatreStateUrl) {
      startProductionModule();
      return;
    }

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeoutId = window.setTimeout(function () {
      if (controller) controller.abort();
    }, config.theatreStateTimeoutMs || 6000);

    fetch(config.theatreStateUrl, {
      cache: "no-store",
      signal: controller ? controller.signal : undefined,
    })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (state) {
        if (!isValidTheatreState(state)) throw new Error("Invalid Theatre state JSON");
        config.theatreState = state;
      })
      .catch(function (error) {
        console.warn("[Merch Monk] Could not load external Theatre state. Using bundled fallback.", error);
      })
      .then(function () {
        window.clearTimeout(timeoutId);
        startProductionModule();
      });
  }

  function loadLocal() {
    var callbackName = "__merchMonkLocalLoad_" + Date.now().toString(36);
    var localEntryUrl = JSON.stringify(localEntry);
    var refreshRuntimeUrl = JSON.stringify(normalizedLocalOrigin + "/@react-refresh");
    var viteClientUrl = JSON.stringify(normalizedLocalOrigin + "/@vite/client");

    window[callbackName] = function (error) {
      delete window[callbackName];

      if (error) {
        config.runtimeSource = "local-error";
        console.error(
          "[Merch Monk] Local editor load failed. Make sure the Vite server is running at " + normalizedLocalOrigin + ".",
          error,
        );
        window.dispatchEvent(new CustomEvent("merch-monk:local-error", { detail: { error: error, origin: normalizedLocalOrigin } }));
        if (!editorRequested) loadProduction();
        return;
      }

      if (loaded || productionLoading) return;
      if (localFallbackTimer) window.clearTimeout(localFallbackTimer);
      loaded = true;
      config.runtimeSource = "local";
      console.info("[Merch Monk] Loaded local editor runtime from " + normalizedLocalOrigin + ".");
    };

    var refreshPreamble = [
      "import RefreshRuntime from " + refreshRuntimeUrl + ";",
      'RefreshRuntime.injectIntoGlobalHook(window);',
      'window.$RefreshReg$ = function () {};',
      'window.$RefreshSig$ = function () { return function (type) { return type; }; };',
      'window.__vite_plugin_react_preamble_installed__ = true;',
      "import " + viteClientUrl + ";",
      "import(" + localEntryUrl + ")",
      "  .then(function () { window[" + JSON.stringify(callbackName) + "](); })",
      "  .catch(function (error) { window[" + JSON.stringify(callbackName) + "](error); });",
    ].join("\n");

    config.runtimeSource = "local-loading";
    appendInlineModule(refreshPreamble);
  }

  if (preferLocal) {
    if (!editorRequested) {
      localFallbackTimer = window.setTimeout(function () {
        if (!loaded) loadProduction();
      }, localTimeoutMs);
    }
    loadLocal();
  } else {
    loadProduction();
  }
})();