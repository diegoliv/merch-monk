import { useRef, type PointerEvent } from "react";
import {
  DownloadSimple,
  Lock,
  LockOpen,
  Swap,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import type {
  CameraView,
  CanvasSettings,
  ShadowQuality,
  ShadowSettings,
  StudioMaterialEdit,
  StudioTransform,
  Vector3Value,
} from "./studioTypes";

type InspectorPanelProps = {
  canvas: CanvasSettings;
  transform: StudioTransform;
  materials: StudioMaterialEdit[];
  exportStatus: string;
  isExporting: boolean;
  cameraView: CameraView | null;
  shadowSettings: ShadowSettings;
  onPresetChange: (preset: string) => void;
  onCanvasChange: (axis: "width" | "height", value: number) => void;
  onCanvasLockChange: (locked: boolean) => void;
  onSwapOrientation: () => void;
  onCameraViewChange: (view: CameraView) => void;
  onShadowSettingsChange: (patch: Partial<ShadowSettings>) => void;
  onTransformChange: (property: keyof StudioTransform, axis: number, value: number) => void;
  onMaterialColorChange: (id: string, color: string) => void;
  onMaterialTextureChange: (id: string, file: File | null) => void;
  onMaterialReset: (id: string) => void;
  onExport: () => void;
};

const presets = [
  { value: "viewport", label: "Viewport" },
  { value: "1080x1080", label: "Square - 1080 x 1080" },
  { value: "1080x1350", label: "Portrait - 1080 x 1350" },
  { value: "1080x1920", label: "Story - 1080 x 1920" },
  { value: "1920x1080", label: "Landscape - 1920 x 1080" },
];

const cameraViews: Array<{ value: CameraView; label: string }> = [
  { value: "front", label: "Front" },
  { value: "side", label: "Side" },
  { value: "back", label: "Back" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
];

const shadowQualityOptions: Array<{ value: ShadowQuality; label: string }> = [
  { value: 512, label: "Low - 512 px" },
  { value: 1024, label: "Medium - 1024 px" },
  { value: 2048, label: "High - 2048 px" },
  { value: 4096, label: "Ultra - 4096 px" },
];

function roundToStep(value: number, step: number) {
  const precision = Math.max(0, (String(step).split(".")[1] ?? "").length);
  return Number(value.toFixed(precision));
}

function ScrubbableAxisInput({
  group,
  axis,
  value,
  step,
  onChange,
}: {
  group: string;
  axis: "X" | "Y" | "Z";
  value: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const scrub = useRef<{ pointerId: number; startX: number; startValue: number } | null>(null);

  function handleScrubStart(event: PointerEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrub.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: value,
    };
  }

  function handleScrubMove(event: PointerEvent<HTMLSpanElement>) {
    if (!scrub.current || scrub.current.pointerId !== event.pointerId) return;
    const scrubStep = event.shiftKey ? step * 0.1 : step;
    const nextValue = scrub.current.startValue + (event.clientX - scrub.current.startX) * scrubStep;
    onChange(roundToStep(nextValue, scrubStep));
  }

  function handleScrubEnd(event: PointerEvent<HTMLSpanElement>) {
    if (!scrub.current || scrub.current.pointerId !== event.pointerId) return;
    scrub.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <label>
      <span
        className="studio-vector-scrub"
        role="slider"
        aria-label={"Drag to adjust " + group + " " + axis}
        aria-valuenow={value}
        tabIndex={0}
        title={"Drag " + group + " " + axis + " horizontally to adjust. Hold Shift for finer control."}
        onPointerDown={handleScrubStart}
        onPointerMove={handleScrubMove}
        onPointerUp={handleScrubEnd}
        onPointerCancel={handleScrubEnd}
        onKeyDown={(event) => {
          const direction = event.key === "ArrowRight" || event.key === "ArrowUp"
            ? 1
            : event.key === "ArrowLeft" || event.key === "ArrowDown"
              ? -1
              : 0;
          if (!direction) return;
          event.preventDefault();
          const keyboardStep = event.shiftKey ? step * 0.1 : step;
          onChange(roundToStep(value + direction * keyboardStep, keyboardStep));
        }}
      >
        {axis}
      </span>
      <input
        type="number"
        aria-label={`${group} ${axis}`}
        value={Number(value.toFixed(3))}
        step={step}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          if (Number.isFinite(nextValue)) onChange(nextValue);
        }}
      />
    </label>
  );
}

function ShadowRange({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="studio-shadow-range">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <input
        type="number"
        aria-label={`${label} value`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          if (Number.isFinite(nextValue)) onChange(Math.min(max, Math.max(min, nextValue)));
        }}
      />
    </label>
  );
}

function NumericVector({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: Vector3Value;
  step: number;
  onChange: (axis: number, value: number) => void;
}) {
  return (
    <div className="studio-vector-row">
      <span>{label}</span>
      <div className="studio-vector-fields">
        {(["X", "Y", "Z"] as const).map((axis, index) => (
          <ScrubbableAxisInput
            key={axis}
            group={label}
            axis={axis}
            value={value[index]}
            step={step}
            onChange={(nextValue) => onChange(index, nextValue)}
          />
        ))}
      </div>
    </div>
  );
}

export function InspectorPanel({
  canvas,
  transform,
  materials,
  exportStatus,
  isExporting,
  cameraView,
  shadowSettings,
  onPresetChange,
  onCanvasChange,
  onCanvasLockChange,
  onSwapOrientation,
  onCameraViewChange,
  onShadowSettingsChange,
  onTransformChange,
  onMaterialColorChange,
  onMaterialTextureChange,
  onMaterialReset,
  onExport,
}: InspectorPanelProps) {
  const ratio = canvas.width > 0 && canvas.height > 0
    ? (canvas.width / canvas.height).toFixed(2).replace(/\.00$/, "")
    : "?";
  const exactPreset = presets.find((preset) => preset.value === `${canvas.width}x${canvas.height}`);
  const selectedPreset = canvas.mode === "viewport" ? "viewport" : exactPreset?.value ?? "custom";


  return (
    <aside className="studio-panel studio-inspector" aria-label="Studio inspector">
      <div className="studio-inspector-scroll">
        <details open>
          <summary>Canvas</summary>
          <div className="studio-section-content">
            <label className="studio-field">
              <span>Preset</span>
              <select
                value={selectedPreset}
                onChange={(event) => onPresetChange(event.target.value)}
              >
                {presets.map((preset) => (
                  <option key={preset.value} value={preset.value}>{preset.label}</option>
                ))}
                {selectedPreset === "custom" ? <option value="custom">Custom</option> : null}
              </select>
            </label>
            <div className="studio-resolution-row">
              <label>
                <span>Width</span>
                <input
                  type="number"
                  min={1}
                  value={canvas.width}
                  onChange={(event) => onCanvasChange("width", Number(event.target.value))}
                />
              </label>
              <button
                type="button"
                className="studio-icon-button"
                onClick={() => onCanvasLockChange(!canvas.locked)}
                aria-label={canvas.locked ? "Unlock aspect ratio" : "Lock aspect ratio"}
                title={canvas.locked ? "Unlock aspect ratio" : "Lock aspect ratio"}
              >
                {canvas.locked ? <Lock size={14} /> : <LockOpen size={14} />}
              </button>
              <label>
                <span>Height</span>
                <input
                  type="number"
                  min={1}
                  value={canvas.height}
                  onChange={(event) => onCanvasChange("height", Number(event.target.value))}
                />
              </label>
              <div className="studio-ratio-readout">
                <span>Ratio</span>
                <strong>{ratio}:1</strong>
              </div>
            </div>
            <button type="button" className="studio-secondary-action" onClick={onSwapOrientation}>
              <Swap size={15} aria-hidden="true" />
              Swap orientation
            </button>
            <div className="studio-camera-control">
              <span>Camera</span>
              <div className="studio-camera-views" aria-label="Camera position">
                {cameraViews.map((view) => (
                  <button
                    key={view.value}
                    type="button"
                    className={cameraView === view.value ? "is-active" : ""}
                    onClick={() => onCameraViewChange(view.value)}
                    aria-pressed={cameraView === view.value}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </details>

        <details open className="studio-shadow-section">
          <summary>Shadows</summary>
          <div className="studio-section-content">
            <label className="studio-toggle-row">
              <span>Enabled</span>
              <input
                type="checkbox"
                checked={shadowSettings.enabled}
                onChange={(event) => onShadowSettingsChange({ enabled: event.target.checked })}
              />
              <i aria-hidden="true" />
            </label>
            <label className={`studio-toggle-row ${!shadowSettings.enabled ? "is-disabled" : ""}`}>
              <span>Ground shadow</span>
              <input
                type="checkbox"
                checked={shadowSettings.groundEnabled}
                disabled={!shadowSettings.enabled}
                onChange={(event) => onShadowSettingsChange({ groundEnabled: event.target.checked })}
              />
              <i aria-hidden="true" />
            </label>
            <fieldset
              className="studio-shadow-controls"
              aria-label="Shadow quality controls"
              disabled={!shadowSettings.enabled}
            >
              <ShadowRange
                label="Intensity"
                value={shadowSettings.lightIntensity}
                min={0}
                max={2}
                step={0.05}
                onChange={(lightIntensity) => onShadowSettingsChange({ lightIntensity })}
              />
              <ShadowRange
                label="Contrast"
                value={shadowSettings.contrast}
                min={0}
                max={1}
                step={0.05}
                onChange={(contrast) => onShadowSettingsChange({ contrast })}
              />
              <ShadowRange
                label="Blur"
                value={shadowSettings.blur}
                min={0}
                max={100}
                step={0.5}
                onChange={(blur) => onShadowSettingsChange({ blur })}
              />
              <ShadowRange
                label="Bias"
                value={shadowSettings.bias}
                min={0}
                max={0.1}
                step={0.001}
                onChange={(bias) => onShadowSettingsChange({ bias })}
              />
              <label className="studio-shadow-color">
                <span>Color</span>
                <input
                  type="color"
                  aria-label="Shadow color picker"
                  value={shadowSettings.color}
                  onChange={(event) => onShadowSettingsChange({ color: event.target.value })}
                />
                <input
                  type="text"
                  value={shadowSettings.color.toUpperCase()}
                  maxLength={7}
                  onChange={(event) => {
                    if (/^#[0-9a-f]{6}$/i.test(event.target.value)) {
                      onShadowSettingsChange({ color: event.target.value });
                    }
                  }}
                  aria-label="Shadow color"
                />
              </label>
              <label className="studio-field studio-shadow-quality">
                <span>Quality</span>
                <select
                  value={shadowSettings.resolution}
                  onChange={(event) => onShadowSettingsChange({
                    resolution: Number(event.target.value) as ShadowQuality,
                  })}
                >
                  {shadowQualityOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </fieldset>
          </div>
        </details>

        <details open>
          <summary>Transform</summary>
          <div className="studio-section-content">
            <NumericVector
              label="Position"
              value={transform.position}
              step={0.01}
              onChange={(axis, value) => onTransformChange("position", axis, value)}
            />
            <NumericVector
              label="Rotation"
              value={transform.rotation}
              step={1}
              onChange={(axis, value) => onTransformChange("rotation", axis, value)}
            />
            <NumericVector
              label="Scale"
              value={transform.scale}
              step={0.01}
              onChange={(axis, value) => onTransformChange("scale", axis, value)}
            />
          </div>
        </details>

        <details open>
          <summary>Materials</summary>
          <div className="studio-section-content studio-material-list">
            {materials.map((material) => (
              <div className="studio-material" key={material.id}>
                <div className="studio-material-heading">
                  <span><i style={{ backgroundColor: material.color }} />{material.name}</span>
                  <button type="button" onClick={() => onMaterialReset(material.id)}>Reset</button>
                </div>
                <label className="studio-color-field">
                  <span>Color</span>
                  <input
                    type="color"
                    value={material.color}
                    onChange={(event) => onMaterialColorChange(material.id, event.target.value)}
                  />
                  <input
                    type="text"
                    value={material.color.toUpperCase()}
                    maxLength={7}
                    onChange={(event) => {
                      if (/^#[0-9a-f]{6}$/i.test(event.target.value)) {
                        onMaterialColorChange(material.id, event.target.value);
                      }
                    }}
                    aria-label={`${material.name} hex color`}
                  />
                </label>
                <div className="studio-texture-field">
                  <span>Texture</span>
                  {material.textureName ? (
                    <span className="studio-texture-name" title={material.textureName}>
                      {material.textureName}
                    </span>
                  ) : null}
                  <label className="studio-upload-action">
                    <UploadSimple size={15} aria-hidden="true" />
                    <span>{material.textureName ? "Replace" : "Upload texture"}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      onChange={(event) => onMaterialTextureChange(
                        material.id,
                        event.target.files?.[0] ?? null,
                      )}
                    />
                  </label>
                  {material.textureName ? (
                    <button
                      type="button"
                      className="studio-remove-texture"
                      onClick={() => onMaterialTextureChange(material.id, null)}
                      aria-label={`Remove texture from ${material.name}`}
                      title="Remove texture"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {materials.length === 0 ? (
              <p className="studio-empty-state">Select an object to edit its materials.</p>
            ) : null}
          </div>
        </details>
      </div>
      <div className="studio-export-area">
        {exportStatus ? <p role="status">{exportStatus}</p> : null}
        <button type="button" className="studio-export-button" onClick={onExport} disabled={isExporting}>
          <DownloadSimple size={17} weight="bold" aria-hidden="true" />
          {isExporting ? "Rendering..." : "Export PNG"}
        </button>
      </div>
    </aside>
  );
}
