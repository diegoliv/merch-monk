import type { SceneStateId, TimelineStep } from "./types";

export const sceneTimeline: TimelineStep[] = [
  {
    id: "hero",
    trigger: "[data-scene='hero'], .section_hero",
    from: "heroIntro",
    to: "heroOutro",
  },
  {
    id: "ordering",
    trigger: "[data-scene='ordering'], .section_home-ordering",
    from: "heroOutro",
    to: "catalogIntro",
  },
  {
    id: "options",
    trigger: "[data-scene='options'], .section_home-options",
    from: "catalogIntro",
    to: "processIntro",
  },
  {
    id: "momo",
    trigger: "[data-scene='momo'], .section_home-momo",
    from: "processIntro",
    to: "momoIntro",
  },
  {
    id: "pricing",
    trigger: "[data-scene='pricing'], .section_home-confidence",
    from: "momoIntro",
    to: "finalCtaIntro",
  },
  {
    id: "minutes",
    trigger: "[data-scene='minutes'], .section_home-weeks-minutes",
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
