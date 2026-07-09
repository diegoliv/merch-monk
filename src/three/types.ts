export type Breakpoint = "mobile" | "tablet" | "desktop";

export type BoxChildObjectId = "cap_box" | "cup_box" | "notebook_box";

export type ObjectId =
  | "tote"
  | "cup"
  | "umbrela_open"
  | "umbrela_closed"
  | "notebook"
  | "cap"
  | "box"
  | "product_cup"
  | BoxChildObjectId
  | "flip_flop"
  | "crewneck"
  | "sweatpant";

export type Vec3 = [number, number, number];

export type SceneObjectState = {
  anchor: [number, number];
  position: Vec3;
  rotation: Vec3;
  scale: number;
  opacity: number;
  visible: boolean;
};

export type ResponsiveObjectState = Record<Breakpoint, SceneObjectState>;
export type SceneStateId = "heroIntro" | "heroOutro" | "catalogIntro" | "processIntro" | "momoIntro" | "finalCtaIntro";
export type SceneState = Record<ObjectId, ResponsiveObjectState>;

export type TimelineStep = {
  id: string;
  trigger: string;
  from: SceneStateId;
  to: SceneStateId;
};

export type ViewportInfo = {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  worldWidth: number;
  worldHeight: number;
};

export type AppliedObjectState = Omit<SceneObjectState, "anchor"> & {
  worldPosition: Vec3;
};

export type AppliedSceneState = Record<ObjectId, AppliedObjectState>;
