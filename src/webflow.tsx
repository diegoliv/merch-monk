import React from "react";
import ReactDOM from "react-dom/client";
import { ExperienceRuntimeProvider } from "./experienceRuntime";
import { WebflowExperience } from "./WebflowExperience";
import { getScrollRuntime } from "./three/scrollRuntime";
import "./webflow.css";
import type { ProductCupColorKey } from "./components/StorySections";
import type { __UNSTABLE_Project_OnDiskState } from "@theatre/core";

export type MerchMonkReadyDetail = {
  canvasElement: HTMLElement;
  pageElement: HTMLElement | null;
  readyAt: number;
};

type MerchMonkWebflowConfig = {
  canvasSelector?: string;
  pageSelector?: string;
  preferLocal?: boolean;
  localOrigin?: string;
  localEntry?: string;
  localTimeoutMs?: number;
  productionBaseUrl?: string;
  productionEntry?: string;
  productionCss?: string;
  runtimeSource?: "local-loading" | "local" | "local-error" | "local-state-error" | "production";
  productColor?: ProductCupColorKey;
  modelUrl?: string;
  theatreState?: __UNSTABLE_Project_OnDiskState;
  theatreStateUrl?: string;
  theatreStateTimeoutMs?: number;
  stateSource?: "bundled" | "bundled-fallback" | "external" | "inline" | "local-preview" | "local-preview-error";
  localStateSavedAt?: string;
  editor?: boolean;
  onReady?: (detail: MerchMonkReadyDetail) => void;
};

declare global {
  interface Window {
    MerchMonkWebflow?: MerchMonkWebflowConfig;
  }

  interface WindowEventMap {
    "merch-monk:ready": CustomEvent<MerchMonkReadyDetail>;
  }
}

function mountWebflowExperience() {
  getScrollRuntime();
  const config = window.MerchMonkWebflow ?? {};
  const canvasSelector = config.canvasSelector ?? ".canvas-layer_middle";
  const pageSelector = config.pageSelector ?? ".page-wrapper";
  const canvasElement = document.querySelector<HTMLElement>(canvasSelector);
  const pageElement = document.querySelector<HTMLElement>(pageSelector);

  if (!canvasElement) {
    console.warn(`[Merch Monk] Canvas mount target not found: ${canvasSelector}`);
    return;
  }

  const canvasHost = canvasElement;
  canvasHost.classList.add("merch-monk-canvas-host");

  const root = ReactDOM.createRoot(canvasHost);
  const runtime = {
    mode: "webflow" as const,
    canvasElement: canvasHost,
    pageElement,
    previewScrollerSelector: `${pageSelector}.merch-monk-previewing`,
  };
  let hasSignalledReady = false;

  function handleSceneReady() {
    if (hasSignalledReady) return;
    hasSignalledReady = true;

    const detail: MerchMonkReadyDetail = {
      canvasElement: canvasHost,
      pageElement,
      readyAt: performance.now(),
    };
    canvasHost.classList.add("is-ready");
    canvasHost.dataset.merchMonkReady = "true";
    if (config.stateSource) canvasHost.dataset.merchMonkStateSource = config.stateSource;
    window.dispatchEvent(new CustomEvent("merch-monk:ready", { detail }));
    try {
      config.onReady?.(detail);
    } catch (error) {
      console.error("[Merch Monk] onReady callback failed.", error);
    }
  }

  root.render(
    <React.StrictMode>
      <ExperienceRuntimeProvider value={runtime}>
        <WebflowExperience
          runtime={runtime}
          productColor={config.productColor}
          showEditor={config.editor === true}
          onSceneReady={handleSceneReady}
        />
      </ExperienceRuntimeProvider>
    </React.StrictMode>,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountWebflowExperience, { once: true });
} else {
  mountWebflowExperience();
}
