import React from "react";
import ReactDOM from "react-dom/client";
import { ExperienceRuntimeProvider } from "./experienceRuntime";
import { WebflowExperience } from "./WebflowExperience";
import { getScrollRuntime } from "./three/scrollRuntime";
import "./webflow.css";
import type { ProductCupColorKey } from "./components/StorySections";

type MerchMonkWebflowConfig = {
  canvasSelector?: string;
  pageSelector?: string;
  preferLocal?: boolean;
  productColor?: ProductCupColorKey;
  modelUrl?: string;
  editor?: boolean;
};

declare global {
  interface Window {
    MerchMonkWebflow?: MerchMonkWebflowConfig;
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

  canvasElement.classList.add("merch-monk-canvas-host");

  const root = ReactDOM.createRoot(canvasElement);
  const runtime = {
    mode: "webflow" as const,
    canvasElement,
    pageElement,
    previewScrollerSelector: `${pageSelector}.merch-monk-previewing`,
  };

  root.render(
    <React.StrictMode>
      <ExperienceRuntimeProvider value={runtime}>
        <WebflowExperience runtime={runtime} productColor={config.productColor} showEditor={config.editor === true} />
      </ExperienceRuntimeProvider>
    </React.StrictMode>,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountWebflowExperience, { once: true });
} else {
  mountWebflowExperience();
}
