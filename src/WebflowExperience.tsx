import { useEffect, useMemo } from "react";
import { breakpointPreviewRanges, breakpointPreviewSizes, resolveBreakpointMode } from "./three/breakpoints";
import { GlobalSceneCanvas } from "./three/GlobalSceneCanvas";
import { SceneEditor } from "./three/SceneEditor";
import { editorStore, useEditorStore } from "./three/editorStore";
import { productCupColors, type ProductCupColorKey } from "./components/StorySections";
import type { ExperienceRuntime } from "./experienceRuntime";

type WebflowExperienceProps = {
  runtime: ExperienceRuntime;
  productColor?: ProductCupColorKey;
  showEditor?: boolean;
};

const previewClass = "merch-monk-previewing";
const editorActiveClass = "merch-monk-editor-active";
const bodyEditorActiveClass = "merch-monk-webflow-editing";

export function WebflowExperience({ runtime, productColor = "orange", showEditor = false }: WebflowExperienceProps) {
  const editor = useEditorStore();
  const activeColor = useMemo(
    () => productCupColors.find((color) => color.key === productColor) ?? productCupColors[0],
    [productColor],
  );
  const pageElement = runtime.pageElement;
  const activeBreakpoint = resolveBreakpointMode(editor.breakpointMode, "desktop");
  const isPreviewingBreakpoint = showEditor && editor.enabled;

  useEffect(() => {
    if (editor.breakpointMode === "auto") {
      editorStore.setSelection({ breakpointMode: "desktop" });
    }
    if (!showEditor && editor.enabled) {
      editorStore.setSelection({ enabled: false });
    }
  }, [editor.breakpointMode, editor.enabled, showEditor]);

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
      pageElement.removeAttribute("data-lenis-prevent");
      return;
    }

    const previewSize = breakpointPreviewSizes[activeBreakpoint];
    const previewRange = breakpointPreviewRanges[activeBreakpoint];
    pageElement.style.setProperty("--preview-width", `${previewSize.width}px`);
    pageElement.style.setProperty("--preview-height", `${previewSize.height}px`);
    pageElement.style.setProperty("--preview-min-width", `${previewRange.minWidth}px`);
    pageElement.style.setProperty("--preview-max-width", `${previewRange.maxWidth}px`);
    pageElement.setAttribute("data-lenis-prevent", "");
  }, [activeBreakpoint, editor.enabled, isPreviewingBreakpoint, pageElement, showEditor]);

  return (
    <>
      <GlobalSceneCanvas productCupColor={activeColor} />
      {showEditor ? <SceneEditor /> : null}
    </>
  );
}
