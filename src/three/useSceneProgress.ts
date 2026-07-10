import { useEffect } from "react";
import { useExperienceRuntime } from "../experienceRuntime";
import { useEditorStore } from "./editorStore";
import { sceneTimeline } from "./sceneTimeline";
import { getScrollRuntime } from "./scrollRuntime";
import { getTheatreSheet } from "./theatreProject";
import type { Breakpoint } from "./types";

let latestSequencePosition = 0;

export function useSceneProgress(activeBreakpoint: Breakpoint) {
  const editor = useEditorStore();
  const runtime = useExperienceRuntime();
  useEffect(() => {
    const { ScrollTrigger } = getScrollRuntime();
    const triggers: Array<{ kill: () => void }> = [];
    const sheet = getTheatreSheet(activeBreakpoint);
    const scroller = editor.breakpointMode === "auto"
      ? undefined
      : document.querySelector<HTMLElement>(runtime.previewScrollerSelector) ?? undefined;
    sheet.sequence.position = latestSequencePosition;

    sceneTimeline.forEach((step, index) => {
      const element = document.querySelector(step.trigger);
      if (!element) return;

      const trigger = ScrollTrigger.create({
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
        },
      });

      triggers.push(trigger);
    });

    ScrollTrigger.refresh();

    return () => {
      triggers.forEach((trigger) => trigger.kill());
    };
  }, [activeBreakpoint, editor.breakpointMode, editor.markers, runtime.previewScrollerSelector]);
}
