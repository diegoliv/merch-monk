import {
  ArrowClockwise,
  ArrowsOutCardinal,
  BoundingBox,
  CornersOut,
  CrosshairSimple,
} from "@phosphor-icons/react";
import type { TransformMode } from "./studioTypes";

type FloatingToolbarProps = {
  mode: TransformMode;
  onModeChange: (mode: TransformMode) => void;
  onFrame: () => void;
  onResetView: () => void;
};

const tools = [
  { mode: "translate" as const, label: "Move", Icon: ArrowsOutCardinal },
  { mode: "rotate" as const, label: "Rotate", Icon: ArrowClockwise },
  { mode: "scale" as const, label: "Scale", Icon: BoundingBox },
];

export function FloatingToolbar({
  mode,
  onModeChange,
  onFrame,
  onResetView,
}: FloatingToolbarProps) {
  return (
    <div className="studio-floating-toolbar" role="toolbar" aria-label="Scene tools">
      {tools.map(({ mode: toolMode, label, Icon }) => (
        <button
          type="button"
          key={toolMode}
          className={mode === toolMode ? "is-active" : ""}
          onClick={() => onModeChange(toolMode)}
          aria-label={label}
          title={label}
        >
          <Icon size={18} weight={mode === toolMode ? "bold" : "regular"} aria-hidden="true" />
        </button>
      ))}
      <span className="studio-toolbar-divider" aria-hidden="true" />
      <button type="button" onClick={onFrame} aria-label="Frame object" title="Frame object">
        <CornersOut size={18} aria-hidden="true" />
      </button>
      <button type="button" onClick={onResetView} aria-label="Reset view" title="Reset view">
        <CrosshairSimple size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
