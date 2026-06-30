import { getProject, types } from "@theatre/core";
import type { ISheetObject } from "@theatre/core";
import { boxChildObjectIds, objectIds } from "./sceneObjects";
import { sceneTimeline } from "./sceneTimeline";
import type { ObjectId } from "./types";

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
export const theatreProject = getProject(theatreProjectId);
export const theatreSheet = theatreProject.sheet("Scroll Scene");

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

function createTheatreObject(id: ObjectId) {
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

  return theatreSheet.object(theatreObjectName(id), config) as ISheetObject<TheatreObjectValue>;
}

export const theatreObjects = Object.fromEntries(
  objectIds.map((id) => [id, createTheatreObject(id)]),
) as Record<ObjectId, ISheetObject<TheatreObjectValue>>;

export function getTheatreObject(id: ObjectId) {
  return theatreObjects[id];
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