import { useSyncExternalStore } from "react";
import type { BreakpointMode } from "./breakpoints";
import type { ObjectId } from "./types";

type TransformMode = "translate" | "rotate" | "scale";

export type EditorSnapshot = {
  enabled: boolean;
  markers: boolean;
  selectedObject: ObjectId;
  mode: TransformMode;
  hoverTiltX: number;
  hoverTiltY: number;
  hoverFollow: number;
  hoverRange: number;
  breakpointMode: BreakpointMode;
};

const settingsKey = "merch-monk-theatre-editor-settings";

function readSettings(): Partial<EditorSnapshot> {
  try {
    const saved = window.localStorage.getItem(settingsKey);
    return saved ? (JSON.parse(saved) as Partial<EditorSnapshot>) : {};
  } catch {
    return {};
  }
}

const savedSettings = readSettings();
let snapshot: EditorSnapshot = {
  enabled: new URLSearchParams(window.location.search).get("editor") === "true" || savedSettings.enabled === true,
  markers: savedSettings.markers ?? false,
  selectedObject: savedSettings.selectedObject ?? "cap",
  mode: savedSettings.mode ?? "translate",
  hoverTiltX: savedSettings.hoverTiltX ?? 0.28,
  hoverTiltY: savedSettings.hoverTiltY ?? 0.38,
  hoverFollow: savedSettings.hoverFollow ?? 0.16,
  hoverRange: savedSettings.hoverRange ?? 1.25,
  breakpointMode: savedSettings.breakpointMode === "auto" ? "desktop" : savedSettings.breakpointMode ?? "desktop",
};

const listeners = new Set<() => void>();

function writeSettings(next: EditorSnapshot) {
  window.localStorage.setItem(settingsKey, JSON.stringify(next, null, 2));
}

function emit(next: EditorSnapshot) {
  snapshot = next;
  writeSettings(next);
  listeners.forEach((listener) => listener());
}

export const editorStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot() {
    return snapshot;
  },
  setSelection(next: Partial<EditorSnapshot>) {
    emit({ ...snapshot, ...next });
  },
};

export function useEditorStore() {
  return useSyncExternalStore(editorStore.subscribe, editorStore.getSnapshot, editorStore.getSnapshot);
}