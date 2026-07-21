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
  var searchParams = new URLSearchParams(window.location.search);
  var editorRequested = searchParams.get("editor") === "true";
  var localStatePreviewRequested = searchParams.get("mmState") === "local";
  var localStatePreviewKey = "merch-monk-theatre-preview-state";
  var theatreProjectId = "Merch Monk Scene Responsive";
  var preferLocal = !localStatePreviewRequested && (editorRequested || config.preferLocal === true);
  var loaded = false;
  var productionLoading = false;
  var localFallbackTimer = null;
  var localStatePreviewReady = !localStatePreviewRequested;
  var hasCustomEditor = typeof config.editor === "boolean";
  var hasCustomModelUrl = Boolean(config.modelUrl);

  function ensureProcessEnv(mode) {
    window.process = window.process || {};
    window.process.env = window.process.env || {};
    window.process.env.NODE_ENV = window.process.env.NODE_ENV || mode;
    window.globalThis.process = window.process;
  }

  if (localStatePreviewRequested) config.editor = false;
  else if (editorRequested) config.editor = true;
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

  function showLocalStatePreviewError(error) {
    var message = error instanceof Error ? error.message : String(error);
    config.runtimeSource = "local-state-error";
    config.stateSource = "local-preview-error";
    console.error("[Merch Monk] Local Theatre state preview failed. Production was not started.", error);
    document.documentElement.setAttribute("data-merch-monk-state-source", "local-preview-error");

    function appendNotice() {
      if (!document.body || document.querySelector("[data-merch-monk-local-state-error]")) return;
      var notice = document.createElement("div");
      notice.setAttribute("data-merch-monk-local-state-error", "true");
      notice.setAttribute("role", "alert");
      notice.style.cssText = "position:fixed;left:16px;right:16px;top:16px;z-index:2147483647;padding:12px 14px;border:1px solid #ff4a09;border-radius:8px;background:#17110f;color:#fff;font:600 13px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35)";
      notice.textContent = "Merch Monk local state preview unavailable: " + message;
      document.body.appendChild(notice);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", appendNotice, { once: true });
    else appendNotice();

    window.dispatchEvent(new CustomEvent("merch-monk:local-state-error", {
      detail: { error: error, storageKey: localStatePreviewKey },
    }));
  }

  function prepareLocalStatePreview() {
    if (!localStatePreviewRequested) return true;

    try {
      var serializedSnapshot = window.localStorage.getItem(localStatePreviewKey);
      if (!serializedSnapshot) throw new Error("No preview snapshot found. Return to the Theatre editor and click Preview in production.");

      var snapshot = JSON.parse(serializedSnapshot);
      if (!snapshot || snapshot.version !== 1 || snapshot.projectId !== theatreProjectId) {
        throw new Error("The saved preview snapshot is incompatible with this experience.");
      }
      if (!isValidTheatreState(snapshot.state)) throw new Error("The saved preview snapshot does not contain valid Theatre state.");

      config.theatreState = snapshot.state;
      delete config.theatreStateUrl;
      config.stateSource = "local-preview";
      config.localStateSavedAt = snapshot.savedAt;
      document.documentElement.setAttribute("data-merch-monk-state-source", "local-preview");
      console.info("[Merch Monk] Using local Theatre state snapshot from " + snapshot.savedAt + ".");
      return true;
    } catch (error) {
      showLocalStatePreviewError(error);
      return false;
    }
  }

  function loadProduction() {
    if (loaded || productionLoading) return;
    if (!localStatePreviewReady) return;
    productionLoading = true;
    ensureProcessEnv("production");
    if (localStatePreviewRequested) config.editor = false;
    else if (!hasCustomEditor) config.editor = editorRequested;
    if (!hasCustomModelUrl) config.modelUrl = normalizedProductionBase + "models/merch_monk_website.glb";
    appendCss(productionCss);

    if (config.theatreState && !isValidTheatreState(config.theatreState)) {
      console.warn("[Merch Monk] Invalid inline Theatre state. Using URL or bundled fallback.");
      delete config.theatreState;
    }

    if (!config.stateSource) {
      config.stateSource = config.theatreState
        ? "inline"
        : config.theatreStateUrl
          ? undefined
          : "bundled";
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
        config.stateSource = "external";
      })
      .catch(function (error) {
        config.stateSource = "bundled-fallback";
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

  localStatePreviewReady = prepareLocalStatePreview();

  if (!localStatePreviewReady) {
    return;
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
