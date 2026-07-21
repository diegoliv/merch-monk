import type { IExtension } from "@theatre/studio";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { breakpointLabels, breakpoints, resolveBreakpointMode } from "./breakpoints";
import { editorStore, useEditorStore } from "./editorStore";
import { backgroundChildObjectIds, boxChildObjectIds, objectIds } from "./sceneObjects";
import { getTheatreObject, theatreObjectName, type TheatreObjectValue } from "./theatreProject";
import {
  copyTheatreObjectValue,
  copyTheatreObjectValueToBreakpoints,
  downloadMinifiedTheatreProject,
  getTheatreStudio,
  hideTheatreStudio,
  saveTheatreProductionPreview,
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

type CopyTarget = Breakpoint | "all" | "";
type CopyNotice = { kind: "success" | "error"; message: string } | null;

function HoverControl({ label, value, min, max, step, onChange }: HoverControlProps) {
  const percentage = ((value - min) / (max - min)) * 100;
  return (
    <label className="mm-editor-hover-row">
      <span>{label}</span>
      <span className="mm-editor-slider-field">
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          style={{ background: `linear-gradient(90deg, rgba(48, 101, 112, .95) 0 ${percentage}%, rgba(255,255,255,.065) ${percentage}% 100%)` }}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
        <output>{value.toFixed(2).replace(".", ",")}</output>
      </span>
    </label>
  );
}

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

function formatObjectId(id: string) {
  return id.replace(/_/g, " ");
}

const breakpointIcons: Record<Breakpoint, string> = {
  desktop: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2.5" y="3.5" width="19" height="13" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 20.5h8M12 16.5v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  tablet: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5.5" y="2.5" width="13" height="19" rx="2" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="18.5" r=".8" fill="currentColor"/></svg>`,
  mobile: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="7.5" y="2.5" width="9" height="19" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 5h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="18.5" r=".75" fill="currentColor"/></svg>`,
};

const utilitiesIcon = `<svg data-merch-monk-utilities-trigger="true" viewBox="0 0 24 24" fill="none" role="img"><title>Utilities</title><path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h8M16 17h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="16" cy="7" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="9" cy="12" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="14" cy="17" r="2" stroke="currentColor" stroke-width="1.5"/></svg>`;

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
    if (node.closest('[data-merch-monk-utilities="true"]') || node.id === "root" || node === document.body || node === document.documentElement) continue;

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

type EditorActionState = {
  busy: "export" | "preview" | null;
  message: string;
  kind: "idle" | "success" | "error";
};

const editorActionListeners = new Set<() => void>();
let editorActionState: EditorActionState = { busy: null, message: "", kind: "idle" };

const editorActionStore = {
  subscribe(listener: () => void) {
    editorActionListeners.add(listener);
    return () => editorActionListeners.delete(listener);
  },
  getSnapshot() {
    return editorActionState;
  },
  set(next: EditorActionState) {
    editorActionState = next;
    editorActionListeners.forEach((listener) => listener());
  },
};

function useEditorActionState() {
  return useSyncExternalStore(editorActionStore.subscribe, editorActionStore.getSnapshot, editorActionStore.getSnapshot);
}

async function exportProjectFromToolbar() {
  if (editorActionStore.getSnapshot().busy) return;
  editorActionStore.set({ busy: "export", message: "Exporting Theatre state...", kind: "idle" });

  try {
    const result = await downloadMinifiedTheatreProject();
    editorActionStore.set({
      busy: null,
      message: `${(result.bytes / 1024).toFixed(1)} KB - TheatreJS-compatible JSON`,
      kind: "success",
    });
  } catch (error) {
    console.error("Could not export the minified Theatre project.", error);
    editorActionStore.set({ busy: null, message: "Export failed. Check the console.", kind: "error" });
  }
}

async function previewProjectFromToolbar() {
  if (editorActionStore.getSnapshot().busy) return;
  const previewWindow = window.open("about:blank", "_blank");
  editorActionStore.set({ busy: "preview", message: "Preparing production preview...", kind: "idle" });

  try {
    const result = await saveTheatreProductionPreview();
    if (!previewWindow) throw new Error("The production preview window was blocked by the browser.");

    previewWindow.opener = null;
    previewWindow.location.replace(result.url);
    editorActionStore.set({
      busy: null,
      message: `${(result.bytes / 1024).toFixed(1)} KB - Local state opened in production`,
      kind: "success",
    });
  } catch (error) {
    previewWindow?.close();
    console.error("Could not open the Theatre production preview.", error);
    editorActionStore.set({ busy: null, message: "Preview failed. Check popups or the console.", kind: "error" });
  }
}

const merchMonkEditorExtensionId = "merch-monk-editor-tools";
const merchMonkEditorPaneClass = "Merch Monk utilities";
let merchMonkEditorExtensionPromise: Promise<void> | null = null;
let merchMonkEditorPaneMounted = false;
let merchMonkEditorPaneVisible = false;
let merchMonkEditorPaneWrapper: HTMLElement | null = null;

function activeToolbarBreakpoint(): Breakpoint {
  const mode = editorStore.getSnapshot().breakpointMode;
  return mode === "auto" ? "desktop" : mode;
}

function markUtilitiesToolbarButton(attempt = 0) {
  const root = document.getElementById("theatrejs-studio-root")?.shadowRoot;
  const trigger = root?.querySelector('svg[data-merch-monk-utilities-trigger="true"]')?.closest("button");
  if (trigger) {
    trigger.setAttribute("aria-label", "Utilities");
    trigger.setAttribute("data-merch-monk-utilities-trigger", "true");
    return;
  }
  if (attempt < 20) requestAnimationFrame(() => markUtilitiesToolbarButton(attempt + 1));
}

function setMerchMonkEditorPaneVisible(visible: boolean) {
  merchMonkEditorPaneVisible = visible;
  if (merchMonkEditorPaneWrapper) {
    merchMonkEditorPaneWrapper.dataset.merchMonkUtilitiesVisible = visible ? "true" : "false";
    merchMonkEditorPaneWrapper.style.display = visible ? "flex" : "none";
  }
}

function toggleMerchMonkEditorPane(studio: Awaited<ReturnType<typeof getTheatreStudio>>) {
  if (merchMonkEditorPaneMounted && merchMonkEditorPaneWrapper) {
    const isVisible = merchMonkEditorPaneWrapper.dataset.merchMonkUtilitiesVisible === "true";
    setMerchMonkEditorPaneVisible(!isVisible);
    return;
  }

  setMerchMonkEditorPaneVisible(true);
  studio.createPane(merchMonkEditorPaneClass);
}

const merchMonkEditorExtension: IExtension = {
  id: merchMonkEditorExtensionId,
  panes: [{
    class: merchMonkEditorPaneClass,
    mount: ({ node }) => {
      merchMonkEditorPaneMounted = true;
      merchMonkEditorPaneWrapper = node.parentElement;
      if (merchMonkEditorPaneWrapper) {
        merchMonkEditorPaneWrapper.dataset.merchMonkUtilitiesVisible = merchMonkEditorPaneVisible ? "true" : "false";
        merchMonkEditorPaneWrapper.style.display = merchMonkEditorPaneVisible ? "flex" : "none";
      }
      node.dataset.merchMonkUtilities = "true";
      const root = createRoot(node);
      root.render(<TheatreUtilitiesPane />);

      return () => {
        merchMonkEditorPaneMounted = false;
        merchMonkEditorPaneVisible = false;
        merchMonkEditorPaneWrapper = null;
        root.unmount();
      };
    },
  }],
  toolbars: {
    global: (set, studio) => {
      const update = () => {
        const activeBreakpoint = activeToolbarBreakpoint();
        set([
          {
            type: "Switch",
            value: activeBreakpoint,
            onChange: (breakpoint) => editorStore.setSelection({ breakpointMode: breakpoint as Breakpoint }),
            options: breakpoints.map((breakpoint) => ({
              value: breakpoint,
              label: breakpointLabels[breakpoint],
              svgSource: breakpointIcons[breakpoint],
            })),
          },
          {
            type: "Icon",
            title: "Utilities",
            svgSource: utilitiesIcon,
            onClick: () => toggleMerchMonkEditorPane(studio),
          },
        ]);
        requestAnimationFrame(() => markUtilitiesToolbarButton());
      };

      const unsubscribeEditor = editorStore.subscribe(update);
      update();
      return () => {
        unsubscribeEditor();
      };
    },
  },
};

async function ensureMerchMonkEditorExtension() {
  if (!merchMonkEditorExtensionPromise) {
    merchMonkEditorExtensionPromise = getTheatreStudio()
      .then((studio) => {
        studio.extend(merchMonkEditorExtension, { __experimental_reconfigure: true });
      })
      .catch((error) => {
        merchMonkEditorExtensionPromise = null;
        throw error;
      });
  }

  return merchMonkEditorExtensionPromise;
}

const theatrePropsAnchorStyleId = "merch-monk-theatre-props-anchor-style";
let theatrePropsAnchorShadowRoot: ShadowRoot | null = null;
let theatrePropsAnchorObserver: MutationObserver | null = null;
let theatrePropsAnchorHost: HTMLElement | null = null;
let theatrePropsAnchorReactRoot: Root | null = null;
let theatrePropsAnchorFrame = 0;

const theatrePropsAnchorStyles = `
  [data-merch-monk-props-anchor="true"],
  [data-merch-monk-props-anchor="true"] * { box-sizing: border-box; }
  [data-merch-monk-props-anchor="true"] {
    display: grid;
    width: 168px;
    margin: 0 0 7px 112px;
    padding: 0 8px 0 2px;
    color: rgba(255,255,255,.82);
  }
  .mm-props-anchor-content { display: contents; }
  .mm-props-anchor-grid {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(3, minmax(0,1fr));
    grid-template-rows: repeat(3, 23px);
    gap: 2px;
  }
  .mm-props-anchor-button {
    display: grid;
    width: 100%;
    height: 23px;
    place-items: center;
    border: 0;
    border-radius: 2px;
    padding: 0;
    color: inherit;
    background: rgba(255,255,255,.035);
    cursor: pointer;
  }
  .mm-props-anchor-button::after {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(255,255,255,.48);
    content: "";
  }
  .mm-props-anchor-button:hover { background: rgba(45,85,97,.55); }
  .mm-props-anchor-button.is-active { background: rgb(45,85,97); }
  .mm-props-anchor-button.is-active::after { background: white; }
  [data-merch-monk-props-anchor="true"] :focus-visible { outline: 1px solid rgba(255,255,255,.7); outline-offset: 1px; }
`;

function getTheatrePropsAnchorWrapper(root: ShadowRoot) {
  const detailPanel = root.querySelector<HTMLElement>('[data-testid="DetailPanel-Object"]');
  if (!detailPanel) return null;
  const anchorLabel = Array.from(detailPanel.querySelectorAll("span")).find(
    (element) => element.textContent?.trim().toLowerCase() === "anchor",
  );
  return anchorLabel?.parentElement?.parentElement?.parentElement?.parentElement ?? null;
}

function syncTheatrePropsAnchorControl() {
  const shadowRoot = theatrePropsAnchorShadowRoot;
  if (!shadowRoot) return;

  const wrapper = getTheatrePropsAnchorWrapper(shadowRoot);
  if (!wrapper) return;

  let host = wrapper.querySelector<HTMLElement>('[data-merch-monk-props-anchor="true"]');
  if (!host) {
    host = document.createElement("div");
    host.dataset.merchMonkPropsAnchor = "true";
    wrapper.append(host);
  }

  if (theatrePropsAnchorHost === host && theatrePropsAnchorReactRoot) return;
  theatrePropsAnchorReactRoot?.unmount();
  theatrePropsAnchorHost = host;
  theatrePropsAnchorReactRoot = createRoot(host);
  theatrePropsAnchorReactRoot.render(<TheatrePropsAnchorControl />);
}

function scheduleTheatrePropsAnchorControl() {
  if (theatrePropsAnchorFrame) return;
  theatrePropsAnchorFrame = requestAnimationFrame(() => {
    theatrePropsAnchorFrame = 0;
    syncTheatrePropsAnchorControl();
  });
}

function ensureTheatrePropsAnchorControl(attempt = 0) {
  const shadowRoot = document.getElementById("theatrejs-studio-root")?.shadowRoot;
  if (!shadowRoot) {
    if (attempt < 120) requestAnimationFrame(() => ensureTheatrePropsAnchorControl(attempt + 1));
    return;
  }

  if (!shadowRoot.querySelector(`#${theatrePropsAnchorStyleId}`)) {
    const style = document.createElement("style");
    style.id = theatrePropsAnchorStyleId;
    style.textContent = theatrePropsAnchorStyles;
    shadowRoot.append(style);
  }

  if (theatrePropsAnchorShadowRoot !== shadowRoot) {
    theatrePropsAnchorObserver?.disconnect();
    theatrePropsAnchorShadowRoot = shadowRoot;
    theatrePropsAnchorObserver = new MutationObserver(scheduleTheatrePropsAnchorControl);
    theatrePropsAnchorObserver.observe(shadowRoot, { childList: true, subtree: true });
  }
  scheduleTheatrePropsAnchorControl();
}

const theatreEditorPaneStyles = `
  [data-testid^="theatre-pane-wrapper-Merch Monk utilities"] button[title="Close Pane"] { display: none !important; }
  [data-testid^="theatre-pane-wrapper-Merch Monk utilities"][data-merch-monk-utilities-visible="false"] { display: none !important; }
  [data-testid^="theatre-pane-wrapper-Merch Monk utilities"] { max-width: min(400px, calc(100vw - 24px)); max-height: min(470px, calc(100vh - 24px)); }
  .mm-editor-pane,
  .mm-editor-pane * { box-sizing: border-box; }
  .mm-editor-pane {
    position: relative;
    min-width: 280px;
    height: 100%;
    overflow: auto;
    padding: 12px;
    color: rgba(255,255,255,.92);
    background: #1d1d1d;
    font: 600 12px/1.35 Inter, ui-sans-serif, system-ui, sans-serif;
  }
  .mm-editor-pane button,
  .mm-editor-pane select,
  .mm-editor-pane input { font: inherit; }
  .mm-editor-section { display: grid; gap: 9px; padding: 13px 0; border-bottom: 1px solid rgba(255,255,255,.08); }
  .mm-editor-section:first-of-type { padding-top: 3px; }
  .mm-editor-section:last-of-type { border-bottom: 0; }
  .mm-editor-section-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: rgba(255,255,255,.58); font-size: 10px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
  .mm-editor-hint { margin: 0; color: rgba(255,255,255,.48); font-size: 11px; line-height: 1.45; }
  .mm-editor-object { overflow: hidden; color: rgba(255,255,255,.9); font-size: 11px; font-weight: 800; letter-spacing: 0; text-overflow: ellipsis; text-transform: none; white-space: nowrap; }
  .mm-editor-transfer { display: grid; gap: 7px; }
  .mm-editor-transfer-fields { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 6px; }
  .mm-editor-transfer-fields label { display: grid; min-width: 0; gap: 4px; }
  .mm-editor-transfer-fields span { color: rgba(255,255,255,.5); font-size: 10px; font-weight: 700; }
  .mm-editor-transfer-fields select,
  .mm-editor-copy,
  .mm-editor-reset { min-width: 0; min-height: 30px; border: 0; border-radius: 3px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
  .mm-editor-transfer-fields select { width: 100%; padding: 0 7px; color: rgba(255,255,255,.9); background: rgba(255,255,255,.065); }
  .mm-editor-transfer-fields select option { color: #111; background: white; }
  .mm-editor-copy,
  .mm-editor-reset { padding: 0 9px; color: rgba(255,255,255,.84); background: rgba(255,255,255,.075); font-weight: 700; cursor: pointer; }
  .mm-editor-copy:not(:disabled) { background: rgb(48,101,112); box-shadow: none; }
  .mm-editor-copy:hover:not(:disabled),
  .mm-editor-reset:hover { background: rgba(255,255,255,.13); }
  .mm-editor-copy:disabled { opacity: .38; cursor: not-allowed; }
  .mm-editor-notice { min-height: 16px; color: rgba(255,255,255,.58); font-size: 11px; }
  .mm-editor-notice.is-error { color: #ff9b76; }
  .mm-editor-hover-row { display: grid; grid-template-columns: 72px minmax(0,1fr); align-items: center; gap: 7px; }
  .mm-editor-hover-row > span:first-child { color: rgba(255,255,255,.58); font-size: 11px; font-weight: 600; }
  .mm-editor-slider-field { position: relative; display: block; min-width: 0; height: 28px; }
  .mm-editor-slider-field input[type="range"] { appearance: none; width: 100%; height: 28px; margin: 0; border: 0; border-radius: 2px; cursor: ew-resize; }
  .mm-editor-slider-field input[type="range"]::-webkit-slider-thumb { appearance: none; width: 3px; height: 28px; border: 0; background: rgba(255,255,255,.55); cursor: ew-resize; }
  .mm-editor-slider-field input[type="range"]::-moz-range-thumb { width: 3px; height: 28px; border: 0; border-radius: 0; background: rgba(255,255,255,.55); cursor: ew-resize; }
  .mm-editor-slider-field output { position: absolute; top: 0; right: 7px; display: grid; height: 28px; align-items: center; color: rgba(255,255,255,.9); font-size: 11px; font-variant-numeric: tabular-nums; pointer-events: none; }
  .mm-editor-actions { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 5px; padding-top: 12px; }
  .mm-editor-actions button { min-width: 0; min-height: 30px; border: 0; border-radius: 3px; padding: 0 7px; color: rgba(255,255,255,.72); background: rgba(255,255,255,.065); box-shadow: inset 0 0 0 1px rgba(255,255,255,.07); font-size: 10px; font-weight: 700; cursor: pointer; }
  .mm-editor-actions button:hover { color: white; background: rgba(255,255,255,.12); }
  .mm-editor-actions button:disabled { opacity: .38; cursor: not-allowed; }
  .mm-editor-action-status { margin: 10px 0 0; color: rgba(255,255,255,.52); font-size: 11px; }
  .mm-editor-action-status.is-success { color: #aee6c3; }
  .mm-editor-action-status.is-error { color: #ff9b76; }
  .mm-editor-pane :focus-visible { outline: 1px solid rgba(255,255,255,.7); outline-offset: 1px; }
`;

function TheatrePropsAnchorControl() {
  const editor = useEditorStore();
  const viewport = useViewportInfo();
  const activeBreakpoint = resolveBreakpointMode(editor.breakpointMode, viewport.breakpoint);
  const [objectValue, setObjectValue] = useState<TheatreObjectValue>(() => getTheatreObject(editor.selectedObject, activeBreakpoint).value as TheatreObjectValue);
  const contentRef = useRef<HTMLDivElement>(null);
  const isBoxChild = boxChildObjectIds.includes(editor.selectedObject as (typeof boxChildObjectIds)[number]);
  const isBackgroundChild = backgroundChildObjectIds.includes(editor.selectedObject as (typeof backgroundChildObjectIds)[number]);
  const isLayoutObject = !isBoxChild && !isBackgroundChild;

  useEffect(() => {
    const object = getTheatreObject(editor.selectedObject, activeBreakpoint);
    function updateValue() {
      setObjectValue(getTheatreObject(editor.selectedObject, activeBreakpoint).value as TheatreObjectValue);
    }
    updateValue();
    return object.onValuesChange(updateValue);
  }, [activeBreakpoint, editor.selectedObject]);

  useEffect(() => {
    const host = contentRef.current?.parentElement;
    if (host) host.style.display = isLayoutObject ? "grid" : "none";
    return () => {
      if (host) host.style.display = "none";
    };
  }, [isLayoutObject]);

  function setAnchor(x: number, y: number) {
    void setTheatreObjectValue(editor.selectedObject, {
      anchor: { x, y },
      position: {
        x: objectValue.position.x + objectValue.anchor.x - x,
        y: objectValue.position.y + objectValue.anchor.y - y,
        z: objectValue.position.z,
      },
    }, activeBreakpoint);
  }

  return (
    <div ref={contentRef} className="mm-props-anchor-content">
      <div className="mm-props-anchor-grid" role="group" aria-label="Screen anchor">
        {anchorPresets.map((preset) => {
          const active = Math.abs(objectValue.anchor.x - preset.x) < 0.01 && Math.abs(objectValue.anchor.y - preset.y) < 0.01;
          return (
            <button
              key={preset.label}
              type="button"
              className={`mm-props-anchor-button ${active ? "is-active" : ""}`}
              aria-label={preset.label}
              title={preset.label}
              aria-pressed={active}
              onClick={() => setAnchor(preset.x, preset.y)}
            />
          );
        })}
      </div>
    </div>
  );
}

function TheatreUtilitiesPane() {
  const editor = useEditorStore();
  const viewport = useViewportInfo();
  const activeBreakpoint = resolveBreakpointMode(editor.breakpointMode, viewport.breakpoint);
  const actionStatus = useEditorActionState();
  const [copySource, setCopySource] = useState<Breakpoint>(activeBreakpoint);
  const [copyTarget, setCopyTarget] = useState<CopyTarget>("");
  const [copyNotice, setCopyNotice] = useState<CopyNotice>(null);
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    setCopySource(activeBreakpoint);
    setCopyTarget("");
    setCopyNotice(null);
  }, [activeBreakpoint, editor.selectedObject]);

  async function copyBreakpointState(sourceBreakpoint: Breakpoint, targetBreakpoints: Breakpoint[]) {
    if (targetBreakpoints.length === 0 || targetBreakpoints.includes(sourceBreakpoint)) return;

    const selectedObject = editor.selectedObject;
    setIsCopying(true);
    setCopyNotice(null);

    try {
      if (targetBreakpoints.length === 1) {
        await copyTheatreObjectValue(selectedObject, sourceBreakpoint, targetBreakpoints[0]);
      } else {
        await copyTheatreObjectValueToBreakpoints(selectedObject, sourceBreakpoint, targetBreakpoints);
      }

      await showTheatreStudio(selectedObject, activeBreakpoint);
      const targets = targetBreakpoints.map((breakpoint) => breakpointLabels[breakpoint]).join(" + ");
      setCopyNotice({
        kind: "success",
        message: `${breakpointLabels[sourceBreakpoint]} -> ${targets} copied`,
      });
    } catch (error) {
      console.error("Could not copy the Theatre object between breakpoints.", error);
      setCopyNotice({ kind: "error", message: "Copy failed. Check the console." });
    } finally {
      setIsCopying(false);
    }
  }

  function copySelectedBreakpoints() {
    if (!copyTarget) return;
    const targetBreakpoints = copyTarget === "all"
      ? breakpoints.filter((breakpoint) => breakpoint !== copySource)
      : [copyTarget];
    void copyBreakpointState(copySource, targetBreakpoints);
  }

  function closeEditor() {
    setMerchMonkEditorPaneVisible(false);
    editorStore.setSelection({ enabled: false });
  }

  const transferControls = (
    <div className="mm-editor-transfer">
      <div className="mm-editor-transfer-fields">
        <label>
          <span>From</span>
          <select
            aria-label="Copy from breakpoint"
            value={copySource}
            disabled={isCopying}
            onChange={(event) => {
              const nextSource = event.currentTarget.value as Breakpoint;
              setCopySource(nextSource);
              if (copyTarget === nextSource) setCopyTarget("");
            }}
          >
            {breakpoints.map((breakpoint) => (
              <option key={breakpoint} value={breakpoint}>{breakpointLabels[breakpoint]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>To</span>
          <select
            aria-label="Copy to breakpoint"
            value={copyTarget}
            disabled={isCopying}
            onChange={(event) => setCopyTarget(event.currentTarget.value as CopyTarget)}
          >
            <option value="">Choose</option>
            {breakpoints.filter((breakpoint) => breakpoint !== copySource).map((breakpoint) => (
              <option key={breakpoint} value={breakpoint}>{breakpointLabels[breakpoint]}</option>
            ))}
            <option value="all">All others</option>
          </select>
        </label>
      </div>
      <button className="mm-editor-copy" type="button" disabled={isCopying || !copyTarget || copyTarget === copySource} onClick={copySelectedBreakpoints}>
        {isCopying ? "Copying..." : "Copy"}
      </button>
      {copyNotice ? (
        <div className={`mm-editor-notice is-${copyNotice.kind}`} role="status" aria-live="polite">
          {copyNotice.message}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="mm-editor-pane" data-merch-monk-utilities="true">
      <style>{theatreEditorPaneStyles}</style>

      <section className="mm-editor-section">
        <div className="mm-editor-section-title">
          <span>Copy object + timeline</span>
          <strong className="mm-editor-object">{formatObjectId(theatreObjectName(editor.selectedObject))}</strong>
        </div>
        {transferControls}
      </section>

      <section className="mm-editor-section">
        <div className="mm-editor-section-title">
          <span>3D Hover</span>
          <button
            className="mm-editor-reset"
            type="button"
            onClick={() => editorStore.setSelection({ hoverTiltX: 0.28, hoverTiltY: 0.38, hoverFollow: 0.16, hoverRange: 1.25 })}
          >
            Reset
          </button>
        </div>
        <p className="mm-editor-hint">Global preview behavior. These values are not part of the Theatre timeline.</p>
        <HoverControl label="Vertical" min={0} max={0.8} step={0.01} value={editor.hoverTiltX} onChange={(hoverTiltX) => editorStore.setSelection({ hoverTiltX })} />
        <HoverControl label="Horizontal" min={0} max={0.9} step={0.01} value={editor.hoverTiltY} onChange={(hoverTiltY) => editorStore.setSelection({ hoverTiltY })} />
        <HoverControl label="Range" min={0.35} max={2.2} step={0.01} value={editor.hoverRange} onChange={(hoverRange) => editorStore.setSelection({ hoverRange })} />
        <HoverControl label="Smooth" min={0.04} max={0.35} step={0.01} value={editor.hoverFollow} onChange={(hoverFollow) => editorStore.setSelection({ hoverFollow })} />
      </section>

      <div className="mm-editor-actions" aria-label="Editor actions">
        <button type="button" disabled={actionStatus.busy !== null} onClick={() => void previewProjectFromToolbar()}>Preview</button>
        <button type="button" disabled={actionStatus.busy !== null} onClick={() => void exportProjectFromToolbar()}>Export JSON</button>
        <button type="button" onClick={closeEditor}>Close editor</button>
      </div>

      {actionStatus.message ? (
        <p className={`mm-editor-action-status is-${actionStatus.kind}`} role="status" aria-live="polite">
          {actionStatus.message}
        </p>
      ) : null}
    </div>
  );
}

export function SceneEditor() {
  const editor = useEditorStore();
  const viewport = useViewportInfo();
  const activeBreakpoint = resolveBreakpointMode(editor.breakpointMode, viewport.breakpoint);

  useEffect(() => {
    if (editor.enabled && editor.breakpointMode === "auto") editorStore.setSelection({ breakpointMode: "desktop" });
  }, [editor.breakpointMode, editor.enabled]);

  useEffect(() => {
    let cancelled = false;

    if (editor.enabled) {
      void ensureMerchMonkEditorExtension()
        .then(async () => {
          if (cancelled) return;
          await showTheatreStudio(editor.selectedObject, activeBreakpoint);
          if (!cancelled) ensureTheatrePropsAnchorControl();
        })
        .catch((error) => console.error("Could not initialize the Merch Monk Theatre workspace.", error));
    } else {
      void hideTheatreStudio();
    }

    return () => {
      cancelled = true;
    };
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
  }, [editor.enabled, editor.selectedObject]);

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

  if (editor.enabled) return null;

  return createPortal(
    <button
      className="theatre-studio-button"
      type="button"
      title="Open Theatre editor"
      onClick={() => editorStore.setSelection({ enabled: true })}
    >
      Edit motion
    </button>,
    document.body,
  );
}
