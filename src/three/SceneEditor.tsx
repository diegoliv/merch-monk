import { useEffect } from "react";
import { editorStore, useEditorStore } from "./editorStore";
import { hideTheatreStudio, showTheatreStudio } from "./theatreStudio";

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

export function SceneEditor() {
  const editor = useEditorStore();

  useEffect(() => {
    if (editor.enabled) {
      void showTheatreStudio(editor.selectedObject);
    } else {
      void hideTheatreStudio();
    }
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

  return (
    <>
      {editor.enabled ? (
        <aside className="hover-gui" aria-label="3D hover controls">
          <div className="hover-gui-header">
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