import { getProject, types } from "@theatre/core";
import type { ISheetObject, __UNSTABLE_Project_OnDiskState } from "@theatre/core";
import { breakpoints } from "./breakpoints";
import { boxChildObjectIds, objectIds } from "./sceneObjects";
import { sceneTimeline } from "./sceneTimeline";
import type { Breakpoint, ObjectId } from "./types";

export type TheatreObjectValue = {
  anchor: { x: number; y: number };
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: number;
  opacity: number;
  visible: boolean;
  boxAnimationProgress?: number;
};

export const theatreProjectId = "Merch Monk Scene Neutral";
export const theatreSequenceLength = sceneTimeline.length;

const productionTheatreState = {
  sheetsById: {},
  definitionVersion: "0.4.0",
  revisionHistory: ["merch-monk-production-baseline"],
} satisfies __UNSTABLE_Project_OnDiskState;

export const theatreProject = getProject(
  theatreProjectId,
  import.meta.env.PROD ? { state: productionTheatreState } : undefined,
);
export const theatreSheets = Object.fromEntries(
  breakpoints.map((breakpoint) => [
    breakpoint,
    theatreProject.sheet(breakpoint === "desktop" ? "Scroll Scene" : `Scroll Scene / ${breakpoint}`),
  ]),
) as Record<Breakpoint, ReturnType<typeof theatreProject.sheet>>;
export const theatreSheet = theatreSheets.desktop;

function theatreDefaults(id?: ObjectId): TheatreObjectValue {
  if (id === "product_cup") {
    return {
      anchor: { x: 0.58, y: 0.56 },
      position: { x: 0, y: 0, z: 0.35 },
      rotation: { x: 0.08, y: -0.18, z: 0 },
      scale: 1.45,
      opacity: 1,
      visible: true,
    };
  }

  return {
    anchor: { x: 0.5, y: 0.5 },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    opacity: 1,
    visible: true,
  };
}

function theatreObjectName(id: ObjectId) {
  return boxChildObjectIds.includes(id as (typeof boxChildObjectIds)[number]) ? `box/${id}` : id;
}

function createTheatreObject(id: ObjectId, sheet = theatreSheet) {
  const defaults = theatreDefaults(id);

  const config = {
    anchor: {
      x: types.number(defaults.anchor.x, { range: [-2, 3] }),
      y: types.number(defaults.anchor.y, { range: [-2, 3] }),
    },
    position: {
      x: types.number(defaults.position.x, { range: [-30, 30] }),
      y: types.number(defaults.position.y, { range: [-30, 30] }),
      z: types.number(defaults.position.z, { range: [-30, 30] }),
    },
    rotation: {
      x: types.number(defaults.rotation.x, { range: [-Math.PI, Math.PI] }),
      y: types.number(defaults.rotation.y, { range: [-Math.PI, Math.PI] }),
      z: types.number(defaults.rotation.z, { range: [-Math.PI, Math.PI] }),
    },
    scale: types.number(defaults.scale, { range: [0, 10] }),
    opacity: types.number(defaults.opacity, { range: [0, 1] }),
    visible: defaults.visible,
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
    ...(typeof value.boxAnimationProgress === "number" ? { boxAnimationProgress: value.boxAnimationProgress } : {}),
  };
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.0001;
}

export function areTheatreObjectValuesEqual(a: TheatreObjectValue, b: TheatreObjectValue) {
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