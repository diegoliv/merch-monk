import { useEffect, useState } from "react";
import type { ViewportInfo } from "./types";
import { getBreakpoint, getWorldSize } from "./math";

function readViewport(): ViewportInfo {
  const width = window.innerWidth;
  const height = window.innerHeight;
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
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    function onResize() {
      setViewport(readViewport());
    }

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return viewport;
}
