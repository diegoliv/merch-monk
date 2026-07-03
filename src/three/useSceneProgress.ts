import { useEffect, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { editorStore, useEditorStore } from "./editorStore";
import { sceneTimeline } from "./sceneTimeline";
import { getTheatreSheet } from "./theatreProject";
import type { Breakpoint } from "./types";

gsap.registerPlugin(ScrollTrigger);

type SceneProgress = {
  progress: number;
  activeStepId: string;
};

const initialProgress: SceneProgress = {
  progress: 0,
  activeStepId: "hero",
};

let latestSequencePosition = 0;

export function useSceneProgress(activeBreakpoint: Breakpoint) {
  const editor = useEditorStore();
  const [progress, setProgress] = useState(initialProgress);

  useEffect(() => {
    const triggers: ScrollTrigger[] = [];
    const sheet = getTheatreSheet(activeBreakpoint);
    const scroller = editor.breakpointMode === "auto"
      ? undefined
      : document.querySelector<HTMLElement>(".responsive-preview-frame.is-previewing") ?? undefined;
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
        onEnter: (self) => setProgress({ activeStepId: step.id, progress: self.progress }),
        onEnterBack: (self) => setProgress({ activeStepId: step.id, progress: self.progress }),
        onUpdate: (self) => {
          const sequencePosition = index + self.progress;
          latestSequencePosition = sequencePosition;
          sheet.sequence.position = sequencePosition;
          if (self.isActive) {
            setProgress({ activeStepId: step.id, progress: self.progress });
            if (editor.enabled) editorStore.setSelection({ selectedObject: editor.selectedObject });
          }
        },
      });

      triggers.push(trigger);
    });

    ScrollTrigger.refresh();

    return () => {
      triggers.forEach((trigger) => trigger.kill());
    };
  }, [activeBreakpoint, editor.breakpointMode, editor.markers, editor.enabled, editor.selectedObject]);

  return progress;
}