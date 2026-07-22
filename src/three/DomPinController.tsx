import { useEffect, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { resolveResponsiveDataElement } from "./domBindings";
import { renderObjectIds } from "./sceneObjects";
import type { Breakpoint, ObjectId, Vec3, ViewportInfo } from "./types";

export type DomPinState = {
  element: HTMLElement;
  worldPosition: Vec3;
  active: boolean;
};

export type DomPinMap = Partial<Record<ObjectId, DomPinState>>;

type DomPinControllerProps = {
  root: Document | HTMLElement;
  breakpoint: Breakpoint;
  viewport: ViewportInfo;
  pinsRef: MutableRefObject<DomPinMap>;
};

export function DomPinController({ root, breakpoint, viewport, pinsRef }: DomPinControllerProps) {
  const { gl } = useThree();
  const rescanFrameRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    const observerTarget = root instanceof Document ? root.documentElement : root;

    function rescan() {
      if (disposed) return;

      const previous = pinsRef.current;
      const next: DomPinMap = {};

      renderObjectIds.forEach((id) => {
        const element = resolveResponsiveDataElement({
          root,
          valueAttribute: "data-3d-pin",
          breakpointAttribute: "data-3d-pin-breakpoint",
          value: id,
          breakpoint,
          label: "3D pin for object \"" + id + "\"",
        });
        if (!element) return;

        next[id] = previous[id]?.element === element
          ? previous[id]
          : {
            element,
            worldPosition: [0, 0, 0],
            active: false,
          };
      });

      pinsRef.current = next;
    }

    function scheduleRescan() {
      cancelAnimationFrame(rescanFrameRef.current);
      rescanFrameRef.current = requestAnimationFrame(rescan);
    }

    const mutationObserver = typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(scheduleRescan);

    mutationObserver?.observe(observerTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-3d-pin", "data-3d-pin-breakpoint"],
    });

    rescan();

    void document.fonts?.ready.then(() => {
      if (!disposed) scheduleRescan();
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(rescanFrameRef.current);
      mutationObserver?.disconnect();
      pinsRef.current = {};
    };
  }, [breakpoint, gl.domElement, pinsRef, root]);

  useFrame(() => {
    const canvasRect = gl.domElement.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return;

    renderObjectIds.forEach((id) => {
      const pin = pinsRef.current[id];
      if (!pin) return;

      const rect = pin.element.getBoundingClientRect();
      const style = window.getComputedStyle(pin.element);
      const active = (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );

      pin.active = active;
      if (!active) return;

      const centerX = rect.left + rect.width * 0.5 - canvasRect.left;
      const centerY = rect.top + rect.height * 0.5 - canvasRect.top;
      pin.worldPosition[0] = (centerX / canvasRect.width - 0.5) * viewport.worldWidth;
      pin.worldPosition[1] = (0.5 - centerY / canvasRect.height) * viewport.worldHeight;
      pin.worldPosition[2] = 0;
    });
  }, -100);

  return null;
}
