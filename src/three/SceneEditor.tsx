import { useEffect } from "react";
import { editorStore, useEditorStore } from "./editorStore";
import { hideTheatreStudio, showTheatreStudio } from "./theatreStudio";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
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
    <button
      className={`theatre-studio-button ${editor.enabled ? "is-active" : ""}`}
      type="button"
      aria-pressed={editor.enabled}
      title="Toggle Theatre Studio"
      onClick={() => editorStore.setSelection({ enabled: !editor.enabled })}
    >
      Theatre
    </button>
  );
}