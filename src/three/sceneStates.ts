import type { Breakpoint, ObjectId, ResponsiveObjectState, SceneObjectState, SceneState, SceneStateId } from "./types";
import { objectIds } from "./sceneObjects";

const hidden: SceneObjectState = {
  anchor: [0.5, 0.5],
  position: [0, 0, -2],
  rotation: [0, 0, 0],
  scale: 0.01,
  opacity: 0,
  visible: false,
};

function responsive(desktop: SceneObjectState, tablet?: Partial<SceneObjectState>, mobile?: Partial<SceneObjectState>): ResponsiveObjectState {
  return {
    desktop,
    tablet: { ...desktop, ...tablet },
    mobile: { ...desktop, ...mobile },
  };
}

function makeState(entries: Partial<Record<ObjectId, ResponsiveObjectState>>): SceneState {
  return objectIds.reduce((state, id) => {
    state[id] = entries[id] ?? responsive(hidden);
    return state;
  }, {} as SceneState);
}

const hoodieHero = responsive(
  {
    anchor: [0.13, 0.44],
    position: [0, 0, 0],
    rotation: [0.12, -0.35, 0.02],
    scale: 1.28,
    opacity: 1,
    visible: true,
  },
  { anchor: [0.1, 0.42], scale: 1.05 },
  { anchor: [0.14, 0.32], scale: 0.55, opacity: 0.78 },
);

const capHero = responsive(
  {
    anchor: [0.5, 0.19],
    position: [0, 0, 0.2],
    rotation: [0.22, -0.22, -0.04],
    scale: 0.88,
    opacity: 1,
    visible: true,
  },
  { anchor: [0.48, 0.2], scale: 0.78 },
  { anchor: [0.74, 0.22], scale: 0.42, opacity: 0.9 },
);

const notebookHero = responsive(
  {
    anchor: [0.88, 0.24],
    position: [0, 0, 0],
    rotation: [0.28, -0.66, -0.1],
    scale: 0.92,
    opacity: 1,
    visible: true,
  },
  { anchor: [0.88, 0.25], scale: 0.72 },
  { anchor: [0.9, 0.43], scale: 0.36, opacity: 0.72 },
);

const toteHero = responsive(
  {
    anchor: [0.86, 0.72],
    position: [0, 0, 0.1],
    rotation: [0.08, -0.22, -0.02],
    scale: 0.82,
    opacity: 1,
    visible: true,
  },
  { anchor: [0.89, 0.74], scale: 0.62 },
  { anchor: [0.82, 0.73], scale: 0.34, opacity: 0.7 },
);

const cupHero = responsive(
  {
    anchor: [0.18, 0.83],
    position: [0, 0, 0.1],
    rotation: [0.05, 0.18, 0.02],
    scale: 0.72,
    opacity: 1,
    visible: true,
  },
  { anchor: [0.14, 0.83], scale: 0.56 },
  { anchor: [0.18, 0.82], scale: 0.34, opacity: 0.62 },
);

export const sceneStates: Record<SceneStateId, SceneState> = {
  heroIntro: makeState({
    crewneck: hoodieHero,
    cap: capHero,
    notebook: notebookHero,
    "tote": toteHero,
    cup: cupHero,
    flip_flop: responsive({ ...hidden, anchor: [0.64, 1.08], rotation: [0.6, 0.1, -0.4], scale: 0.38 }),
  }),
  heroOutro: makeState({
    crewneck: responsive({ ...hoodieHero.desktop, anchor: [0.03, 0.38], position: [-2, 0, -0.5], scale: 0.78, opacity: 0 }),
    cap: responsive({ ...capHero.desktop, anchor: [0.35, 0.12], scale: 0.48, opacity: 0.2 }),
    notebook: responsive({ ...notebookHero.desktop, anchor: [1.05, 0.18], position: [2, 0, -0.5], scale: 0.62, opacity: 0 }),
    "tote": responsive({ ...toteHero.desktop, anchor: [1.04, 0.62], scale: 0.58, opacity: 0 }),
    cup: responsive({ ...cupHero.desktop, anchor: [0.08, 0.9], scale: 0.46, opacity: 0.35 }),
    flip_flop: responsive({
      anchor: [0.54, 0.82],
      position: [0, 0, 0],
      rotation: [0.58, 0.22, -0.32],
      scale: 0.5,
      opacity: 1,
      visible: true,
    }),
  }),
  catalogIntro: makeState({
    notebook: responsive({
      anchor: [0.28, 0.46],
      position: [0, 0, 0.2],
      rotation: [0.25, 0.55, 0.12],
      scale: 1.32,
      opacity: 0.9,
      visible: true,
    }, { scale: 1.04 }, { anchor: [0.5, 0.34], scale: 0.55 }),
    cap: responsive({
      anchor: [0.72, 0.44],
      position: [0, 0, 0.1],
      rotation: [0.18, -0.75, 0.05],
      scale: 1.18,
      opacity: 1,
      visible: true,
    }, { scale: 0.86 }, { anchor: [0.5, 0.72], scale: 0.5 }),
    cup: responsive({ ...cupHero.desktop, anchor: [0.1, 0.78], opacity: 0.18, scale: 0.52 }),
  }),
  processIntro: makeState({
    umbrela_open: responsive({
      anchor: [0.18, 0.46],
      position: [0, 0, 0],
      rotation: [0.48, -0.42, 0.18],
      scale: 1.1,
      opacity: 1,
      visible: true,
    }, { scale: 0.78 }, { anchor: [0.26, 0.32], scale: 0.44 }),
    sweatpant: responsive({
      anchor: [0.78, 0.5],
      position: [0, 0, 0.1],
      rotation: [0.24, 0.52, -0.12],
      scale: 1.2,
      opacity: 1,
      visible: true,
    }, { scale: 0.9 }, { anchor: [0.7, 0.72], scale: 0.52 }),
  }),
  momoIntro: makeState({
    box: responsive({
      anchor: [0.52, 0.5],
      position: [0, 0, 0.1],
      rotation: [0.18, -0.32, 0.02],
      scale: 1.34,
      opacity: 1,
      visible: true,
    }, { scale: 1.02 }, { anchor: [0.5, 0.5], scale: 0.58 }),
    cap: responsive({ ...capHero.desktop, anchor: [0.22, 0.28], scale: 0.54, opacity: 0.45 }),
    cup: responsive({ ...cupHero.desktop, anchor: [0.82, 0.74], scale: 0.46, opacity: 0.5 }),
    notebook: responsive({ ...notebookHero.desktop, anchor: [0.82, 0.24], scale: 0.52, opacity: 0.42 }),
  }),
  finalCtaIntro: makeState({
    "tote": responsive({
      anchor: [0.35, 0.52],
      position: [0, 0, 0.1],
      rotation: [0.1, -0.3, 0],
      scale: 1.02,
      opacity: 1,
      visible: true,
    }, { scale: 0.82 }, { anchor: [0.5, 0.35], scale: 0.5 }),
    cup: responsive({
      anchor: [0.64, 0.52],
      position: [0, 0, 0],
      rotation: [0.05, 0.4, -0.04],
      scale: 0.92,
      opacity: 1,
      visible: true,
    }, { scale: 0.72 }, { anchor: [0.5, 0.7], scale: 0.42 }),
    cap: responsive({ ...capHero.desktop, anchor: [0.52, 0.18], scale: 0.6, opacity: 0.55 }),
  }),
};

export const editableBreakpoints: Breakpoint[] = ["desktop", "tablet", "mobile"];
