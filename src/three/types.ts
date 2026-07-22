export type Breakpoint = "mobile" | "tablet" | "desktop";

export type BoxChildObjectId = "cap_box" | "cup_box" | "notebook_box";

export type BackgroundObjectId =
  | "bg_tote"
  | "bg_cup"
  | "bg_notebook"
  | "bg_umbrela"
  | "bg_notebook_2"
  | "bg_cap"
  | "bg_crewneck"
  | "bg_flip-flop"
  | "bg_sweatpants";

export type BackgroundChildObjectId =
  | "tote.001"
  | "cup.001"
  | "notebook.001"
  | "umbrela_closed.001"
  | "notebook.002"
  | "cap.001"
  | "flip_flop.001"
  | "sweatpant.001";

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
  | "sweatpant"
  | BackgroundObjectId
  | BackgroundChildObjectId;

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
