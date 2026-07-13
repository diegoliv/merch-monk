import { cloneTheatreObjectValue, getTheatreObject, getTheatreSheet, theatreProjectId, type TheatreObjectValue } from "./theatreProject";
import type { Breakpoint, ObjectId } from "./types";

type Studio = typeof import("@theatre/studio").default;
type TheatreTransactionSet = Parameters<Parameters<Studio["transaction"]>[0]>[0]["set"];
type StudioInternal = {
  transaction: (fn: (api: { drafts: TheatreDrafts; stateEditors: TheatreStateEditors }) => void) => void;
};
type TheatreObjectTracks = {
  trackIdByPropPath: Record<string, string | undefined>;
  trackData: Record<string, TheatreTrackData | undefined>;
};
type TheatreTrackData = {
  type: "BasicKeyframedTrack";
  __debugName?: string;
  keyframes: TheatreKeyframe[];
};
type TheatreKeyframe = {
  id: string;
  value: unknown;
  position: number;
  handles: [number, number, number, number];
  connectedRight: boolean;
  type?: "bezier" | "hold";
};
type TheatreDrafts = {
  historic: {
    coreByProject: Record<string, TheatreProjectState | undefined>;
  };
};
type TheatreProjectState = {
  sheetsById: Record<string, TheatreSheetState | undefined>;
};
type TheatreSheetState = {
  staticOverrides?: {
    byObject?: Record<string, unknown>;
  };
  sequence?: {
    type: "PositionalSequence";
    length: number;
    subUnitsPerUnit: number;
    tracksByObject: Record<string, TheatreObjectTracks | undefined>;
  };
};
type TheatreStateEditors = {
  coreByProject: {
    historic: {
      sheetsById: {
        sequence: {
          _ensure: (address: Record<string, unknown>) => TheatreSheetState["sequence"];
          setPrimitivePropAsSequenced: (address: Record<string, unknown>, config?: unknown) => void;
          replaceKeyframes: (address: Record<string, unknown>) => void;
          setKeyframeAtPosition: (address: Record<string, unknown>) => void;
        };
      };
    };
  };
};

let studioPromise: Promise<Studio> | null = null;
let initialized = false;

async function loadStudio() {
  if (!studioPromise) {
    studioPromise = import("@theatre/studio").then((module) => module.default);
  }

  const studio = await studioPromise;
  if (!initialized) {
    studio.initialize({ persistenceKey: "merch-monk-theatre-studio-neutral" });
    initialized = true;
  }
  return studio;
}

function selectSheetAndObject(studio: Studio, objectId: ObjectId, breakpoint: Breakpoint) {
  const sheet = getTheatreSheet(breakpoint);
  const object = getTheatreObject(objectId, breakpoint);
  studio.setSelection([sheet]);
  requestAnimationFrame(() => studio.setSelection([sheet, object]));
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getStudioInternal(): StudioInternal | null {
  if (typeof window === "undefined") return null;
  const bundle = (window as typeof window & { __TheatreJS_StudioBundle?: { _studio?: StudioInternal } }).__TheatreJS_StudioBundle;
  return bundle?._studio ?? null;
}

function ensureSheetState(projectState: TheatreProjectState, sheetId: string): TheatreSheetState {
  projectState.sheetsById[sheetId] ??= { staticOverrides: { byObject: {} } };
  const sheetState = projectState.sheetsById[sheetId]!;
  sheetState.staticOverrides ??= { byObject: {} };
  sheetState.staticOverrides.byObject ??= {};
  return sheetState;
}

function getPointerAtPath(object: ReturnType<typeof getTheatreObject>, pathToProp: string[]) {
  return pathToProp.reduce<unknown>((pointer, key) => (pointer as Record<string, unknown>)[key], object.props);
}

type KeyframesByPropPath = Array<{ pathToProp: string[]; keyframes: TheatreKeyframe[] }>;
function getTargetTrackId(
  stateEditors: TheatreStateEditors,
  targetSheetState: TheatreSheetState,
  targetAddress: Record<string, unknown>,
  targetObjectKey: string,
  pathToProp: string[],
) {
  const encodedPropPath = JSON.stringify(pathToProp);
  const targetPropAddress = { ...targetAddress, pathToProp };
  stateEditors.coreByProject.historic.sheetsById.sequence.setPrimitivePropAsSequenced(targetPropAddress);

  return targetSheetState.sequence?.tracksByObject[targetObjectKey]?.trackIdByPropPath[encodedPropPath];
}
type TheatrePropPath = {
  pathToProp: string[];
  pointer: unknown;
};

function getTheatrePropPaths(object: ReturnType<typeof getTheatreObject>): TheatrePropPath[] {
  const props = object.props as unknown as Record<string, unknown>;
  const paths: string[][] = [
    ["scale"],
    ["opacity"],
    ["visible"],
    ["anchor", "x"],
    ["anchor", "y"],
    ["position", "x"],
    ["position", "y"],
    ["position", "z"],
    ["rotation", "x"],
    ["rotation", "y"],
    ["rotation", "z"],
  ];

  if (object.props.boxAnimationProgress) paths.push(["boxAnimationProgress"]);
  if (object.props.showLogo) paths.push(["showLogo"]);

  return paths.map((pathToProp) => ({ pathToProp, pointer: getPointerAtPath(object, pathToProp) }));
}
function copyTheatreObjectTimelineState(
  studio: Studio,
  objectId: ObjectId,
  sourceBreakpoint: Breakpoint,
  targetBreakpoint: Breakpoint,
) {
  const internalStudio = getStudioInternal();
  if (!internalStudio) return false;

  const sourceSheet = getTheatreSheet(sourceBreakpoint);
  const targetSheet = getTheatreSheet(targetBreakpoint);
  const sourceObject = getTheatreObject(objectId, sourceBreakpoint);
  const targetObject = getTheatreObject(objectId, targetBreakpoint);
  const sourceAddress = sourceObject.address;
  const targetAddress = targetObject.address;
  const tracksToCopy: KeyframesByPropPath = getTheatrePropPaths(sourceObject)
    .map(({ pathToProp, pointer }) => ({
      pathToProp,
      keyframes: cloneSerializable(sourceSheet.sequence.__experimental_getKeyframes(pointer as never) as TheatreKeyframe[]),
    }))
    .filter(({ keyframes }) => keyframes.length > 0);

  internalStudio.transaction(({ drafts, stateEditors }) => {
    const projectState = drafts.historic.coreByProject[theatreProjectId];
    if (!projectState) return;

    const sourceSheetState = projectState.sheetsById[sourceSheet.address.sheetId];
    const targetSheetState = ensureSheetState(projectState, targetSheet.address.sheetId);
    targetSheetState.sequence = stateEditors.coreByProject.historic.sheetsById.sequence._ensure(targetAddress as unknown as Record<string, unknown>);

    const sourceStaticValue = sourceSheetState?.staticOverrides?.byObject?.[sourceAddress.objectKey];
    const targetStaticOverrides = targetSheetState.staticOverrides?.byObject;
    if (targetStaticOverrides) {
      if (sourceStaticValue === undefined) {
        delete targetStaticOverrides[targetAddress.objectKey];
      } else {
        targetStaticOverrides[targetAddress.objectKey] = cloneSerializable(sourceStaticValue);
      }
    }

    const sourceSequence = sourceSheetState?.sequence;
    if (sourceSequence && targetSheetState.sequence) {
      targetSheetState.sequence.length = sourceSequence.length;
      targetSheetState.sequence.subUnitsPerUnit = sourceSequence.subUnitsPerUnit;
    }

    if (targetSheetState.sequence) delete targetSheetState.sequence.tracksByObject[targetAddress.objectKey];

    tracksToCopy.forEach(({ pathToProp, keyframes }) => {
      const targetAddressRecord = targetAddress as unknown as Record<string, unknown>;
      const targetObjectKey = String(targetAddress.objectKey);
      const targetTrackId = getTargetTrackId(stateEditors, targetSheetState, targetAddressRecord, targetObjectKey, pathToProp);
      if (!targetTrackId) return;

      keyframes.forEach((keyframe) => {
        stateEditors.coreByProject.historic.sheetsById.sequence.setKeyframeAtPosition({
          ...targetAddressRecord,
          trackId: targetTrackId,
          position: keyframe.position,
          value: keyframe.value,
          handles: keyframe.handles,
          type: keyframe.type,
          snappingFunction: (position: number) => position,
        });
      });
    });
  });

  targetSheet.sequence.position = sourceSheet.sequence.position;
  return tracksToCopy.length > 0;
}

export async function showTheatreStudio(objectId: ObjectId, breakpoint: Breakpoint = "desktop") {
  const studio = await loadStudio();
  studio.ui.restore();
  selectSheetAndObject(studio, objectId, breakpoint);
}

export async function hideTheatreStudio() {
  if (!studioPromise) return;
  const studio = await studioPromise;
  studio.ui.hide();
}

export async function selectTheatreObject(objectId: ObjectId, breakpoint: Breakpoint = "desktop") {
  const studio = await loadStudio();
  selectSheetAndObject(studio, objectId, breakpoint);
}

function setTheatreProps(
  set: TheatreTransactionSet,
  object: ReturnType<typeof getTheatreObject>,
  value: Partial<TheatreObjectValue>,
) {
  if (value.anchor) set(object.props.anchor, value.anchor);
  if (value.position) set(object.props.position, value.position);
  if (value.rotation) set(object.props.rotation, value.rotation);
  if (typeof value.scale === "number") set(object.props.scale, value.scale);
  if (typeof value.opacity === "number") set(object.props.opacity, value.opacity);
  if (typeof value.visible === "boolean") set(object.props.visible, value.visible);
  if (typeof value.showLogo === "boolean" && object.props.showLogo) set(object.props.showLogo, value.showLogo);
  if (typeof value.boxAnimationProgress === "number" && object.props.boxAnimationProgress) {
    set(object.props.boxAnimationProgress, value.boxAnimationProgress);
  }
}

export async function setTheatreObjectValue(objectId: ObjectId, value: Partial<TheatreObjectValue>, breakpoint: Breakpoint = "desktop") {
  const studio = await loadStudio();
  const object = getTheatreObject(objectId, breakpoint);

  studio.transaction(({ set }) => {
    setTheatreProps(set, object, value);
  });
}

export async function copyTheatreObjectValue(objectId: ObjectId, sourceBreakpoint: Breakpoint, targetBreakpoint: Breakpoint) {
  const studio = await loadStudio();
  const sourceValue = cloneTheatreObjectValue(getTheatreObject(objectId, sourceBreakpoint).value as TheatreObjectValue);
  const targetObject = getTheatreObject(objectId, targetBreakpoint);

  if (!copyTheatreObjectTimelineState(studio, objectId, sourceBreakpoint, targetBreakpoint)) {
    studio.transaction(({ set }) => {
      setTheatreProps(set, targetObject, sourceValue);
    });
  }
}

export async function copyTheatreObjectValueToBreakpoints(objectId: ObjectId, sourceBreakpoint: Breakpoint, targetBreakpoints: Breakpoint[]) {
  const studio = await loadStudio();
  const sourceValue = cloneTheatreObjectValue(getTheatreObject(objectId, sourceBreakpoint).value as TheatreObjectValue);
  const copiedTimelineState = targetBreakpoints.map((targetBreakpoint) =>
    copyTheatreObjectTimelineState(studio, objectId, sourceBreakpoint, targetBreakpoint),
  );

  if (copiedTimelineState.every(Boolean)) return;

  studio.transaction(({ set }) => {
    targetBreakpoints.forEach((targetBreakpoint, index) => {
      if (!copiedTimelineState[index]) setTheatreProps(set, getTheatreObject(objectId, targetBreakpoint), sourceValue);
    });
  });
}

export async function exportTheatreProject() {
  const studio = await loadStudio();
  return studio.createContentOfSaveFile(theatreProjectId);
}







