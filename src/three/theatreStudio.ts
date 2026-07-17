import { cloneTheatreObjectValue, getTheatreObject, getTheatreSheet, theatreProjectId, type TheatreObjectValue } from "./theatreProject";
import { backgroundChildByParent } from "./sceneObjects";
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

const theatreOutlineStyleId = "merch-monk-theatre-outline-style";
const theatreChildFolderNames = new Set(["box", ...Object.keys(backgroundChildByParent)]);
let theatreOutlineRoot: ShadowRoot | null = null;
let theatreOutlineObserver: MutationObserver | null = null;
let theatreOutlineElement: HTMLElement | null = null;
let theatreOutlineTrack: HTMLElement | null = null;
let theatreOutlineThumb: HTMLElement | null = null;
let theatreOutlineResizeObserver: ResizeObserver | null = null;

function syncTheatreOutlineScrollbar() {
  const outline = theatreOutlineElement;
  const track = theatreOutlineTrack;
  const thumb = theatreOutlineThumb;
  if (!outline || !track || !thumb) return;

  const rect = outline.getBoundingClientRect();
  const maxScroll = Math.max(0, outline.scrollHeight - outline.clientHeight);
  if (rect.height <= 0 || maxScroll <= 1) {
    track.style.display = "none";
    return;
  }

  const trackHeight = rect.height;
  const thumbHeight = Math.max(40, trackHeight * (outline.clientHeight / outline.scrollHeight));
  const thumbTravel = Math.max(0, trackHeight - thumbHeight);
  const thumbTop = maxScroll > 0 ? (outline.scrollTop / maxScroll) * thumbTravel : 0;

  track.style.display = "block";
  track.style.left = `${Math.max(0, rect.right - 10)}px`;
  track.style.top = `${rect.top}px`;
  track.style.height = `${trackHeight}px`;
  thumb.style.height = `${thumbHeight}px`;
  thumb.style.transform = `translateY(${thumbTop}px)`;
}

function ensureTheatreOutlineTrack(root: ShadowRoot) {
  let track = root.querySelector<HTMLElement>('[data-merch-monk-outline-scrollbar="true"]');
  if (track) {
    theatreOutlineTrack = track;
    theatreOutlineThumb = track.querySelector<HTMLElement>('[data-merch-monk-outline-thumb="true"]');
    return;
  }

  track = document.createElement("div");
  track.dataset.merchMonkOutlineScrollbar = "true";
  const thumb = document.createElement("div");
  thumb.dataset.merchMonkOutlineThumb = "true";
  track.append(thumb);
  root.append(track);
  theatreOutlineTrack = track;
  theatreOutlineThumb = thumb;

  track.addEventListener("pointerdown", (event) => {
    const outline = theatreOutlineElement;
    if (!outline || event.target === thumb) return;
    const rect = track!.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(rect.height, 1)));
    outline.scrollTop = ratio * Math.max(0, outline.scrollHeight - outline.clientHeight);
  });

  thumb.addEventListener("pointerdown", (event) => {
    const outline = theatreOutlineElement;
    if (!outline) return;
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startScrollTop = outline.scrollTop;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const maxScroll = Math.max(0, outline.scrollHeight - outline.clientHeight);
      const travel = Math.max(1, track!.clientHeight - thumb.clientHeight);
      outline.scrollTop = startScrollTop + ((moveEvent.clientY - startY) / travel) * maxScroll;
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  });
}

function compactTheatreOutlineHierarchy(outline: HTMLElement) {
  const folderHeaders = Array.from(outline.querySelectorAll<HTMLElement>('[data-header="true"]')).filter((header) => {
    const label = header.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return header.classList.contains("not-selectable") && theatreChildFolderNames.has(label);
  });

  folderHeaders.forEach((header) => {
    const listItem = header.parentElement;
    const childList = listItem
      ? Array.from(listItem.children).find((child): child is HTMLUListElement => child instanceof HTMLUListElement)
      : undefined;

    if (!childList) {
      header.click();
      return;
    }

    header.dataset.merchMonkDuplicateFolderHeader = "true";
    childList.dataset.merchMonkChildList = "true";
  });
}
function bindTheatreOutline(outline: HTMLElement, root: ShadowRoot) {
  ensureTheatreOutlineTrack(root);
  if (theatreOutlineElement === outline) {
    syncTheatreOutlineScrollbar();
    return;
  }

  theatreOutlineElement?.removeEventListener("scroll", syncTheatreOutlineScrollbar);
  theatreOutlineResizeObserver?.disconnect();
  theatreOutlineElement = outline;
  outline.dataset.merchMonkOutlineScroll = "true";
  outline.addEventListener("scroll", syncTheatreOutlineScrollbar, { passive: true });
  theatreOutlineResizeObserver = new ResizeObserver(syncTheatreOutlineScrollbar);
  theatreOutlineResizeObserver.observe(outline);
  const list = outline.firstElementChild;
  if (list instanceof HTMLElement) theatreOutlineResizeObserver.observe(list);
  syncTheatreOutlineScrollbar();
}

function ensureTheatreOutlineViewport(attempt = 0) {
  if (typeof document === "undefined") return;

  const root = document.getElementById("theatrejs-studio-root")?.shadowRoot;
  if (!root) {
    if (attempt < 120) requestAnimationFrame(() => ensureTheatreOutlineViewport(attempt + 1));
    return;
  }

  if (!root.getElementById(theatreOutlineStyleId)) {
    const style = document.createElement("style");
    style.id = theatreOutlineStyleId;
    style.textContent = `
      [data-merch-monk-outline-scroll="true"] {
        max-height: calc(100dvh - 64px) !important;
        overflow-y: scroll !important;
        overscroll-behavior-y: contain;
        scrollbar-width: none;
        padding-bottom: 8px;
      }

      [data-merch-monk-outline-scroll="true"]::-webkit-scrollbar {
        width: 0;
        height: 0;
      }

      [data-merch-monk-duplicate-folder-header="true"] {
        display: none !important;
      }

      [data-merch-monk-child-list="true"] {
        margin-top: 0 !important;
      }

      [data-merch-monk-outline-scrollbar="true"] {
        position: fixed;
        display: none;
        width: 8px;
        padding: 2px;
        background: rgba(10, 10, 10, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 999px;
        box-sizing: border-box;
        pointer-events: auto;
        z-index: 2147483647;
        cursor: pointer;
      }

      [data-merch-monk-outline-thumb="true"] {
        width: 100%;
        min-height: 40px;
        background: #ff4a09;
        border-radius: 999px;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22);
        cursor: grab;
      }

      [data-merch-monk-outline-thumb="true"]:active {
        cursor: grabbing;
        background: #ff6a32;
      }
    `;
    root.append(style);
  }

  const markOutlineScrollContainer = () => {
    const outline = Array.from(root.querySelectorAll<HTMLElement>("div")).find((element) => {
      const rect = element.getBoundingClientRect();
      const overflowY = getComputedStyle(element).overflowY;
      return (
        rect.x <= 16 &&
        rect.y >= 40 &&
        rect.width >= 150 &&
        rect.width <= 360 &&
        (overflowY === "scroll" || overflowY === "auto") &&
        element.textContent?.includes(theatreProjectId)
      );
    });

    if (outline) {
      compactTheatreOutlineHierarchy(outline);
      bindTheatreOutline(outline, root);
    }
  };

  markOutlineScrollContainer();
  if (theatreOutlineRoot !== root) {
    theatreOutlineObserver?.disconnect();
    theatreOutlineRoot = root;
    theatreOutlineObserver = new MutationObserver(markOutlineScrollContainer);
    theatreOutlineObserver.observe(root, { childList: true, subtree: true });
  }
}

async function loadStudio() {
  if (!studioPromise) {
    studioPromise = import("@theatre/studio").then((module) => module.default);
  }

  const studio = await studioPromise;
  if (!initialized) {
    studio.initialize({ persistenceKey: "merch-monk-theatre-studio-neutral" });
    initialized = true;
  }
  ensureTheatreOutlineViewport();
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
  if (object.props.grid) {
    paths.push(
      ["grid", "follow"],
      ["grid", "offset", "x"],
      ["grid", "offset", "y"],
      ["grid", "scale"],
    );
  }

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
  if (value.grid && object.props.grid) set(object.props.grid, value.grid);
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

export function minifyTheatreProjectState(state: Record<string, unknown>) {
  return JSON.stringify(state);
}

export async function downloadMinifiedTheatreProject(filename = "merch-monk-home_state.json") {
  const state = await exportTheatreProject();
  const content = minifyTheatreProjectState(state);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  requestAnimationFrame(() => URL.revokeObjectURL(url));

  return { filename, bytes: blob.size };
}







