import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StudioCanvas, type StudioCanvasHandle } from "./StudioCanvas";
import { ObjectPanel } from "./ObjectPanel";
import { InspectorPanel } from "./InspectorPanel";
import { FloatingToolbar } from "./FloatingToolbar";
import {
  cloneStudioTransform,
  defaultShadowSettings,
  defaultStudioTransform,
  type CanvasSettings,
  type CameraView,
  type StudioMaterialDescriptor,
  type StudioMaterialEdit,
  type ShadowSettings,
  type StudioTransform,
  type TransformMode,
} from "./studioTypes";

type StudioAppProps = {
  modelUrl: string;
  onReady?: () => void;
};

const defaultCanvasSettings: CanvasSettings = {
  mode: "viewport",
  width: 1080,
  height: 1080,
  locked: true,
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function StudioApp({ modelUrl, onReady }: StudioAppProps) {
  const canvasRef = useRef<StudioCanvasHandle>(null);
  const textureUrlsRef = useRef(new Set<string>());
  const [objects, setObjects] = useState<string[]>([]);
  const [visibleNames, setVisibleNames] = useState<string[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [transforms, setTransforms] = useState<Record<string, StudioTransform>>({});
  const [canvas, setCanvas] = useState<CanvasSettings>(defaultCanvasSettings);
  const [cameraView, setCameraView] = useState<CameraView | null>(null);
  const [shadows, setShadows] = useState<ShadowSettings>(defaultShadowSettings);
  const [descriptors, setDescriptors] = useState<StudioMaterialDescriptor[]>([]);
  const [materialEdits, setMaterialEdits] = useState<Record<string, Record<string, StudioMaterialEdit>>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");

  const transform = selectedName
    ? transforms[selectedName] ?? defaultStudioTransform
    : defaultStudioTransform;
  const selectedMaterialEdits = selectedName ? materialEdits[selectedName] ?? {} : {};
  const materials = useMemo(
    () => descriptors.map((descriptor) => selectedMaterialEdits[descriptor.id] ?? {
      ...descriptor,
      textureUrl: null,
      textureName: null,
    }),
    [descriptors, selectedMaterialEdits],
  );

  useEffect(() => () => {
    textureUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    textureUrlsRef.current.clear();
  }, []);

  const handleObjectsDiscovered = useCallback((names: string[]) => {
    const defaultName = names.find((name) => name.toLowerCase() === "cup") ?? names[0] ?? null;
    setObjects(names);
    setVisibleNames((current) => {
      const valid = current.filter((name) => names.includes(name));
      return valid.length > 0 ? valid : defaultName ? [defaultName] : [];
    });
    setSelectedName((current) => (
      current && names.includes(current) ? current : defaultName
    ));
  }, []);

  const handleToggleObject = useCallback((name: string) => {
    const isVisible = visibleNames.includes(name);
    const nextVisible = isVisible
      ? visibleNames.filter((visibleName) => visibleName !== name)
      : [...visibleNames, name];

    setVisibleNames(nextVisible);
    if (!isVisible) {
      setSelectedName(name);
    } else if (selectedName === name) {
      setSelectedName(nextVisible[0] ?? null);
    }
    setDescriptors([]);
    setExportStatus("");
  }, [selectedName, visibleNames]);

  const handleActivateObject = useCallback((name: string) => {
    setVisibleNames((current) => (
      current.includes(name) ? current : [...current, name]
    ));
    setSelectedName(name);
    setDescriptors([]);
    setExportStatus("");
  }, []);

  const handleMaterialsDiscovered = useCallback((nextDescriptors: StudioMaterialDescriptor[]) => {
    setDescriptors(nextDescriptors);
    if (!selectedName) return;
    setMaterialEdits((current) => {
      const currentObject = current[selectedName] ?? {};
      const nextObject = { ...currentObject };
      nextDescriptors.forEach((descriptor) => {
        if (!nextObject[descriptor.id]) {
          nextObject[descriptor.id] = {
            ...descriptor,
            textureUrl: null,
            textureName: null,
          };
        }
      });
      return { ...current, [selectedName]: nextObject };
    });
  }, [selectedName]);

  const handleTransformChange = useCallback((nextTransform: StudioTransform) => {
    if (!selectedName) return;
    setTransforms((current) => ({ ...current, [selectedName]: cloneStudioTransform(nextTransform) }));
  }, [selectedName]);

  const handleNumericTransformChange = useCallback((
    property: keyof StudioTransform,
    axis: number,
    value: number,
  ) => {
    if (!selectedName || !Number.isFinite(value)) return;
    setTransforms((current) => {
      const currentTransform = cloneStudioTransform(current[selectedName] ?? defaultStudioTransform);
      currentTransform[property][axis] = value;
      return { ...current, [selectedName]: currentTransform };
    });
  }, [selectedName]);

  const handleMaterialColorChange = useCallback((id: string, color: string) => {
    if (!selectedName) return;
    setMaterialEdits((current) => ({
      ...current,
      [selectedName]: {
        ...current[selectedName],
        [id]: { ...current[selectedName]?.[id], color },
      },
    }));
  }, [selectedName]);

  const handleMaterialTextureChange = useCallback((id: string, file: File | null) => {
    if (!selectedName) return;
    setMaterialEdits((current) => {
      const existing = current[selectedName]?.[id];
      if (!existing) return current;
      if (existing.textureUrl) {
        URL.revokeObjectURL(existing.textureUrl);
        textureUrlsRef.current.delete(existing.textureUrl);
      }
      const textureUrl = file ? URL.createObjectURL(file) : null;
      if (textureUrl) textureUrlsRef.current.add(textureUrl);
      return {
        ...current,
        [selectedName]: {
          ...current[selectedName],
          [id]: {
            ...existing,
            textureUrl,
            textureName: file?.name ?? null,
          },
        },
      };
    });
  }, [selectedName]);

  const handleMaterialReset = useCallback((id: string) => {
    if (!selectedName) return;
    const descriptor = descriptors.find((material) => material.id === id);
    if (!descriptor) return;
    setMaterialEdits((current) => {
      const existing = current[selectedName]?.[id];
      if (existing?.textureUrl) {
        URL.revokeObjectURL(existing.textureUrl);
        textureUrlsRef.current.delete(existing.textureUrl);
      }
      return {
        ...current,
        [selectedName]: {
          ...current[selectedName],
          [id]: {
            ...descriptor,
            textureUrl: null,
            textureName: null,
          },
        },
      };
    });
  }, [descriptors, selectedName]);

  const handlePresetChange = useCallback((preset: string) => {
    if (preset === "viewport") {
      setCanvas((current) => ({ ...current, mode: "viewport" }));
      return;
    }
    const match = /^(\d+)x(\d+)$/.exec(preset);
    if (!match) return;
    setCanvas({
      mode: "custom",
      width: Number(match[1]),
      height: Number(match[2]),
      locked: true,
    });
  }, []);

  const handleCanvasChange = useCallback((axis: "width" | "height", rawValue: number) => {
    const value = Math.max(1, Math.round(rawValue || 1));
    setCanvas((current) => {
      const ratio = current.width / current.height || 1;
      if (!current.locked) return { ...current, mode: "custom", [axis]: value };
      return axis === "width"
        ? { ...current, mode: "custom", width: value, height: Math.max(1, Math.round(value / ratio)) }
        : { ...current, mode: "custom", height: value, width: Math.max(1, Math.round(value * ratio)) };
    });
  }, []);

  const handleSwapOrientation = useCallback(() => {
    setCanvas((current) => ({
      ...current,
      mode: "custom",
      width: current.height,
      height: current.width,
    }));
  }, []);

  const handleExport = useCallback(async () => {
    if (visibleNames.length === 0 || !canvasRef.current) return;
    setIsExporting(true);
    setExportStatus("");
    try {
      const blob = canvas.mode === "custom"
        ? await canvasRef.current.exportPng(canvas.width, canvas.height)
        : await canvasRef.current.exportPng();
      const dimensions = canvas.mode === "custom"
        ? `${canvas.width} x ${canvas.height}`
        : "viewport";
      const exportName = visibleNames.length > 1
        ? "merch-monk-studio-scene"
        : `merch-monk-${safeFilename(visibleNames[0])}`;
      downloadBlob(blob, `${exportName}.png`);
      setExportStatus(`Exported ${dimensions}`);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "Could not export PNG.");
    } finally {
      setIsExporting(false);
    }
  }, [canvas, visibleNames]);

  return (
    <main className="merch-monk-studio-app">
      <section className="studio-workspace" aria-label="3D render workspace">
        <StudioCanvas
          ref={canvasRef}
          modelUrl={modelUrl}
          visibleNames={visibleNames}
          selectedName={selectedName}
          transforms={transforms}
          transformMode={transformMode}
          materialEdits={materialEdits}
          customAspectRatio={canvas.mode === "custom" ? canvas.width / canvas.height : null}
          shadowSettings={shadows}
          onObjectsDiscovered={handleObjectsDiscovered}
          onMaterialsDiscovered={handleMaterialsDiscovered}
          onTransformChange={handleTransformChange}
          onReady={onReady}
        />
      </section>
      <ObjectPanel
        objects={objects}
        visibleNames={visibleNames}
        activeName={selectedName}
        onToggle={handleToggleObject}
        onActivate={handleActivateObject}
      />
      <InspectorPanel
        canvas={canvas}
        transform={transform}
        materials={materials}
        exportStatus={exportStatus}
        isExporting={isExporting}
        cameraView={cameraView}
        shadowSettings={shadows}
        onPresetChange={handlePresetChange}
        onCanvasChange={handleCanvasChange}
        onCanvasLockChange={(locked) => setCanvas((current) => ({ ...current, locked }))}
        onSwapOrientation={handleSwapOrientation}
        onCameraViewChange={(view) => {
          setCameraView(view);
          canvasRef.current?.setCameraView(view);
        }}
        onShadowSettingsChange={(patch) => setShadows((current) => ({ ...current, ...patch }))}
        onTransformChange={handleNumericTransformChange}
        onMaterialColorChange={handleMaterialColorChange}
        onMaterialTextureChange={handleMaterialTextureChange}
        onMaterialReset={handleMaterialReset}
        onExport={handleExport}
      />
      <FloatingToolbar
        mode={transformMode}
        onModeChange={setTransformMode}
        onFrame={() => canvasRef.current?.frameObject()}
        onResetView={() => {
          setCameraView(null);
          canvasRef.current?.resetView();
        }}
      />
    </main>
  );
}
