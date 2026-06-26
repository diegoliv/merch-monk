import type { SceneStateId, TimelineStep } from "./types";

export const sceneTimeline: TimelineStep[] = [
  {
    id: "hero",
    trigger: "[data-scene='hero']",
    from: "heroIntro",
    to: "heroOutro",
  },
  {
    id: "ordering",
    trigger: "[data-scene='ordering']",
    from: "heroOutro",
    to: "catalogIntro",
  },
  {
    id: "options",
    trigger: "[data-scene='options']",
    from: "catalogIntro",
    to: "processIntro",
  },
  {
    id: "pricing",
    trigger: "[data-scene='pricing']",
    from: "processIntro",
    to: "finalCtaIntro",
  },
  {
    id: "minutes",
    trigger: "[data-scene='minutes']",
    from: "finalCtaIntro",
    to: "finalCtaIntro",
  },
];

export type TimelinePresetKeyframe = {
  percent: number;
  state: SceneStateId;
};

export const timelinePresets: Record<string, TimelinePresetKeyframe[]> = Object.fromEntries(
  sceneTimeline.map((step) => [
    step.id,
    [
      { percent: 0, state: step.from },
      { percent: 100, state: step.to },
    ],
  ]),
);