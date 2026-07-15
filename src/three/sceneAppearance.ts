import * as THREE from "three";

export const studioEnvironmentPreset = "apartment" as const;
export const sceneToneMappingExposure = 0.82;
export const sceneEnvironmentIntensity = 0.82;

export function tuneMaterial(material: THREE.Material) {
  const named = material.name.toLowerCase();
  const pbr = material as THREE.MeshStandardMaterial;

  if (named.includes("orange")) {
    if ("roughness" in pbr) pbr.roughness = Math.max(pbr.roughness ?? 0, 0.78);
    if ("metalness" in pbr) pbr.metalness = Math.min(pbr.metalness ?? 0, 0.04);
    if ("envMapIntensity" in pbr) pbr.envMapIntensity = 0.62;
    if ("color" in pbr) pbr.color.lerp(new THREE.Color("#ff4a09"), 0.22);
  } else if ("roughness" in pbr) {
    pbr.roughness = Math.max(pbr.roughness ?? 0, 0.55);
    if ("envMapIntensity" in pbr) pbr.envMapIntensity = 0.78;
  }

  material.needsUpdate = true;
}

export function configureSceneRenderer(gl: THREE.WebGLRenderer, scene: THREE.Scene) {
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = sceneToneMappingExposure;
  scene.environmentIntensity = sceneEnvironmentIntensity;
}
