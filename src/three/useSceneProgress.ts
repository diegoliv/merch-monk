import { useEffect } from "react";
import { useExperienceRuntime } from "../experienceRuntime";
import { resolveResponsiveDataElement } from "./domBindings";
import { useEditorStore } from "./editorStore";
import { sceneTimeline } from "./sceneTimeline";
import { getScrollRuntime } from "./scrollRuntime";
import { getTheatreSheet } from "./theatreProject";
import type { Breakpoint } from "./types";

let latestSequencePosition = 0;

export function useSceneProgress(activeBreakpoint: Breakpoint, onProgress?: () => void) {
  const editor = useEditorStore();
  const runtime = useExperienceRuntime();
  useEffect(() => {
    const { ScrollTrigger } = getScrollRuntime();
    const triggers: Array<{ kill: () => void }> = [];
    const sheet = getTheatreSheet(activeBreakpoint);
    const root = runtime.pageElement ?? document;
    const scroller = editor.breakpointMode === "auto"
      ? undefined
      : document.querySelector<HTMLElement>(runtime.previewScrollerSelector) ?? undefined;
    sheet.sequence.position = latestSequencePosition;

    sceneTimeline.forEach((step, index) => {
      const element = resolveResponsiveDataElement({
        root,
        valueAttribute: "data-scene",
        breakpointAttribute: "data-scene-breakpoint",
        value: step.id,
        breakpoint: activeBreakpoint,
        label: "scroll trigger for scene \"" + step.id + "\"",
        required: true,
      });
      if (!element) return;

      const trigger = ScrollTrigger.create({
        id: "merch-monk:" + activeBreakpoint + ":" + step.id,
        trigger: element,
        scroller,
        start: "top top",
        end: "bottom top",
        scrub: true,
        markers: editor.markers,
        onUpdate: (self) => {
          const sequencePosition = index + self.progress;
          latestSequencePosition = sequencePosition;
          sheet.sequence.position = sequencePosition;
          onProgress?.();
        },
      });

      triggers.push(trigger);
    });

    ScrollTrigger.refresh();
    ScrollTrigger.update();
    onProgress?.();

    return () => {
      triggers.forEach((trigger) => trigger.kill());
    };
  }, [activeBreakpoint, editor.breakpointMode, editor.markers, onProgress, runtime.pageElement, runtime.previewScrollerSelector]);
}
