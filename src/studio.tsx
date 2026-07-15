import React from "react";
import ReactDOM from "react-dom/client";
import { StudioApp } from "./studio/StudioApp";
import "./studio/studio.css";

export type MerchMonkStudioReadyDetail = {
  hostElement: HTMLElement;
  readyAt: number;
};

export type MerchMonkStudioConfig = {
  mountSelector?: string;
  modelUrl?: string;
  productionBaseUrl?: string;
  productionEntry?: string;
  productionCss?: string;
  localOrigin?: string;
  localEntry?: string;
  preferLocal?: boolean;
  runtimeSource?: "local" | "production";
  onReady?: (detail: MerchMonkStudioReadyDetail) => void;
};

declare global {
  interface Window {
    MerchMonkStudio?: MerchMonkStudioConfig;
  }

  interface WindowEventMap {
    "merch-monk-studio:ready": CustomEvent<MerchMonkStudioReadyDetail>;
  }
}

function mountStudio() {
  const config = window.MerchMonkStudio ?? {};
  const mountSelector = config.mountSelector ?? ".merch-monk-studio";
  const hostElement = document.querySelector<HTMLElement>(mountSelector);
  if (!hostElement) {
    console.warn(`[Merch Monk Studio] Mount target not found: ${mountSelector}`);
    return;
  }

  const host = hostElement;
  hostElement.classList.add("merch-monk-studio-host");
  const modelUrl = config.modelUrl ?? "/models/merch_monk_website.glb";
  let readySent = false;

  function handleReady() {
    if (readySent) return;
    readySent = true;
    const detail: MerchMonkStudioReadyDetail = {
      hostElement: host,
      readyAt: performance.now(),
    };
    host.classList.add("is-ready");
    host.dataset.merchMonkStudioReady = "true";
    window.dispatchEvent(new CustomEvent("merch-monk-studio:ready", { detail }));
    config.onReady?.(detail);
  }

  ReactDOM.createRoot(hostElement).render(
    <React.StrictMode>
      <StudioApp modelUrl={modelUrl} onReady={handleReady} />
    </React.StrictMode>,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountStudio, { once: true });
} else {
  mountStudio();
}
