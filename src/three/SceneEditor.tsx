import { useEffect, useRef, useState } from "react";
import { breakpointLabels, breakpoints, resolveBreakpointMode } from "./breakpoints";
import { editorStore, useEditorStore } from "./editorStore";
import { backgroundChildObjectIds, boxChildObjectIds, objectIds } from "./sceneObjects";
import { areTheatreObjectValuesEqual, getTheatreObject, theatreObjectName, type TheatreObjectValue } from "./theatreProject";
import {
  copyTheatreObjectValue,
  copyTheatreObjectValueToBreakpoints,
  hideTheatreStudio,
  showTheatreStudio,
  setTheatreObjectValue,
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

const breakpointOptions = breakpoints.map((breakpoint) => ({ value: breakpoint, label: breakpointLabels[breakpoint] }));
const anchorPresets = [
  { label: "Top left", x: 0, y: 0 },
  { label: "Top center", x: 50, y: 0 },
  { label: "Top right", x: 100, y: 0 },
  { label: "Center left", x: 0, y: 50 },
  { label: "Center", x: 50, y: 50 },
  { label: "Center right", x: 100, y: 50 },
  { label: "Bottom left", x: 0, y: 100 },
  { label: "Bottom center", x: 50, y: 100 },
  { label: "Bottom right", x: 100, y: 100 },
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value: number, step: number) {
  const precision = Math.max(0, (String(step).split(".")[1] ?? "").length);
  return Number(value.toFixed(precision));
}

function ScrubbableNumberInput({ label, value, unit, min = -300, max = 300, step = 0.1, unbounded = false, onChange }: {
  label: string;
  value: number;
  unit: string;
  min?: number;
  max?: number;
  step?: number;
  unbounded?: boolean;
  onChange: (value: number) => void;
}) {
  const scrub = useRef<{ pointerId: number; startX: number; startValue: number } | null>(null);
  const effectiveMin = unbounded ? Number.NEGATIVE_INFINITY : min;
  const effectiveMax = unbounded ? Number.POSITIVE_INFINITY : max;

  function handleScrubStart(event: React.PointerEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrub.current = { pointerId: event.pointerId, startX: event.clientX, startValue: value };
  }

  function handleScrubMove(event: React.PointerEvent<HTMLSpanElement>) {
    if (!scrub.current || scrub.current.pointerId !== event.pointerId) return;
    const scrubStep = event.shiftKey ? step * 0.1 : step;
    const nextValue = scrub.current.startValue + (event.clientX - scrub.current.startX) * scrubStep;
    onChange(roundToStep(clamp(nextValue, effectiveMin, effectiveMax), scrubStep));
  }

  function handleScrubEnd(event: React.PointerEvent<HTMLSpanElement>) {
    if (!scrub.current || scrub.current.pointerId !== event.pointerId) return;
    scrub.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <label className="responsive-number-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          min={unbounded ? undefined : min}
          max={unbounded ? undefined : max}
          step={step}
          value={Number(value.toFixed(2))}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            if (Number.isFinite(next)) onChange(next);
          }}
        />
        <span
          className="responsive-number-scrub"
          role="slider"
          aria-label={`Drag to adjust ${label}`}
          aria-valuemin={unbounded ? undefined : min}
          aria-valuemax={unbounded ? undefined : max}
          aria-valuenow={value}
          tabIndex={0}
          title={`Drag to adjust ${label}. Hold Shift for finer control.`}
          onPointerDown={handleScrubStart}
          onPointerMove={handleScrubMove}
          onPointerUp={handleScrubEnd}
          onPointerCancel={handleScrubEnd}
          onKeyDown={(event) => {
            const direction = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 0;
            if (!direction) return;
            event.preventDefault();
            const keyboardStep = event.shiftKey ? step * 0.1 : step;
            onChange(roundToStep(clamp(value + direction * keyboardStep, effectiveMin, effectiveMax), keyboardStep));
          }}
        >
          {unit}
        </span>
      </div>
    </label>
  );
}

const radiansToDegrees = (radians: number) => radians * 180 / Math.PI;
const degreesToRadians = (degrees: number) => degrees * Math.PI / 180;

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
    const aliases = new Set([id, formatObjectId(id), theatreObjectName(id)]);
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

  useEffect(() => {
    if (editor.enabled && editor.breakpointMode === "auto") editorStore.setSelection({ breakpointMode: "desktop" });
  }, [editor.breakpointMode, editor.enabled]);
  const [responsiveStatus, setResponsiveStatus] = useState<ResponsiveStatus>(() => readResponsiveStatus(editor.selectedObject, activeBreakpoint));
  const [objectValue, setObjectValue] = useState<TheatreObjectValue>(() => getTheatreObject(editor.selectedObject, activeBreakpoint).value as TheatreObjectValue);
  const [controlsExpanded, setControlsExpanded] = useState(true);
  const [expandedSections, setExpandedSections] = useState({ breakpoints: true, object: true, hover: true });

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
      setObjectValue(getTheatreObject(editor.selectedObject, activeBreakpoint).value as TheatreObjectValue);
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

  const isBoxChild = boxChildObjectIds.includes(editor.selectedObject as (typeof boxChildObjectIds)[number]);
  const isBackgroundChild = backgroundChildObjectIds.includes(editor.selectedObject as (typeof backgroundChildObjectIds)[number]);
  const isLayoutObject = !isBoxChild && !isBackgroundChild;

  function updateLayout(value: Partial<TheatreObjectValue>) {
    void setTheatreObjectValue(editor.selectedObject, value, activeBreakpoint);
  }

  function setAnchor(x: number, y: number) {
    updateLayout({
      anchor: { x, y },
      position: {
        x: objectValue.position.x + objectValue.anchor.x - x,
        y: objectValue.position.y + objectValue.anchor.y - y,
        z: objectValue.position.z,
      },
    });
  }

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
          <details
            className="scene-control-section responsive-gui"
            open={expandedSections.breakpoints}
            onToggle={(event) => {
              const open = event.currentTarget.open;
              setExpandedSections((current) => ({ ...current, breakpoints: open }));
            }}
          >
            <summary><span className="scene-section-summary-content">Breakpoint</span></summary>
            <div className="scene-section-body">
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
            </div>
          </details>
          <details
            className="scene-control-section responsive-gui responsive-object-gui"
            open={expandedSections.object}
            onToggle={(event) => {
              const open = event.currentTarget.open;
              setExpandedSections((current) => ({ ...current, object: open }));
            }}
          >
            <summary>
              <span className="scene-section-summary-content responsive-object-row">
                <span>{formatObjectId(editor.selectedObject)}</span>
                <strong className={"responsive-status is-" + responsiveStatus}>{responsiveStatusLabel(responsiveStatus)}</strong>
              </span>
            </summary>
            <div className="scene-section-body">
              {isLayoutObject ? (
                <div className="responsive-layout-controls">
                  <div className="responsive-viewport-size">{viewport.width} &times; {viewport.height}px</div>
                  <div className="responsive-anchor-actions-row">
                    <div className="responsive-anchor-control">
                    <span>Anchor</span>
                    <div className="responsive-anchor-grid" role="group" aria-label="Screen anchor">
                      {anchorPresets.map((preset) => {
                        const active = Math.abs(objectValue.anchor.x - preset.x) < 0.01 && Math.abs(objectValue.anchor.y - preset.y) < 0.01;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            className={active ? "is-active" : ""}
                            aria-label={preset.label}
                            title={preset.label}
                            aria-pressed={active}
                            onClick={() => setAnchor(preset.x, preset.y)}
                          >
                            <span />
                          </button>
                        );
                      })}
                      </div>
                    </div>
                    <div className="responsive-actions responsive-anchor-actions">
                      <button type="button" disabled={activeBreakpoint === "desktop"} onClick={useDesktopForActiveObject}>Use Desktop</button>
                      <button type="button" onClick={sendActiveObjectToAllBreakpoints}>Send to All</button>
                    </div>
                  </div>
                  <div className="responsive-transform-fields">
                    <span className="responsive-control-label">Transform</span>
                    <div className="responsive-transform-row">
                      <ScrubbableNumberInput label="X" unit="%" value={objectValue.position.x} onChange={(x) => updateLayout({ position: { ...objectValue.position, x } })} />
                      <ScrubbableNumberInput label="Y" unit="%" value={objectValue.position.y} onChange={(y) => updateLayout({ position: { ...objectValue.position, y } })} />
                      <ScrubbableNumberInput label="Scale" unit="%" value={objectValue.scale} min={0} onChange={(scale) => updateLayout({ scale })} />
                    </div>
                    <div className="responsive-transform-row">
                      <ScrubbableNumberInput
                      label="Rot X"
                      unit="deg"
                      value={radiansToDegrees(objectValue.rotation.x)}
                      unbounded
                      step={1}
                      onChange={(degrees) => updateLayout({ rotation: { ...objectValue.rotation, x: degreesToRadians(degrees) } })}
                    />
                    <ScrubbableNumberInput
                      label="Rot Y"
                      unit="deg"
                      value={radiansToDegrees(objectValue.rotation.y)}
                      unbounded
                      step={1}
                      onChange={(degrees) => updateLayout({ rotation: { ...objectValue.rotation, y: degreesToRadians(degrees) } })}
                    />
                    <ScrubbableNumberInput
                      label="Rot Z"
                      unit="deg"
                      value={radiansToDegrees(objectValue.rotation.z)}
                      unbounded
                      step={1}
                        onChange={(degrees) => updateLayout({ rotation: { ...objectValue.rotation, z: degreesToRadians(degrees) } })}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="responsive-local-transform-note">{isBoxChild ? "Local box transform" : "Local background child transform"}</div>
                  <div className="responsive-actions">
                    <button type="button" disabled={activeBreakpoint === "desktop"} onClick={useDesktopForActiveObject}>Use Desktop</button>
                    <button type="button" onClick={sendActiveObjectToAllBreakpoints}>Send to All</button>
                  </div>
                </>
              )}
            </div>
          </details>
          <details
            className="scene-control-section hover-effect-gui"
            open={expandedSections.hover}
            onToggle={(event) => {
              const open = event.currentTarget.open;
              setExpandedSections((current) => ({ ...current, hover: open }));
            }}
          >
            <summary><span className="scene-section-summary-content">3D Hover</span></summary>
            <button
              className="hover-reset-button"
              type="button"
              onClick={() => editorStore.setSelection({ hoverTiltX: 0.28, hoverTiltY: 0.38, hoverFollow: 0.16, hoverRange: 1.25 })}
            >
              Reset
            </button>
            <div className="scene-section-body hover-effect-controls">
              <HoverControl label="Vertical" min={0} max={0.8} step={0.01} value={editor.hoverTiltX} onChange={(hoverTiltX) => editorStore.setSelection({ hoverTiltX })} />
              <HoverControl label="Horizontal" min={0} max={0.9} step={0.01} value={editor.hoverTiltY} onChange={(hoverTiltY) => editorStore.setSelection({ hoverTiltY })} />
              <HoverControl label="Range" min={0.35} max={2.2} step={0.01} value={editor.hoverRange} onChange={(hoverRange) => editorStore.setSelection({ hoverRange })} />
              <HoverControl label="Smooth" min={0.04} max={0.35} step={0.01} value={editor.hoverFollow} onChange={(hoverFollow) => editorStore.setSelection({ hoverFollow })} />
            </div>
          </details>
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




