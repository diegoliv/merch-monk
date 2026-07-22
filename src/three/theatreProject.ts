import { getProject, types } from "@theatre/core";
import type { ISheetObject, __UNSTABLE_Project_OnDiskState } from "@theatre/core";
import { breakpoints } from "./breakpoints";
import { crewneckGridDefaults, type CrewneckGridSettings } from "./backgroundGridLayout";
import { backgroundChildObjectIds, backgroundCollectionId, backgroundObjectIds, backgroundParentByChild, boxChildObjectIds, objectIds } from "./sceneObjects";
import { sceneTimeline } from "./sceneTimeline";
import productionTheatreStateJson from "./merch-monk-home.theatre-project-state.json";
import type { BackgroundChildObjectId, BackgroundObjectId, Breakpoint, ObjectId } from "./types";
import { prepareTheatreState } from "./theatreStateMigration";

export type TheatreObjectValue = {
  anchor: { x: number; y: number };
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: number;
  opacity: number;
  visible: boolean;
  showLogo?: boolean;
  grid?: CrewneckGridSettings;
  boxAnimationProgress?: number;
};

export const theatreProjectId = "Merch Monk Scene Responsive";
export const theatreSequenceLength = sceneTimeline.length;
const backgroundDefaultPositions: Record<BackgroundObjectId, { x: number; y: number }> = {
  bg_tote: { x: -24, y: -24 },
  bg_cup: { x: -24, y: 0 },
  bg_notebook: { x: -24, y: 24 },
  bg_umbrela: { x: 0, y: -24 },
  bg_notebook_2: { x: 0, y: 0 },
  "bg_flip-flop": { x: 0, y: 24 },
  bg_cap: { x: 24, y: -24 },
  bg_crewneck: { x: 24, y: 0 },
  bg_sweatpants: { x: 24, y: 24 },
};

const productionTheatreState = prepareTheatreState((
  window.MerchMonkWebflow?.theatreState ?? productionTheatreStateJson
) as __UNSTABLE_Project_OnDiskState);

export const theatreProject = getProject(
  theatreProjectId,
  { state: productionTheatreState },
);
export const theatreSheets = Object.fromEntries(
  breakpoints.map((breakpoint) => [
    breakpoint,
    theatreProject.sheet(breakpoint === "desktop" ? "Scroll Scene" : `Scroll Scene / ${breakpoint}`),
  ]),
) as Record<Breakpoint, ReturnType<typeof theatreProject.sheet>>;
export const theatreSheet = theatreSheets.desktop;

function theatreDefaults(id?: ObjectId): TheatreObjectValue {
  const backgroundPosition = id ? backgroundDefaultPositions[id as BackgroundObjectId] : undefined;
  if (backgroundPosition) {
    return {
      anchor: { x: 50, y: 50 },
      position: { x: backgroundPosition.x, y: backgroundPosition.y, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 10,
      opacity: 1,
      visible: true,
    };
  }
  if (
    id && (
      boxChildObjectIds.includes(id as (typeof boxChildObjectIds)[number]) ||
      backgroundChildObjectIds.includes(id as BackgroundChildObjectId)
    )
  ) {
    return {
      anchor: { x: 50, y: 50 },
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 1,
      opacity: 1,
      visible: true,
    };
  }
  if (id === "product_cup") {
    return {
      anchor: { x: 58, y: 56 },
      position: { x: 0, y: 0, z: 0.35 },
      rotation: { x: 0.08, y: -0.18, z: 0 },
      scale: 14.5,
      opacity: 1,
      visible: true,
    };
  }

  return {
    anchor: { x: 50, y: 50 },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 10,
    opacity: 1,
    visible: true,
  };
}

export function theatreObjectName(id: ObjectId) {
  if (id === backgroundCollectionId) return id;
  if (boxChildObjectIds.includes(id as (typeof boxChildObjectIds)[number])) return `box / ${id}`;
  if (backgroundObjectIds.includes(id as BackgroundObjectId)) {
    return `${backgroundCollectionId} / ${id}`;
  }
  if (backgroundChildObjectIds.includes(id as BackgroundChildObjectId)) {
    return `${backgroundCollectionId} / ${backgroundParentByChild[id as BackgroundChildObjectId]} / ${id}`;
  }
  return id;
}

function createTheatreObject(id: ObjectId, sheet = theatreSheet) {
  const defaults = theatreDefaults(id);

  const config = {
    anchor: {
      x: types.number(defaults.anchor.x, { range: [-200, 300] }),
      y: types.number(defaults.anchor.y, { range: [-200, 300] }),
    },
    position: {
      x: types.number(defaults.position.x, { range: [-300, 300] }),
      y: types.number(defaults.position.y, { range: [-300, 300] }),
      z: types.number(defaults.position.z, { range: [-30, 30] }),
    },
    rotation: {
      x: types.number(defaults.rotation.x),
      y: types.number(defaults.rotation.y),
      z: types.number(defaults.rotation.z),
    },
    scale: types.number(defaults.scale, { range: [0, 100] }),
    opacity: types.number(defaults.opacity, { range: [0, 1] }),
    visible: defaults.visible,
    ...(id === "crewneck" ? {
      showLogo: types.boolean(false, { label: "Show Logo" }),
      grid: {
        follow: types.number(crewneckGridDefaults.follow, { range: [0, 1], label: "Grid Follow" }),
        offset: {
          x: types.number(crewneckGridDefaults.offset.x, { range: [-100, 100], label: "Offset X" }),
          y: types.number(crewneckGridDefaults.offset.y, { range: [-100, 100], label: "Offset Y" }),
        },
        scale: types.number(crewneckGridDefaults.scale, { range: [0, 200], label: "Grid Scale" }),
      },
    } : {}),
    ...(id === "box" ? { boxAnimationProgress: types.number(0, { range: [0, 1] }) } : {}),
  };

  return sheet.object(theatreObjectName(id), config) as ISheetObject<TheatreObjectValue>;
}

function createTheatreObjectsForBreakpoint(breakpoint: Breakpoint) {
  const sheet = theatreSheets[breakpoint];

  return Object.fromEntries(
    objectIds.map((id) => [id, createTheatreObject(id, sheet)]),
  ) as Record<ObjectId, ISheetObject<TheatreObjectValue>>;
}

export const theatreObjectsByBreakpoint = Object.fromEntries(
  breakpoints.map((breakpoint) => [breakpoint, createTheatreObjectsForBreakpoint(breakpoint)]),
) as Record<Breakpoint, Record<ObjectId, ISheetObject<TheatreObjectValue>>>;

export const theatreObjects = theatreObjectsByBreakpoint.desktop;

export function getTheatreSheet(breakpoint: Breakpoint) {
  return theatreSheets[breakpoint];
}

export function getTheatreObjects(breakpoint: Breakpoint) {
  return theatreObjectsByBreakpoint[breakpoint];
}

export function getTheatreObject(id: ObjectId, breakpoint: Breakpoint = "desktop") {
  return theatreObjectsByBreakpoint[breakpoint][id];
}

export function cloneTheatreObjectValue(value: TheatreObjectValue): TheatreObjectValue {
  return {
    anchor: { ...value.anchor },
    position: { ...value.position },
    rotation: { ...value.rotation },
    scale: value.scale,
    opacity: value.opacity,
    visible: value.visible,
    ...(typeof value.showLogo === "boolean" ? { showLogo: value.showLogo } : {}),
    ...(value.grid ? {
      grid: {
        follow: value.grid.follow,
        offset: { ...value.grid.offset },
        scale: value.grid.scale,
      },
    } : {}),
    ...(typeof value.boxAnimationProgress === "number" ? { boxAnimationProgress: value.boxAnimationProgress } : {}),
  };
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.0001;
}

export function areTheatreObjectValuesEqual(a: TheatreObjectValue, b: TheatreObjectValue) {
  const aGrid = a.grid ?? crewneckGridDefaults;
  const bGrid = b.grid ?? crewneckGridDefaults;
  return (
    nearlyEqual(a.anchor.x, b.anchor.x) &&
    nearlyEqual(a.anchor.y, b.anchor.y) &&
    nearlyEqual(a.position.x, b.position.x) &&
    nearlyEqual(a.position.y, b.position.y) &&
    nearlyEqual(a.position.z, b.position.z) &&
    nearlyEqual(a.rotation.x, b.rotation.x) &&
    nearlyEqual(a.rotation.y, b.rotation.y) &&
    nearlyEqual(a.rotation.z, b.rotation.z) &&
    nearlyEqual(a.scale, b.scale) &&
    nearlyEqual(a.opacity, b.opacity) &&
    a.visible === b.visible &&
    (a.showLogo ?? false) === (b.showLogo ?? false) &&
    nearlyEqual(aGrid.follow, bGrid.follow) &&
    nearlyEqual(aGrid.offset.x, bGrid.offset.x) &&
    nearlyEqual(aGrid.offset.y, bGrid.offset.y) &&
    nearlyEqual(aGrid.scale, bGrid.scale) &&
    nearlyEqual(a.boxAnimationProgress ?? 0, b.boxAnimationProgress ?? 0)
  );
}

export function valueToSceneState(value: TheatreObjectValue) {
  return {
    anchor: [value.anchor.x, value.anchor.y] as [number, number],
    position: [value.position.x, value.position.y, value.position.z] as [number, number, number],
    rotation: [value.rotation.x, value.rotation.y, value.rotation.z] as [number, number, number],
    scale: value.scale,
    opacity: value.opacity,
    visible: value.visible,
  };
}