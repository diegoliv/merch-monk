import type { SceneStateId, TimelineStep } from "./types";

export const sceneTimeline = [
  {
    id: "hero",
    from: "heroIntro",
    to: "heroOutro",
  },
  {
    id: "ordering",
    from: "heroOutro",
    to: "catalogIntro",
  },
  {
    id: "options",
    from: "catalogIntro",
    to: "processIntro",
  },
  {
    id: "momo",
    from: "processIntro",
    to: "momoIntro",
  },
  {
    id: "pricing",
    from: "momoIntro",
    to: "finalCtaIntro",
  },
  {
    id: "minutes",
    from: "finalCtaIntro",
    to: "finalCtaIntro",
  },
] as const satisfies readonly TimelineStep[];

export type SceneId = (typeof sceneTimeline)[number]["id"];
export const sceneIds = sceneTimeline.map((step) => step.id);

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
