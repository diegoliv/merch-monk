import { useEffect, useState } from "react";
import { useExperienceRuntime } from "../experienceRuntime";
import type { ViewportInfo } from "./types";
import { getBreakpoint } from "./breakpoints";
import { getWorldSize } from "./math";

function readViewport(element?: HTMLElement | null): ViewportInfo {
  const rect = element?.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect?.width || window.innerWidth));
  const height = Math.max(1, Math.round(element?.clientHeight || window.innerHeight));
  const { worldWidth, worldHeight } = getWorldSize(width, height);

  return {
    width,
    height,
    breakpoint: getBreakpoint(width),
    worldWidth,
    worldHeight,
  };
}

export function useViewportInfo() {
  const runtime = useExperienceRuntime();
  const element = runtime.mode === "webflow" ? runtime.pageElement : null;
  const [viewport, setViewport] = useState(() => readViewport(element));

  useEffect(() => {
    function updateViewport() {
      setViewport(readViewport(element));
    }

    updateViewport();
    window.addEventListener("resize", updateViewport);

    const observer = typeof ResizeObserver !== "undefined" && element ? new ResizeObserver(updateViewport) : null;
    if (observer && element) observer.observe(element);

    return () => {
      window.removeEventListener("resize", updateViewport);
      observer?.disconnect();
    };
  }, [element]);

  return viewport;
}
