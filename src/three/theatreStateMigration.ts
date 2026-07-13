import type { __UNSTABLE_Project_OnDiskState } from "@theatre/core";
import { backgroundChildObjectIds, backgroundParentByChild, boxChildObjectIds, renderObjectIds } from "./sceneObjects";

export const merchMonkLayoutVersion = 1;

const legacyViewport = {
  worldWidth: 16,
  worldHeight: 10,
};

type SerializableRecord = Record<string, unknown>;
type LayoutState = __UNSTABLE_Project_OnDiskState & {
  __merchMonkLayoutVersion?: number;
  sheetsById: Record<string, SerializableRecord>;
};

const canonicalObjectNameByAlternateName = Object.fromEntries([
  ...boxChildObjectIds.flatMap((childId) => [
    [`> ${childId}`, `box / ${childId}`],
    [`box > ${childId}`, `box / ${childId}`],
  ]),
  ...backgroundChildObjectIds.flatMap((childId) => [
    [`> ${childId}`, `${backgroundParentByChild[childId]} / ${childId}`],
    [`${backgroundParentByChild[childId]} > ${childId}`, `${backgroundParentByChild[childId]} / ${childId}`],
  ]),
]) as Record<string, string>;

function isRecord(value: unknown): value is SerializableRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneState(state: __UNSTABLE_Project_OnDiskState) {
  return JSON.parse(JSON.stringify(state)) as LayoutState;
}

function convertLegacyValue(path: string, value: unknown) {
  if (typeof value !== "number") return value;
  if (path === '["anchor","x"]' || path === '["anchor","y"]') return value * 100;
  if (path === '["position","x"]') return (value / legacyViewport.worldWidth) * 100;
  if (path === '["position","y"]') return -(value / legacyViewport.worldHeight) * 100;
  if (path === '["scale"]') return (value / Math.min(legacyViewport.worldWidth, legacyViewport.worldHeight)) * 100;
  return value;
}

function migrateStaticObject(value: unknown) {
  if (!isRecord(value)) return;
  const anchor = value.anchor;
  const position = value.position;

  if (isRecord(anchor)) {
    if (typeof anchor.x === "number") anchor.x *= 100;
    if (typeof anchor.y === "number") anchor.y *= 100;
  }
  if (isRecord(position)) {
    if (typeof position.x === "number") position.x = (position.x / legacyViewport.worldWidth) * 100;
    if (typeof position.y === "number") position.y = -(position.y / legacyViewport.worldHeight) * 100;
  }
  if (typeof value.scale === "number") {
    value.scale = (value.scale / Math.min(legacyViewport.worldWidth, legacyViewport.worldHeight)) * 100;
  }
}

function migrateSheet(sheet: SerializableRecord) {
  const staticOverrides = sheet.staticOverrides;
  if (isRecord(staticOverrides) && isRecord(staticOverrides.byObject)) {
    Object.entries(staticOverrides.byObject).forEach(([objectId, value]) => {
      if (renderObjectIds.includes(objectId as (typeof renderObjectIds)[number])) migrateStaticObject(value);
    });
  }

  const sequence = sheet.sequence;
  if (!isRecord(sequence) || !isRecord(sequence.tracksByObject)) return;
  Object.entries(sequence.tracksByObject).forEach(([objectId, tracks]) => {
    if (!renderObjectIds.includes(objectId as (typeof renderObjectIds)[number]) || !isRecord(tracks)) return;
    const trackData = tracks.trackData;
    const trackIdByPropPath = tracks.trackIdByPropPath;
    if (!isRecord(trackData) || !isRecord(trackIdByPropPath)) return;

    Object.entries(trackIdByPropPath).forEach(([path, trackId]) => {
      if (typeof trackId !== "string") return;
      const track = trackData[trackId];
      if (!isRecord(track) || !Array.isArray(track.keyframes)) return;
      track.keyframes.forEach((keyframe) => {
        if (isRecord(keyframe)) keyframe.value = convertLegacyValue(path, keyframe.value);
      });
    });
  });
}

function stateUsesResponsiveUnits(state: LayoutState) {
  return Object.values(state.sheetsById).some((sheet) => {
    if (!isRecord(sheet)) return false;
    const staticOverrides = sheet.staticOverrides;
    if (isRecord(staticOverrides) && isRecord(staticOverrides.byObject)) {
      const hasResponsiveStaticValue = Object.entries(staticOverrides.byObject).some(([objectId, value]) => {
        if (!renderObjectIds.includes(objectId as (typeof renderObjectIds)[number]) || !isRecord(value)) return false;
        if (typeof value.scale === "number" && Math.abs(value.scale) > 10) return true;
        if (isRecord(value.anchor)) {
          if (typeof value.anchor.x === "number" && Math.abs(value.anchor.x) > 3) return true;
          if (typeof value.anchor.y === "number" && Math.abs(value.anchor.y) > 3) return true;
        }
        return false;
      });
      if (hasResponsiveStaticValue) return true;
    }

    const sequence = sheet.sequence;
    if (!isRecord(sequence) || !isRecord(sequence.tracksByObject)) return false;
    return Object.entries(sequence.tracksByObject).some(([objectId, tracks]) => {
      if (!renderObjectIds.includes(objectId as (typeof renderObjectIds)[number]) || !isRecord(tracks)) return false;
      const trackData = tracks.trackData;
      const trackIdByPropPath = tracks.trackIdByPropPath;
      if (!isRecord(trackData) || !isRecord(trackIdByPropPath)) return false;
      return Object.entries(trackIdByPropPath).some(([path, trackId]) => {
        if (typeof trackId !== "string" || !['["anchor","x"]', '["anchor","y"]', '["scale"]'].includes(path)) return false;
        const track = trackData[trackId];
        return isRecord(track) && Array.isArray(track.keyframes) && track.keyframes.some((keyframe) => (
          isRecord(keyframe) && typeof keyframe.value === "number" && Math.abs(keyframe.value) > (path === '["scale"]' ? 10 : 3)
        ));
      });
    });
  });
}

function migrateCanonicalObjectNames(state: LayoutState) {
  Object.values(state.sheetsById).forEach((sheet) => {
    if (!isRecord(sheet)) return;

    const staticOverrides = sheet.staticOverrides;
    if (isRecord(staticOverrides) && isRecord(staticOverrides.byObject)) {
      migrateObjectNamesInRecord(staticOverrides.byObject);
    }

    const sequence = sheet.sequence;
    if (isRecord(sequence) && isRecord(sequence.tracksByObject)) {
      migrateObjectNamesInRecord(sequence.tracksByObject);
    }
  });
}

function migrateObjectNamesInRecord(record: SerializableRecord) {
  Object.entries(canonicalObjectNameByAlternateName).forEach(([alternateName, canonicalName]) => {
    if (!(alternateName in record)) return;
    if (!(canonicalName in record)) record[canonicalName] = record[alternateName];
    delete record[alternateName];
  });
}
function ensureResponsiveSheets(state: LayoutState) {
  const desktop = state.sheetsById["Scroll Scene"];
  if (!isRecord(desktop)) return;
  if (!state.sheetsById["Scroll Scene / tablet"]) {
    state.sheetsById["Scroll Scene / tablet"] = JSON.parse(JSON.stringify(desktop)) as SerializableRecord;
  }
  if (!state.sheetsById["Scroll Scene / mobile"]) {
    state.sheetsById["Scroll Scene / mobile"] = JSON.parse(JSON.stringify(desktop)) as SerializableRecord;
  }
}

export function prepareTheatreState(source: __UNSTABLE_Project_OnDiskState) {
  const state = cloneState(source);
  if (state.__merchMonkLayoutVersion !== merchMonkLayoutVersion && !stateUsesResponsiveUnits(state)) {
    Object.values(state.sheetsById).forEach((sheet) => {
      if (isRecord(sheet)) migrateSheet(sheet);
    });
    state.__merchMonkLayoutVersion = merchMonkLayoutVersion;
  }
  migrateCanonicalObjectNames(state);
  ensureResponsiveSheets(state);
  delete state.__merchMonkLayoutVersion;
  return state as __UNSTABLE_Project_OnDiskState;
}

export function addTheatreLayoutVersion<T extends __UNSTABLE_Project_OnDiskState>(state: T) {
  return {
    ...state,
    __merchMonkLayoutVersion: merchMonkLayoutVersion,
  };
}
