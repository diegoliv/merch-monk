import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrthographicCamera, TransformControls, useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { breakpointPreviewSizes, resolveBreakpointMode } from "./breakpoints";
import { anchorToWorld, applyViewport, getWorldSize } from "./math";
import { boxChildObjectIds, objectIds, renderObjectIds } from "./sceneObjects";
import { editorStore, useEditorStore } from "./editorStore";
import { getTheatreObject, getTheatreObjects, theatreProject, type TheatreObjectValue, valueToSceneState } from "./theatreProject";
import { selectTheatreObject, setTheatreObjectValue } from "./theatreStudio";
import { useSceneProgress } from "./useSceneProgress";
import { useViewportInfo } from "./useViewportInfo";
import type { ProductCupColorValue, ProductCupDecorationMethod } from "../components/StorySections";
import { useExperienceRuntime } from "../experienceRuntime";
import type { AppliedSceneState, BoxChildObjectId, Breakpoint, ObjectId } from "./types";

const modelPath = window.MerchMonkWebflow?.modelUrl ?? "/models/merch_monk_website.glb";
const modelNodeNames: Partial<Record<ObjectId, string>> = { box: "box_bones", product_cup: "cup" };
const boxAnimationNames = new Set(["box_open"]);
const entranceObjectIds: ObjectId[] = renderObjectIds.filter((id) => id !== "box" && id !== "product_cup");
const entranceDuration = 0.55;
const entranceStagger = 0.05;

type TheatreValues = Record<ObjectId, TheatreObjectValue>;
type BoxChildValues = Record<BoxChildObjectId, TheatreObjectValue>;
type PointerState = { clientX: number; clientY: number; active: boolean; scrolling: boolean };
type PerformanceDebug = {
  frames: number;
  totalFrameMs: number;
  worstFrameMs: number;
  framesOver20Ms: number;
  framesOver50Ms: number;
  theatreUpdates: number;
  sceneRenders: number;
  reset: () => void;
  snapshot: () => Record<string, number>;
};

const performanceDebugEnabled = new URLSearchParams(window.location.search).has("perf");

function getPerformanceDebug() {
  return (window as typeof window & { __MERCH_MONK_PERF__?: PerformanceDebug }).__MERCH_MONK_PERF__;
}

function PerformanceProbe() {
  useEffect(() => {
    if (!performanceDebugEnabled) return;
    const debug: PerformanceDebug = {
      frames: 0,
      totalFrameMs: 0,
      worstFrameMs: 0,
      framesOver20Ms: 0,
      framesOver50Ms: 0,
      theatreUpdates: 0,
      sceneRenders: 0,
      reset() {
        this.frames = 0;
        this.totalFrameMs = 0;
        this.worstFrameMs = 0;
        this.framesOver20Ms = 0;
        this.framesOver50Ms = 0;
        this.theatreUpdates = 0;
        this.sceneRenders = 0;
      },
      snapshot() {
        return {
          frames: this.frames,
          averageFrameMs: this.frames > 0 ? this.totalFrameMs / this.frames : 0,
          worstFrameMs: this.worstFrameMs,
          framesOver20Ms: this.framesOver20Ms,
          framesOver50Ms: this.framesOver50Ms,
          theatreUpdates: this.theatreUpdates,
          sceneRenders: this.sceneRenders,
        };
      },
    };
    (window as typeof window & { __MERCH_MONK_PERF__?: PerformanceDebug }).__MERCH_MONK_PERF__ = debug;
    const reportInterval = window.setInterval(() => {
      console.info(`[Merch Monk perf] ${JSON.stringify(debug.snapshot())}`);
      debug.reset();
    }, 2000);
    return () => {
      window.clearInterval(reportInterval);
      delete (window as typeof window & { __MERCH_MONK_PERF__?: PerformanceDebug }).__MERCH_MONK_PERF__;
    };
  }, []);

  useFrame((_, delta) => {
    const debug = getPerformanceDebug();
    if (!debug) return;
    const frameMs = delta * 1000;
    debug.frames += 1;
    debug.totalFrameMs += frameMs;
    debug.worstFrameMs = Math.max(debug.worstFrameMs, frameMs);
    if (frameMs > 20) debug.framesOver20Ms += 1;
    if (frameMs > 50) debug.framesOver50Ms += 1;
  });

  return null;
}
type RestTransform = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

function isBoxChildObjectId(id: ObjectId): id is BoxChildObjectId {
  return boxChildObjectIds.includes(id as BoxChildObjectId);
}

function tuneMaterial(material: THREE.Material) {
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

function cloneNode(node: THREE.Object3D, centerPivot = false) {
  const cloned = cloneSkeleton(node);
  cloned.traverse((child) => {
    if ("material" in child) {
      const mesh = child as THREE.Mesh;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((material) => {
          const clonedMaterial = material.clone();
          tuneMaterial(clonedMaterial);
          return clonedMaterial;
        });
      } else if (mesh.material) {
        mesh.material = mesh.material.clone();
        tuneMaterial(mesh.material);
      }
    }
  });

  const bounds = new THREE.Box3().setFromObject(cloned);
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  if (Number.isFinite(maxDimension) && maxDimension > 0) {
    cloned.scale.multiplyScalar(1 / maxDimension);
    cloned.updateMatrixWorld(true);
  }

  if (!centerPivot) return cloned;

  const centeredBounds = new THREE.Box3().setFromObject(cloned);
  const center = centeredBounds.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();
  wrapper.name = `${node.name}_centered`;
  cloned.position.sub(center);
  wrapper.add(cloned);
  wrapper.updateMatrixWorld(true);
  return wrapper;
}

function getInitialTrackValue(root: THREE.Object3D, track: THREE.KeyframeTrack) {
  const suffixes = [
    { suffix: ".position", property: "position" },
    { suffix: ".quaternion", property: "quaternion" },
    { suffix: ".scale", property: "scale" },
  ] as const;
  const match = suffixes.find(({ suffix }) => track.name.endsWith(suffix));
  if (!match) return null;

  const targetName = track.name.slice(0, -match.suffix.length);
  const target = root.getObjectByName(targetName);
  return target?.[match.property].toArray() ?? null;
}

function preserveRestPoseUntilFirstKey(root: THREE.Object3D, track: THREE.KeyframeTrack) {
  if (track.times[0] <= 0) return track.clone();

  const initialValue = getInitialTrackValue(root, track);
  if (!initialValue) return track.clone();

  const valueSize = track.getValueSize();
  const holdTime = Math.max(0, track.times[0] - 0.0001);
  const insertedKeyCount = holdTime > 0 ? 2 : 1;
  const times = new Float32Array(track.times.length + insertedKeyCount);
  const values = new Float32Array(track.values.length + valueSize * insertedKeyCount);
  times[0] = 0;
  if (insertedKeyCount === 2) times[1] = holdTime;
  times.set(track.times, insertedKeyCount);
  values.set(initialValue, 0);
  if (insertedKeyCount === 2) values.set(initialValue, valueSize);
  values.set(track.values, valueSize * insertedKeyCount);

  if (track instanceof THREE.QuaternionKeyframeTrack) {
    return new THREE.QuaternionKeyframeTrack(track.name, times, values);
  }

  return new THREE.VectorKeyframeTrack(track.name, times, values);
}

function createBoxAnimationClip(root: THREE.Object3D, animations: THREE.AnimationClip[]) {
  const tracks = animations
    .filter((clip) => boxAnimationNames.has(clip.name))
    .flatMap((clip) => clip.tracks.map((track) => preserveRestPoseUntilFirstKey(root, track)));

  return tracks.length > 0 ? new THREE.AnimationClip("box_combined", -1, tracks) : null;
}
function collectMaterials(object: THREE.Object3D) {
  const materials: THREE.Material[] = [];
  object.traverse((child) => {
    if (!("material" in child)) return;
    const mesh = child as THREE.Mesh;
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    meshMaterials.forEach((material) => {
      if (material && !materials.includes(material)) materials.push(material);
    });
  });
  return materials;
}

function setOpacity(materials: THREE.Material[], opacity: number) {
  materials.forEach((material) => {
    material.transparent = opacity < 0.999;
    material.opacity = opacity;
    material.depthWrite = opacity > 0.5;
  });
}

function isProductCupMainMaterial(name: string) {
  return (name.includes("orange") && !name.includes("dark")) || name.includes("cup.uv");
}

function applyProductCupMaterial(
  object: THREE.Object3D,
  productCupColor: ProductCupColorValue,
  decorationMethod: ProductCupDecorationMethod,
  colorTexture: THREE.CanvasTexture | null = null,
  bumpTexture: THREE.CanvasTexture | null = null,
) {
  object.traverse((child) => {
    if (!("material" in child)) return;
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    materials.forEach((material) => {
      if (!material || !("color" in material)) return;
      const pbr = material as THREE.MeshStandardMaterial;
      const name = material.name.toLowerCase().replace(/[_\s]/g, ".");
      if (name.includes("orange.dark")) {
        pbr.color.set(productCupColor.darkColor);
        pbr.map = null;
        pbr.bumpMap = null;
        pbr.bumpScale = 0;
      } else if (isProductCupMainMaterial(name)) {
        pbr.color.set(colorTexture ? "#ffffff" : productCupColor.color);
        pbr.map = colorTexture;
        pbr.bumpMap = bumpTexture;
        pbr.bumpScale = bumpTexture ? -0.018 : 0;
      }
      pbr.roughness = decorationMethod === "engraved" ? 0.78 : decorationMethod === "print" ? 0.72 : 0.62;
      pbr.metalness = Math.min(pbr.metalness ?? 0, 0.08);
      material.needsUpdate = true;
    });
  });
}

function createTintedArtworkCanvas(image: HTMLImageElement, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(image, 0, 0);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-over";
  return canvas;
}

function createProductCupArtworkTextures(
  image: HTMLImageElement,
  productCupColor: ProductCupColorValue,
  decorationMethod: ProductCupDecorationMethod,
) {
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = image.naturalWidth;
  colorCanvas.height = image.naturalHeight;
  const colorContext = colorCanvas.getContext("2d");
  const artworkCanvas = createTintedArtworkCanvas(
    image,
    decorationMethod === "engraved" ? productCupColor.darkColor : "#ffffff",
  );
  if (!colorContext || !artworkCanvas) return null;

  colorContext.fillStyle = productCupColor.color;
  colorContext.fillRect(0, 0, colorCanvas.width, colorCanvas.height);
  colorContext.drawImage(artworkCanvas, 0, 0);

  const colorTexture = new THREE.CanvasTexture(colorCanvas);
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  colorTexture.flipY = false;
  colorTexture.needsUpdate = true;

  let bumpTexture: THREE.CanvasTexture | null = null;
  if (decorationMethod === "engraved") {
    const bumpCanvas = document.createElement("canvas");
    bumpCanvas.width = image.naturalWidth;
    bumpCanvas.height = image.naturalHeight;
    const bumpContext = bumpCanvas.getContext("2d");
    const bumpArtwork = createTintedArtworkCanvas(image, "#ffffff");
    if (bumpContext && bumpArtwork) {
      bumpContext.fillStyle = "#000000";
      bumpContext.fillRect(0, 0, bumpCanvas.width, bumpCanvas.height);
      bumpContext.drawImage(bumpArtwork, 0, 0);
      bumpTexture = new THREE.CanvasTexture(bumpCanvas);
      bumpTexture.colorSpace = THREE.NoColorSpace;
      bumpTexture.flipY = false;
      bumpTexture.needsUpdate = true;
    }
  }

  return { colorTexture, bumpTexture };
}
function applyBoxChildStates(
  root: THREE.Object3D,
  childValues: BoxChildValues,
  restTransforms: Partial<Record<BoxChildObjectId, RestTransform>>,
  childMaterials: Partial<Record<BoxChildObjectId, THREE.Material[]>>,
  parentOpacity: number,
  rotationEuler: THREE.Euler,
  rotationQuaternion: THREE.Quaternion,
) {
  boxChildObjectIds.forEach((childId) => {
    const target = root.getObjectByName(childId);
    const rest = restTransforms[childId];
    const value = childValues[childId];
    if (!target || !rest || !value) return;

    target.position.set(
      rest.position.x + value.position.x,
      rest.position.y + value.position.y,
      rest.position.z + value.position.z,
    );

    rotationEuler.set(value.rotation.x, value.rotation.y, value.rotation.z, "XYZ");
    rotationQuaternion.setFromEuler(rotationEuler);
    target.quaternion.copy(rest.quaternion).multiply(rotationQuaternion);
    target.scale.set(rest.scale.x * value.scale, rest.scale.y * value.scale, rest.scale.z * value.scale);
    const opacity = value.opacity * parentOpacity;
    target.visible = value.visible && opacity > 0.01;
    setOpacity(childMaterials[childId] ?? [], opacity);
  });
}
function initialTheatreValues(breakpoint: Breakpoint): TheatreValues {
  const objects = getTheatreObjects(breakpoint);

  return objectIds.reduce((values, id) => {
    values[id] = objects[id].value as TheatreObjectValue;
    return values;
  }, {} as TheatreValues);
}

type MerchObjectProps = {
  id: ObjectId;
  appliedRef: MutableRefObject<AppliedSceneState>;
  theatreValuesRef: MutableRefObject<TheatreValues>;
  pointerStateRef: MutableRefObject<PointerState>;
  lockMotion: boolean;
  selectedObjectId: ObjectId;
  editorEnabled: boolean;
  hoverTiltX: number;
  hoverTiltY: number;
  hoverFollow: number;
  hoverRange: number;
  productCupColor: ProductCupColorValue;
  productCupArtworkUrl: string | null;
  productCupDecorationMethod: ProductCupDecorationMethod;
  setSelectedRef: (instance: THREE.Object3D | null) => void;
  activeBreakpoint: Breakpoint;
  entranceEnabled: boolean;
  entranceIndex: number;
  entranceStartRef: MutableRefObject<number | null>;
};

function MerchObject({ id, appliedRef, theatreValuesRef, pointerStateRef, lockMotion, selectedObjectId, editorEnabled, hoverTiltX, hoverTiltY, hoverFollow, hoverRange, productCupColor, productCupArtworkUrl, productCupDecorationMethod, setSelectedRef, activeBreakpoint, entranceEnabled, entranceIndex, entranceStartRef }: MerchObjectProps) {
  const { scene, animations } = useGLTF(modelPath);
  const { camera, size } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const pointerRef = useRef(new THREE.Vector2());
  const raycasterRef = useRef(new THREE.Raycaster());
  const tiltRef = useRef(new THREE.Vector2());
  const targetTiltRef = useRef(new THREE.Vector2());
  const baseEulerRef = useRef(new THREE.Euler());
  const baseQuaternionRef = useRef(new THREE.Quaternion());
  const globalTiltEulerRef = useRef(new THREE.Euler());
  const globalTiltQuaternionRef = useRef(new THREE.Quaternion());
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const boxActionRef = useRef<THREE.AnimationAction | null>(null);
  const boxRef = useRef(new THREE.Box3());
  const centerRef = useRef(new THREE.Vector3());
  const childRotationEulerRef = useRef(new THREE.Euler());
  const childRotationQuaternionRef = useRef(new THREE.Quaternion());
  const lastOpacityRef = useRef(Number.NaN);
  const lastAnimationProgressRef = useRef(Number.NaN);
  const phase = useMemo(() => objectIds.indexOf(id) * 0.45, [id]);
  const object = useMemo(() => {
    const node = scene.getObjectByName(modelNodeNames[id] ?? id);
    return node ? cloneNode(node, id === "box") : null;
  }, [id, scene]);
  const boxAnimationClip = useMemo(() => (id === "box" && object ? createBoxAnimationClip(object, animations) : null), [animations, id, object]);
  const boxChildRestTransforms = useMemo(() => {
    if (id !== "box" || !object) return {};

    return boxChildObjectIds.reduce((transforms, childId) => {
      const child = object.getObjectByName(childId);
      if (child) {
        transforms[childId] = {
          position: child.position.clone(),
          quaternion: child.quaternion.clone(),
          scale: child.scale.clone(),
        };
        child.userData.restTransform = transforms[childId];
      }
      return transforms;
    }, {} as Partial<Record<BoxChildObjectId, RestTransform>>);
  }, [id, object]);
  const materials = useMemo(() => (object ? collectMaterials(object) : []), [object]);
  const boxChildMaterials = useMemo(() => {
    if (id !== "box" || !object) return {};
    return boxChildObjectIds.reduce((result, childId) => {
      const child = object.getObjectByName(childId);
      if (child) result[childId] = collectMaterials(child);
      return result;
    }, {} as Partial<Record<BoxChildObjectId, THREE.Material[]>>);
  }, [id, object]);
  useEffect(() => {
    if (id !== "product_cup" || !object) return;

    let cancelled = false;
    let colorTexture: THREE.CanvasTexture | null = null;
    let bumpTexture: THREE.CanvasTexture | null = null;
    applyProductCupMaterial(object, productCupColor, productCupDecorationMethod);

    if (!productCupArtworkUrl) return;

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      const textures = createProductCupArtworkTextures(image, productCupColor, productCupDecorationMethod);
      if (!textures) return;
      colorTexture = textures.colorTexture;
      bumpTexture = textures.bumpTexture;
      applyProductCupMaterial(object, productCupColor, productCupDecorationMethod, colorTexture, bumpTexture);
    };
    image.onerror = () => {
      if (!cancelled) console.warn(`[Merch Monk] Could not load product cup artwork: ${productCupArtworkUrl}`);
    };
    image.src = productCupArtworkUrl;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
      object.traverse((child) => {
        if (!("material" in child)) return;
        const mesh = child as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => {
          const pbr = material as THREE.MeshStandardMaterial;
          if (pbr.map === colorTexture) pbr.map = null;
          if (pbr.bumpMap === bumpTexture) pbr.bumpMap = null;
          material.needsUpdate = true;
        });
      });
      colorTexture?.dispose();
      bumpTexture?.dispose();
    };
  }, [id, object, productCupArtworkUrl, productCupColor, productCupDecorationMethod]);

  function applyState(float = 0, tilt = tiltRef.current, entranceScale = 1) {
    if (!groupRef.current) return;
    const state = appliedRef.current[id];
    if (!state) return;
    groupRef.current.position.set(state.worldPosition[0], state.worldPosition[1] + float, state.worldPosition[2]);
    baseEulerRef.current.set(state.rotation[0], state.rotation[1], state.rotation[2], "XYZ");
    baseQuaternionRef.current.setFromEuler(baseEulerRef.current);
    globalTiltEulerRef.current.set(tilt.x, tilt.y, 0, "XYZ");
    globalTiltQuaternionRef.current.setFromEuler(globalTiltEulerRef.current);
    groupRef.current.quaternion.copy(baseQuaternionRef.current).premultiply(globalTiltQuaternionRef.current);
    groupRef.current.scale.setScalar(state.scale * entranceScale);
    groupRef.current.visible = state.visible && state.opacity > 0.01;
    if (object) {
      if (!Number.isFinite(lastOpacityRef.current) || Math.abs(lastOpacityRef.current - state.opacity) > 0.0001) {
        setOpacity(materials, state.opacity);
        lastOpacityRef.current = state.opacity;
      }
      if (id === "box") {
        applyBoxChildStates(
          object,
          theatreValuesRef.current as BoxChildValues,
          boxChildRestTransforms,
          boxChildMaterials,
          state.opacity,
          childRotationEulerRef.current,
          childRotationQuaternionRef.current,
        );
      }
    }
  }

  useEffect(() => {
    if (id === "box" && isBoxChildObjectId(selectedObjectId) && object) {
      setSelectedRef(object.getObjectByName(selectedObjectId) ?? null);
      return;
    }

    if (selectedObjectId === id && groupRef.current) {
      setSelectedRef(groupRef.current);
    }
  }, [id, object, selectedObjectId, setSelectedRef]);

  useEffect(() => {
    if (!object || !boxAnimationClip) {
      mixerRef.current = null;
      boxActionRef.current = null;
      return;
    }

    const mixer = new THREE.AnimationMixer(object);
    const action = mixer.clipAction(boxAnimationClip);
    action.setLoop(THREE.LoopOnce, 0);
    action.clampWhenFinished = true;
    action.enabled = true;
    action.paused = true;
    action.play();
    mixerRef.current = mixer;
    boxActionRef.current = action;

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(object);
      mixerRef.current = null;
      boxActionRef.current = null;
    };
  }, [boxAnimationClip, object]);

  useFrame(({ clock }) => {
    const state = appliedRef.current[id];
    if (!state) return;
    const pointerState = pointerStateRef.current;
    const entranceStart = entranceStartRef.current;
    const entranceElapsed = entranceStart === null ? 0 : clock.elapsedTime - entranceStart - entranceIndex * entranceStagger;
    const entranceProgress = entranceEnabled
      ? THREE.MathUtils.clamp(entranceElapsed / entranceDuration, 0, 1)
      : 1;
    const entranceScale = 1 - Math.pow(1 - entranceProgress, 3);
    pointerRef.current.set((pointerState.clientX / size.width) * 2 - 1, -(pointerState.clientY / size.height) * 2 + 1);

    if (id === "box" && mixerRef.current && boxActionRef.current && boxAnimationClip) {
      const progress = THREE.MathUtils.clamp(theatreValuesRef.current.box.boxAnimationProgress ?? 0, 0, 1);
      if (!Number.isFinite(lastAnimationProgressRef.current) || Math.abs(lastAnimationProgressRef.current - progress) > 0.0001) {
        const duration = boxAnimationClip.duration;
        boxActionRef.current.time = progress >= 1 ? Math.max(0, duration - 0.0001) : progress * duration;
        mixerRef.current.update(0);
        lastAnimationProgressRef.current = progress;
      }
    }

    if (lockMotion) {
      tiltRef.current.lerp(targetTiltRef.current.set(0, 0), 0.18);
      applyState(0, tiltRef.current, entranceScale);
      return;
    }

    const float = Math.sin(clock.elapsedTime * 0.55 + phase) * 0.045;

    if (!groupRef.current || !object || !state.visible || state.opacity <= 0.08 || !pointerState.active || pointerState.scrolling) {
      targetTiltRef.current.set(0, 0);
    } else {
      groupRef.current.updateMatrixWorld();
      raycasterRef.current.setFromCamera(pointerRef.current, camera);

      const isPointerOverObject = raycasterRef.current.intersectObject(groupRef.current, true).length > 0;
      if (isPointerOverObject) {
        targetTiltRef.current.set(0, 0);
      } else {
        boxRef.current.setFromObject(groupRef.current);
        boxRef.current.getCenter(centerRef.current).project(camera);

        const horizontal = pointerRef.current.x - centerRef.current.x;
        const vertical = pointerRef.current.y - centerRef.current.y;
        const distance = Math.hypot(horizontal, vertical);
        const influence = THREE.MathUtils.clamp(distance / hoverRange, 0, 1);

        if (distance < 0.001) {
          targetTiltRef.current.set(0, 0);
        } else {
          targetTiltRef.current.set((-vertical / distance) * influence * hoverTiltX, (horizontal / distance) * influence * hoverTiltY);
        }
      }
    }

    tiltRef.current.lerp(targetTiltRef.current, hoverFollow);
    applyState(float, tiltRef.current, entranceScale);
  });

  if (!object) return null;

  return (
    <group
      ref={(instance) => {
        groupRef.current = instance;
        if (selectedObjectId === id) setSelectedRef(instance);
      }}
      onPointerDown={(event) => {
        if (!editorEnabled) return;
        event.stopPropagation();

        let clicked: THREE.Object3D | null = event.object;
        while (id === "box" && object && clicked) {
          if (isBoxChildObjectId(clicked.name as ObjectId)) {
            editorStore.setSelection({ selectedObject: clicked.name as BoxChildObjectId });
            setSelectedRef(clicked);
            void selectTheatreObject(clicked.name as BoxChildObjectId, activeBreakpoint);
            return;
          }
          if (clicked === object) break;
          clicked = clicked.parent;
        }

        editorStore.setSelection({ selectedObject: id });
        void selectTheatreObject(id, activeBreakpoint);
      }}
    >
      <primitive object={object} />
    </group>
  );
}

type SceneContentProps = {
  productCupColor: ProductCupColorValue;
  productCupArtworkUrl?: string | null;
  productCupDecorationMethod?: ProductCupDecorationMethod;
  onReady?: () => void;
};

function SceneReadinessController({ entranceStartRef, onReady }: {
  entranceStartRef: MutableRefObject<number | null>;
  onReady?: () => void;
}) {
  const theatreReadyRef = useRef(false);
  const completedFramesRef = useRef(0);
  const signalledRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    void theatreProject.ready.then(() => {
      if (!cancelled) theatreReadyRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useFrame(({ clock }) => {
    if (!theatreReadyRef.current || signalledRef.current) return;
    if (completedFramesRef.current < 1) {
      completedFramesRef.current += 1;
      return;
    }

    signalledRef.current = true;
    entranceStartRef.current = clock.elapsedTime;
    onReadyRef.current?.();
  });

  return null;
}

function SceneContent({ productCupColor, productCupArtworkUrl = null, productCupDecorationMethod = "digital", onReady }: SceneContentProps) {
  const performanceDebug = getPerformanceDebug();
  if (performanceDebug) performanceDebug.sceneRenders += 1;
  const runtime = useExperienceRuntime();
  const viewport = useViewportInfo();
  const editor = useEditorStore();
  const activeBreakpoint = resolveBreakpointMode(editor.breakpointMode, viewport.breakpoint);
  const activeViewport = useMemo(() => {
    if (editor.breakpointMode === "auto") return { ...viewport, breakpoint: activeBreakpoint };

    const previewSize = breakpointPreviewSizes[activeBreakpoint];
    const worldSize = getWorldSize(previewSize.width, previewSize.height);
    return {
      ...viewport,
      ...previewSize,
      ...worldSize,
      breakpoint: activeBreakpoint,
    };
  }, [activeBreakpoint, editor.breakpointMode, viewport]);
  useSceneProgress(activeBreakpoint);
  const [selectedObject, setSelectedObject] = useState<THREE.Object3D | null>(null);
  const theatreValuesRef = useRef<TheatreValues>(initialTheatreValues(activeBreakpoint));
  const appliedRef = useRef<AppliedSceneState>(objectIds.reduce((result, id) => {
    result[id] = applyViewport(valueToSceneState(theatreValuesRef.current[id]), activeViewport);
    return result;
  }, {} as AppliedSceneState));
  const pointerStateRef = useRef<PointerState>({ clientX: 0, clientY: 0, active: false, scrolling: false });
  const entranceStartRef = useRef<number | null>(null);
  const entranceEnabled = runtime.mode === "webflow" && !editor.enabled;

  useEffect(() => {
    const objects = getTheatreObjects(activeBreakpoint);
    theatreValuesRef.current = initialTheatreValues(activeBreakpoint);
    objectIds.forEach((id) => {
      appliedRef.current[id] = applyViewport(valueToSceneState(theatreValuesRef.current[id]), activeViewport);
    });

    const unsubscribers = objectIds.map((id) => objects[id].onValuesChange((value) => {
      const debug = getPerformanceDebug();
      if (debug) debug.theatreUpdates += 1;
      theatreValuesRef.current[id] = value as TheatreObjectValue;
      appliedRef.current[id] = applyViewport(valueToSceneState(value as TheatreObjectValue), activeViewport);
    }));

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [activeBreakpoint, activeViewport]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      pointerStateRef.current.clientX = event.clientX;
      pointerStateRef.current.clientY = event.clientY;
      pointerStateRef.current.active = true;
    }
    function handlePointerLeave() {
      pointerStateRef.current.active = false;
    }
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  useEffect(() => {
    const previewScroller = document.querySelector<HTMLElement>(runtime.previewScrollerSelector);
    const scrollTarget: Window | HTMLElement = previewScroller ?? window;
    let scrollEndTimer = 0;
    function handleScroll() {
      pointerStateRef.current.scrolling = true;
      window.clearTimeout(scrollEndTimer);
      scrollEndTimer = window.setTimeout(() => {
        pointerStateRef.current.scrolling = false;
      }, 120);
    }
    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollTarget.removeEventListener("scroll", handleScroll);
      window.clearTimeout(scrollEndTimer);
    };
  }, [editor.breakpointMode, editor.enabled, runtime.previewScrollerSelector]);

  function saveTransform() {
    if (!selectedObject) return;

    const object = getTheatreObject(editor.selectedObject, activeBreakpoint);
    const current = object.value;

    if (isBoxChildObjectId(editor.selectedObject)) {
      const rest = selectedObject.userData.restTransform as RestTransform | undefined;
      if (!rest) return;

      const deltaQuaternion = rest.quaternion.clone().invert().multiply(selectedObject.quaternion);
      const deltaRotation = new THREE.Euler().setFromQuaternion(deltaQuaternion, "XYZ");
      const nextScale = rest.scale.x !== 0 ? selectedObject.scale.x / rest.scale.x : current.scale;
      const next: Partial<TheatreObjectValue> = {
        position: {
          x: selectedObject.position.x - rest.position.x,
          y: selectedObject.position.y - rest.position.y,
          z: selectedObject.position.z - rest.position.z,
        },
        rotation: {
          x: deltaRotation.x,
          y: deltaRotation.y,
          z: deltaRotation.z,
        },
        scale: nextScale,
        visible: true,
        opacity: Math.max(current.opacity, 1),
      };

      void setTheatreObjectValue(editor.selectedObject, next, activeBreakpoint);
      return;
    }

    const anchorWorld = anchorToWorld([current.anchor.x, current.anchor.y], activeViewport);
    const next: Partial<TheatreObjectValue> = {
      position: {
        x: selectedObject.position.x - anchorWorld[0],
        y: selectedObject.position.y - anchorWorld[1],
        z: selectedObject.position.z - anchorWorld[2],
      },
      rotation: {
        x: selectedObject.rotation.x,
        y: selectedObject.rotation.y,
        z: selectedObject.rotation.z,
      },
      scale: selectedObject.scale.x,
      visible: true,
      opacity: Math.max(current.opacity, 1),
    };

    void setTheatreObjectValue(editor.selectedObject, next, activeBreakpoint);
  }

  return (
    <>
      <SceneReadinessController entranceStartRef={entranceStartRef} onReady={onReady} />
      <OrthographicCamera
        makeDefault
        position={[0, 0, 12]}
        zoom={activeViewport.height / activeViewport.worldHeight}
        near={0.01}
        far={100}
      />
      <Environment preset="apartment" background={false} />
      {renderObjectIds.map((id) => (
        <MerchObject
          key={id}
          id={id}
          appliedRef={appliedRef}
          theatreValuesRef={theatreValuesRef}
          pointerStateRef={pointerStateRef}
          lockMotion={editor.enabled && (editor.selectedObject === id || (id === "box" && isBoxChildObjectId(editor.selectedObject)))}
          selectedObjectId={editor.selectedObject}
          editorEnabled={editor.enabled}
          hoverTiltX={editor.hoverTiltX}
          hoverTiltY={editor.hoverTiltY}
          hoverFollow={editor.hoverFollow}
          hoverRange={editor.hoverRange}
          productCupColor={productCupColor}
          productCupArtworkUrl={productCupArtworkUrl}
          productCupDecorationMethod={productCupDecorationMethod}
          setSelectedRef={setSelectedObject}
          activeBreakpoint={activeBreakpoint}
          entranceEnabled={entranceEnabled && entranceObjectIds.includes(id)}
          entranceIndex={Math.max(0, entranceObjectIds.indexOf(id))}
          entranceStartRef={entranceStartRef}
        />
      ))}
      {editor.enabled && selectedObject && (renderObjectIds.includes(editor.selectedObject) || isBoxChildObjectId(editor.selectedObject)) ? (
        <TransformControls object={selectedObject} mode={editor.mode} size={0.8} onObjectChange={saveTransform} />
      ) : null}
    </>
  );
}

type GlobalSceneCanvasProps = {
  productCupColor: ProductCupColorValue;
  productCupArtworkUrl?: string | null;
  productCupDecorationMethod?: ProductCupDecorationMethod;
  onReady?: () => void;
};

export function GlobalSceneCanvas({ productCupColor, productCupArtworkUrl = null, productCupDecorationMethod = "digital", onReady }: GlobalSceneCanvasProps) {
  const editor = useEditorStore();
  const runtime = useExperienceRuntime();

  return (
    <div className={`scene-layer ${runtime.mode === "webflow" ? "is-webflow" : ""} ${editor.enabled ? "is-editing" : ""}`} aria-hidden="true">
      <Canvas
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.82;
          scene.environmentIntensity = 0.82;
        }}
      >
        {performanceDebugEnabled ? <PerformanceProbe /> : null}
        <Suspense fallback={null}>
          <SceneContent
            productCupColor={productCupColor}
            productCupArtworkUrl={productCupArtworkUrl}
            productCupDecorationMethod={productCupDecorationMethod}
            onReady={onReady}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(modelPath);
