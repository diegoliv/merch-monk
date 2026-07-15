export type TransformMode = "translate" | "rotate" | "scale";

export type CameraView = "front" | "side" | "back" | "top" | "bottom";

export type Vector3Value = [number, number, number];

export type StudioTransform = {
  position: Vector3Value;
  rotation: Vector3Value;
  scale: Vector3Value;
};

export type StudioMaterialDescriptor = {
  id: string;
  name: string;
  color: string;
};

export type StudioMaterialEdit = StudioMaterialDescriptor & {
  textureUrl: string | null;
  textureName: string | null;
};

export type CanvasMode = "viewport" | "custom";

export type CanvasSettings = {
  mode: CanvasMode;
  width: number;
  height: number;
  locked: boolean;
};

export type ShadowQuality = 512 | 1024 | 2048 | 4096;

export type ShadowSettings = {
  enabled: boolean;
  groundEnabled: boolean;
  lightIntensity: number;
  contrast: number;
  blur: number;
  bias: number;
  color: string;
  resolution: ShadowQuality;
};

export const defaultShadowSettings: ShadowSettings = {
  enabled: true,
  groundEnabled: true,
  lightIntensity: 0.9,
  contrast: 0.55,
  blur: 6,
  bias: 0.025,
  color: "#000000",
  resolution: 2048,
};

export const defaultStudioTransform: StudioTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

export function cloneStudioTransform(transform: StudioTransform): StudioTransform {
  return {
    position: [...transform.position],
    rotation: [...transform.rotation],
    scale: [...transform.scale],
  };
}
