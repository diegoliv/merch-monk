import { useEffect, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { editorStore, useEditorStore } from "./editorStore";
import { sceneTimeline } from "./sceneTimeline";
import { theatreSheet } from "./theatreProject";

gsap.registerPlugin(ScrollTrigger);

type SceneProgress = {
  progress: number;
  activeStepId: string;
};

const initialProgress: SceneProgress = {
  progress: 0,
  activeStepId: "hero",
};

export function useSceneProgress() {
  const editor = useEditorStore();
  const [progress, setProgress] = useState(initialProgress);

  useEffect(() => {
    const triggers: ScrollTrigger[] = [];

    sceneTimeline.forEach((step, index) => {
      const element = document.querySelector(step.trigger);
      if (!element) return;

      const trigger = ScrollTrigger.create({
        trigger: element,
        start: "top top",
        end: "bottom top",
        scrub: true,
        markers: editor.markers,
        onEnter: (self) => setProgress({ activeStepId: step.id, progress: self.progress }),
        onEnterBack: (self) => setProgress({ activeStepId: step.id, progress: self.progress }),
        onUpdate: (self) => {
          const sequencePosition = index + self.progress;
          theatreSheet.sequence.position = sequencePosition;
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
  }, [editor.markers, editor.enabled, editor.selectedObject]);

  return progress;
}