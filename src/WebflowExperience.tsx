import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { breakpointPreviewRanges, breakpointPreviewSizes, resolveBreakpointMode } from "./three/breakpoints";
import { GlobalSceneCanvas } from "./three/GlobalSceneCanvas";
import { SceneEditor } from "./three/SceneEditor";
import { editorStore, useEditorStore } from "./three/editorStore";
import { productCupColors, type ProductCupColorKey } from "./components/StorySections";
import type { ExperienceRuntime } from "./experienceRuntime";
import type { Breakpoint } from "./three/types";

type WebflowExperienceProps = {
  runtime: ExperienceRuntime;
  productColor?: ProductCupColorKey;
  showEditor?: boolean;
};

type PreviewSize = {
  width: number;
  height: number;
};

type ResizeDirection = "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

const previewClass = "merch-monk-previewing";
const editorActiveClass = "merch-monk-editor-active";
const bodyEditorActiveClass = "merch-monk-webflow-editing";
const previewHeightRange = { minHeight: 360, maxHeight: 1800 };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getViewportSize() {
  return {
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight),
  };
}

function getPreviewRange(breakpoint: Breakpoint) {
  const viewport = getViewportSize();
  const widthRange = breakpointPreviewRanges[breakpoint];
  return {
    minWidth: widthRange.minWidth,
    maxWidth: breakpoint === "desktop" ? Math.max(widthRange.minWidth, viewport.width) : widthRange.maxWidth,
    minHeight: previewHeightRange.minHeight,
    maxHeight: Math.max(previewHeightRange.minHeight, Math.max(viewport.height, previewHeightRange.maxHeight)),
  };
}

function getInitialPreviewSize(breakpoint: Breakpoint): PreviewSize {
  if (breakpoint === "desktop") return getViewportSize();
  return breakpointPreviewSizes[breakpoint];
}

export function WebflowExperience({ runtime, productColor = "orange", showEditor = false }: WebflowExperienceProps) {
  const editor = useEditorStore();
  const activeColor = useMemo(
    () => productCupColors.find((color) => color.key === productColor) ?? productCupColors[0],
    [productColor],
  );
  const pageElement = runtime.pageElement;
  const activeBreakpoint = resolveBreakpointMode(editor.breakpointMode, "desktop");
  const isPreviewingBreakpoint = showEditor && editor.enabled;
  const [previewSize, setPreviewSize] = useState<PreviewSize>(() => getInitialPreviewSize(activeBreakpoint));

  useEffect(() => {
    if (editor.breakpointMode === "auto") {
      editorStore.setSelection({ breakpointMode: "desktop" });
    }
    if (!showEditor && editor.enabled) {
      editorStore.setSelection({ enabled: false });
    }
  }, [editor.breakpointMode, editor.enabled, showEditor]);

  useEffect(() => {
    if (!isPreviewingBreakpoint) return;
    setPreviewSize(getInitialPreviewSize(activeBreakpoint));
  }, [activeBreakpoint, isPreviewingBreakpoint]);

  useEffect(() => {
    document.body.classList.toggle(bodyEditorActiveClass, showEditor && editor.enabled);
    return () => document.body.classList.remove(bodyEditorActiveClass);
  }, [editor.enabled, showEditor]);

  useEffect(() => {
    if (!pageElement) return;

    const previousInline = pageElement.getAttribute("style");
    pageElement.classList.add("merch-monk-page");

    return () => {
      pageElement.classList.remove(
        "merch-monk-page",
        previewClass,
        editorActiveClass,
        "is-desktop-layout",
        "is-tablet-layout",
        "is-mobile-layout",
      );
      if (previousInline === null) {
        pageElement.removeAttribute("style");
      } else {
        pageElement.setAttribute("style", previousInline);
      }
    };
  }, [pageElement]);

  useEffect(() => {
    if (!pageElement) return;

    pageElement.classList.toggle(editorActiveClass, showEditor && editor.enabled);
    pageElement.classList.toggle(previewClass, isPreviewingBreakpoint);
    pageElement.classList.toggle("is-desktop-layout", isPreviewingBreakpoint && activeBreakpoint === "desktop");
    pageElement.classList.toggle("is-tablet-layout", isPreviewingBreakpoint && activeBreakpoint === "tablet");
    pageElement.classList.toggle("is-mobile-layout", isPreviewingBreakpoint && activeBreakpoint === "mobile");

    if (!isPreviewingBreakpoint) {
      pageElement.style.removeProperty("--preview-width");
      pageElement.style.removeProperty("--preview-height");
      pageElement.style.removeProperty("--preview-min-width");
      pageElement.style.removeProperty("--preview-max-width");
      pageElement.style.removeProperty("--preview-min-height");
      pageElement.style.removeProperty("--preview-max-height");
      pageElement.removeAttribute("data-lenis-prevent");
      return;
    }

    const previewRange = getPreviewRange(activeBreakpoint);
    pageElement.style.setProperty("--preview-width", `${previewSize.width}px`);
    pageElement.style.setProperty("--preview-height", `${previewSize.height}px`);
    pageElement.style.setProperty("--preview-min-width", `${previewRange.minWidth}px`);
    pageElement.style.setProperty("--preview-max-width", `${previewRange.maxWidth}px`);
    pageElement.style.setProperty("--preview-min-height", `${previewRange.minHeight}px`);
    pageElement.style.setProperty("--preview-max-height", `${previewRange.maxHeight}px`);
    pageElement.setAttribute("data-lenis-prevent", "");
  }, [activeBreakpoint, editor.enabled, isPreviewingBreakpoint, pageElement, previewSize.height, previewSize.width, showEditor]);

  const startResize = useCallback((direction: ResizeDirection, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = previewSize;
    const previewRange = getPreviewRange(activeBreakpoint);
    const horizontalSign = direction.includes("left") ? -1 : 1;
    const verticalSign = direction.includes("top") ? -1 : 1;
    const changesWidth = direction.includes("left") || direction.includes("right");
    const changesHeight = direction.includes("top") || direction.includes("bottom");

    function onPointerMove(moveEvent: PointerEvent) {
      const horizontalDelta = (moveEvent.clientX - startX) * horizontalSign * 2;
      const verticalDelta = (moveEvent.clientY - startY) * verticalSign;

      setPreviewSize({
        width: changesWidth ? clamp(startSize.width + horizontalDelta, previewRange.minWidth, previewRange.maxWidth) : startSize.width,
        height: changesHeight ? clamp(startSize.height + verticalDelta, previewRange.minHeight, previewRange.maxHeight) : startSize.height,
      });
    }

    function onPointerUp() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }, [activeBreakpoint, previewSize]);

  return (
    <>
      <GlobalSceneCanvas productCupColor={activeColor} />
      {isPreviewingBreakpoint ? (
        <div className="merch-monk-resize-handles" aria-hidden="true">
          <button className="merch-monk-resize-handle is-left" type="button" tabIndex={-1} onPointerDown={(event) => startResize("left", event)} />
          <button className="merch-monk-resize-handle is-right" type="button" tabIndex={-1} onPointerDown={(event) => startResize("right", event)} />
          <button className="merch-monk-resize-handle is-top" type="button" tabIndex={-1} onPointerDown={(event) => startResize("top", event)} />
          <button className="merch-monk-resize-handle is-bottom" type="button" tabIndex={-1} onPointerDown={(event) => startResize("bottom", event)} />
          <button className="merch-monk-resize-handle is-top-left" type="button" tabIndex={-1} onPointerDown={(event) => startResize("top-left", event)} />
          <button className="merch-monk-resize-handle is-top-right" type="button" tabIndex={-1} onPointerDown={(event) => startResize("top-right", event)} />
          <button className="merch-monk-resize-handle is-bottom-left" type="button" tabIndex={-1} onPointerDown={(event) => startResize("bottom-left", event)} />
          <button className="merch-monk-resize-handle is-bottom-right" type="button" tabIndex={-1} onPointerDown={(event) => startResize("bottom-right", event)} />
        </div>
      ) : null}
      {showEditor ? <SceneEditor /> : null}
    </>
  );
}