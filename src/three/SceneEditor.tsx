import { useEffect, useState } from "react";
import { breakpointLabels, breakpoints, resolveBreakpointMode, type BreakpointMode } from "./breakpoints";
import { editorStore, useEditorStore } from "./editorStore";
import { objectIds } from "./sceneObjects";
import { areTheatreObjectValuesEqual, getTheatreObject, type TheatreObjectValue } from "./theatreProject";
import {
  copyTheatreObjectValue,
  copyTheatreObjectValueToBreakpoints,
  hideTheatreStudio,
  showTheatreStudio,
} from "./theatreStudio";
import { useViewportInfo } from "./useViewportInfo";
import type { Breakpoint, ObjectId } from "./types";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

type HoverControlProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

type ResponsiveStatus = "base" | "synced" | "custom";

function HoverControl({ label, value, min, max, step, onChange }: HoverControlProps) {
  return (
    <label className="hover-gui-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <input
        className="hover-gui-number"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

const breakpointOptions: { value: BreakpointMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  ...breakpoints.map((breakpoint) => ({ value: breakpoint, label: breakpointLabels[breakpoint] })),
];

function formatObjectId(id: ObjectId) {
  return id.replace(/_/g, " ");
}

function readResponsiveStatus(objectId: ObjectId, activeBreakpoint: Breakpoint): ResponsiveStatus {
  if (activeBreakpoint === "desktop") return "base";

  const desktopValue = getTheatreObject(objectId, "desktop").value as TheatreObjectValue;
  const activeValue = getTheatreObject(objectId, activeBreakpoint).value as TheatreObjectValue;
  return areTheatreObjectValuesEqual(desktopValue, activeValue) ? "synced" : "custom";
}

function responsiveStatusLabel(status: ResponsiveStatus) {
  if (status === "base") return "Base";
  if (status === "synced") return "Matches Desktop";
  return "Custom";
}

type TheatreTreeTarget = {
  breakpoint: Breakpoint;
  objectId?: ObjectId;
};

const objectIdByTheatreLabel = new Map<string, ObjectId>(
  objectIds.flatMap((id) => {
    const aliases = new Set([id, formatObjectId(id)]);
    return Array.from(aliases, (alias) => [alias.toLowerCase(), id] as const);
  }),
);

function readShortNodeText(node: HTMLElement) {
  const text = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return text.length > 0 && text.length <= 64 ? text : "";
}

function getBreakpointFromSheetLabel(text: string): Breakpoint | null {
  if (text === "Scroll Scene: default") return "desktop";
  if (text === "Scroll Scene / tablet: default") return "tablet";
  if (text === "Scroll Scene / mobile: default") return "mobile";
  return null;
}

function isTheatreOutlinePath(path: EventTarget[]) {
  return path.some((node) => node instanceof HTMLLIElement || (node instanceof HTMLElement && node.tagName === "UL"));
}

function getBreakpointFromOutlineNodeText(text: string): Breakpoint | null {
  if (!text || !text.includes("Scroll Scene")) return null;
  if (text.includes("Scroll Scene / mobile")) return "mobile";
  if (text.includes("Scroll Scene / tablet")) return "tablet";
  if (text.includes("Scroll Scene: default")) return "desktop";
  return null;
}

function getNearestTheatreBreakpoint(path: EventTarget[]): Breakpoint | null {
  for (const node of path) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest(".hover-gui") || node.id === "root" || node === document.body || node === document.documentElement) continue;

    const exactBreakpoint = getBreakpointFromSheetLabel(readShortNodeText(node));
    if (exactBreakpoint) return exactBreakpoint;

    const outlineBreakpoint = getBreakpointFromOutlineNodeText(node.textContent?.replace(/\s+/g, " ").trim() ?? "");
    if (outlineBreakpoint) return outlineBreakpoint;
  }

  return null;
}

function getTheatreTreeTarget(event: PointerEvent): TheatreTreeTarget | null {
  const path = event.composedPath();
  const isOutlineClick = isTheatreOutlinePath(path);

  for (const node of path) {
    if (!(node instanceof HTMLElement)) continue;
    const text = readShortNodeText(node);
    if (!text) continue;

    const breakpointFromSheetLabel = getBreakpointFromSheetLabel(text);
    if (breakpointFromSheetLabel) return { breakpoint: breakpointFromSheetLabel };

    if (!isOutlineClick) continue;

    const objectId = objectIdByTheatreLabel.get(text.toLowerCase());
    if (!objectId) continue;

    const breakpoint = getNearestTheatreBreakpoint(path);
    return breakpoint ? { breakpoint, objectId } : null;
  }

  return null;
}

export function SceneEditor() {
  const editor = useEditorStore();
  const viewport = useViewportInfo();
  const activeBreakpoint = resolveBreakpointMode(editor.breakpointMode, viewport.breakpoint);
  const [responsiveStatus, setResponsiveStatus] = useState<ResponsiveStatus>(() => readResponsiveStatus(editor.selectedObject, activeBreakpoint));
  const [controlsExpanded, setControlsExpanded] = useState(true);

  useEffect(() => {
    if (editor.enabled) {
      void showTheatreStudio(editor.selectedObject, activeBreakpoint);
    } else {
      void hideTheatreStudio();
    }
  }, [activeBreakpoint, editor.enabled, editor.selectedObject]);

  useEffect(() => {
    if (!editor.enabled) return;

    function onPointerDown(event: PointerEvent) {
      const target = getTheatreTreeTarget(event);
      if (!target) return;

      const selectedObject = target.objectId ?? editor.selectedObject;
      editorStore.setSelection({ breakpointMode: target.breakpoint, selectedObject });
      void showTheatreStudio(selectedObject, target.breakpoint);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [activeBreakpoint, editor.enabled, editor.selectedObject]);
  useEffect(() => {
    function updateStatus() {
      setResponsiveStatus(readResponsiveStatus(editor.selectedObject, activeBreakpoint));
    }

    updateStatus();
    const activeObject = getTheatreObject(editor.selectedObject, activeBreakpoint);
    const unsubscribers = [activeObject.onValuesChange(updateStatus)];

    if (activeBreakpoint !== "desktop") {
      unsubscribers.push(getTheatreObject(editor.selectedObject, "desktop").onValuesChange(updateStatus));
    }

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [activeBreakpoint, editor.selectedObject]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!editor.enabled || isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === "g") {
        event.preventDefault();
        editorStore.setSelection({ mode: "translate" });
      }
      if (key === "r") {
        event.preventDefault();
        editorStore.setSelection({ mode: "rotate" });
      }
      if (key === "s") {
        event.preventDefault();
        editorStore.setSelection({ mode: "scale" });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor.enabled]);

  async function useDesktopForActiveObject() {
    if (activeBreakpoint === "desktop") return;

    const selectedObject = editor.selectedObject;
    await copyTheatreObjectValue(selectedObject, "desktop", activeBreakpoint);
    editorStore.setSelection({ breakpointMode: activeBreakpoint, selectedObject });
    await showTheatreStudio(selectedObject, activeBreakpoint);
    setResponsiveStatus(readResponsiveStatus(selectedObject, activeBreakpoint));
  }

  async function sendActiveObjectToAllBreakpoints() {
    const targetBreakpoints = breakpoints.filter((breakpoint) => breakpoint !== activeBreakpoint);
    await copyTheatreObjectValueToBreakpoints(editor.selectedObject, activeBreakpoint, targetBreakpoints);
    await showTheatreStudio(editor.selectedObject, activeBreakpoint);
    setResponsiveStatus(readResponsiveStatus(editor.selectedObject, activeBreakpoint));
  }

  return (
    <>
      {editor.enabled ? (
        <aside className={`hover-gui ${controlsExpanded ? "is-expanded" : "is-collapsed"}`} aria-label="Responsive scene controls">
          <div className="hover-gui-header">
            <span>Scene Controls</span>
            <button
              type="button"
              aria-expanded={controlsExpanded}
              aria-label={controlsExpanded ? "Collapse scene controls" : "Expand scene controls"}
              onClick={() => setControlsExpanded((next) => !next)}
            >
              {controlsExpanded ? "Hide" : "Show"}
            </button>
          </div>
          {controlsExpanded ? (
            <>
          <section className="responsive-gui" aria-label="Breakpoint controls">
            <div className="responsive-gui-title">
              <span>Breakpoint</span>
            </div>
            <div className="responsive-gui-options" role="group" aria-label="Breakpoint preview mode">
              {breakpointOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={editor.breakpointMode === option.value ? "is-active" : ""}
                  aria-pressed={editor.breakpointMode === option.value}
                  onClick={() => editorStore.setSelection({ breakpointMode: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
          <section className="responsive-gui responsive-object-gui" aria-label="Selected object controls">
            <div className="responsive-object-row">
              <span>{formatObjectId(editor.selectedObject)}</span>
              <strong className={`responsive-status is-${responsiveStatus}`}>{responsiveStatusLabel(responsiveStatus)}</strong>
            </div>
            <div className="responsive-actions">
              <button type="button" disabled={activeBreakpoint === "desktop"} onClick={useDesktopForActiveObject}>
                Use Desktop
              </button>
              <button type="button" onClick={sendActiveObjectToAllBreakpoints}>
                Send to All
              </button>
            </div>
          </section>
          <section className="hover-effect-gui" aria-label="3D hover controls">
            <div className="hover-gui-section-header">
              <span>3D Hover</span>
              <button
                type="button"
                onClick={() => editorStore.setSelection({ hoverTiltX: 0.28, hoverTiltY: 0.38, hoverFollow: 0.16, hoverRange: 1.25 })}
              >
                Reset
              </button>
            </div>
            <HoverControl
              label="Vertical"
              min={0}
              max={0.8}
              step={0.01}
              value={editor.hoverTiltX}
              onChange={(hoverTiltX) => editorStore.setSelection({ hoverTiltX })}
            />
            <HoverControl
              label="Horizontal"
              min={0}
              max={0.9}
              step={0.01}
              value={editor.hoverTiltY}
              onChange={(hoverTiltY) => editorStore.setSelection({ hoverTiltY })}
            />
            <HoverControl
              label="Range"
              min={0.35}
              max={2.2}
              step={0.01}
              value={editor.hoverRange}
              onChange={(hoverRange) => editorStore.setSelection({ hoverRange })}
            />
            <HoverControl
              label="Smooth"
              min={0.04}
              max={0.35}
              step={0.01}
              value={editor.hoverFollow}
              onChange={(hoverFollow) => editorStore.setSelection({ hoverFollow })}
            />
          </section>
            </>
          ) : null}
        </aside>
      ) : null}
      <button
        className={`theatre-studio-button ${editor.enabled ? "is-active" : ""}`}
        type="button"
        aria-pressed={editor.enabled}
        title="Toggle Theatre Studio"
        onClick={() => editorStore.setSelection({ enabled: !editor.enabled })}
      >
        Theatre
      </button>
    </>
  );
}




