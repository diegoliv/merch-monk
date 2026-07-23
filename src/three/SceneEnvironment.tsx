import { useLayoutEffect } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

const sceneEnvironmentFileName = "lebombo_512.hdr";

export function resolveSceneEnvironmentUrl(modelUrl: string) {
  const documentBaseUrl = typeof document === "undefined" ? "http://localhost/" : document.baseURI;
  const resolvedModelUrl = new URL(modelUrl, documentBaseUrl);
  return new URL(`../environments/${sceneEnvironmentFileName}`, resolvedModelUrl).href;
}

type SceneEnvironmentProps = {
  url: string;
  intensity?: number;
};

export function SceneEnvironment({ url, intensity }: SceneEnvironmentProps) {
  const texture = useLoader(RGBELoader, url);
  const invalidate = useThree((state) => state.invalidate);
  const scene = useThree((state) => state.scene);

  useLayoutEffect(() => {
    const previousEnvironment = scene.environment;
    const previousEnvironmentIntensity = scene.environmentIntensity;

    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    if (intensity !== undefined) scene.environmentIntensity = intensity;
    invalidate();

    return () => {
      if (scene.environment === texture) scene.environment = previousEnvironment;
      scene.environmentIntensity = previousEnvironmentIntensity;
      invalidate();
    };
  }, [intensity, invalidate, scene, texture]);

  return null;
}
