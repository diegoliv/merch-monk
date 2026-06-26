import { getTheatreObject, theatreProjectId, theatreSheet, type TheatreObjectValue } from "./theatreProject";
import type { ObjectId } from "./types";

type Studio = typeof import("@theatre/studio").default;

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

export async function showTheatreStudio(objectId: ObjectId) {
  const studio = await loadStudio();
  studio.ui.restore();
  studio.setSelection([theatreSheet, getTheatreObject(objectId)]);
}

export async function hideTheatreStudio() {
  if (!studioPromise) return;
  const studio = await studioPromise;
  studio.ui.hide();
}

export async function selectTheatreObject(objectId: ObjectId) {
  const studio = await loadStudio();
  studio.setSelection([theatreSheet, getTheatreObject(objectId)]);
}

export async function setTheatreObjectValue(objectId: ObjectId, value: Partial<TheatreObjectValue>) {
  const studio = await loadStudio();
  const object = getTheatreObject(objectId);

  studio.transaction(({ set }) => {
    if (value.anchor) set(object.props.anchor, value.anchor);
    if (value.position) set(object.props.position, value.position);
    if (value.rotation) set(object.props.rotation, value.rotation);
    if (typeof value.scale === "number") set(object.props.scale, value.scale);
    if (typeof value.opacity === "number") set(object.props.opacity, value.opacity);
    if (typeof value.visible === "boolean") set(object.props.visible, value.visible);
  });
}

export async function exportTheatreProject() {
  const studio = await loadStudio();
  return studio.createContentOfSaveFile(theatreProjectId);
}