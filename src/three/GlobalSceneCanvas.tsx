import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrthographicCamera, TransformControls, useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { breakpointDprRanges, resolveBreakpointMode } from "./breakpoints";
import { BackgroundCollection } from "./BackgroundCollection";
import { DomPinController, type DomPinMap } from "./DomPinController";
import {
  applyBackgroundGridViewport,
  applyCrewneckGridViewport,
  backgroundGridWorldToTheatre,
  crewneckGridDefaults,
  crewneckGridWorldToSettings,
  getCrewneckGridFollowWeight,
} from "./backgroundGridLayout";
import { anchorToWorld, applyViewport, percentOffsetToWorld, worldOffsetToPercent, worldScaleToPercent } from "./math";
import {
  backgroundChildByParent,
  backgroundCollectionId,
  backgroundChildObjectIds,
  backgroundObjectIds,
  backgroundParentByChild,
  boxChildObjectIds,
  objectIds,
  pinnableObjectIds,
  renderObjectIds,
} from "./sceneObjects";
import { editorStore, useEditorStore } from "./editorStore";
import { getTheatreObject, getTheatreObjects, theatreProject, type TheatreObjectValue, valueToSceneState } from "./theatreProject";
import { selectTheatreObject, setTheatreObjectValue } from "./theatreStudio";
import { useSceneProgress } from "./useSceneProgress";
import { useViewportInfo } from "./useViewportInfo";
import { useSceneMotionInput, type SceneMotionInput } from "./useSceneMotionInput";
import type { ProductCupColorValue, ProductCupDecorationMethod } from "../components/StorySections";
import { useExperienceRuntime } from "../experienceRuntime";
import { configureSceneRenderer, studioEnvironmentPreset, tuneMaterial } from "./sceneAppearance";
import type { AppliedSceneState, BackgroundChildObjectId, BackgroundObjectId, BoxChildObjectId, Breakpoint, ObjectId, Vec3, ViewportInfo } from "./types";

const modelPath = window.MerchMonkWebflow?.modelUrl ?? "/models/merch_monk_website.glb";
const crewneckLogoPath = "https://cdn.prod.website-files.com/69fb6de67bc0fb48b4ab0147/6a5527787af01c167ce42d3c_f488968c6e31020e99fcf5deeeb44ad6_crewneck-logo.avif";
const boxTexturePath = "https://cdn.prod.website-files.com/69fb6de67bc0fb48b4ab0147/6a5a88f85ff267f9a82727a8_box_body.avif";
const boxTextureTargets = [
  { nodeName: "box", materialName: null, recursive: false, overlay: false, path: boxTexturePath },
  {
    nodeName: "cup_box",
    materialName: "cup_uv",
    recursive: true,
    overlay: true,
    path: "https://cdn.prod.website-files.com/69fb6de67bc0fb48b4ab0147/6a613ce5aa236d5e3064fef2_bottle-logo.avif",
  },
  {
    nodeName: "notebook_box",
    materialName: "notebook_uv",
    overlay: true,
    recursive: true,
    path: "https://cdn.prod.website-files.com/69fb6de67bc0fb48b4ab0147/6a613ce50330e513548c5356_notebook-logo.avif",
  },
] as const;
const modelNodeNames: Partial<Record<ObjectId, string>> = { box: "box_bones", product_cup: "cup" };
const boxAnimationNames = new Set(["box_open"]);
const entranceObjectIds: ObjectId[] = renderObjectIds.filter((id) => id !== "box" && id !== "product_cup");
const entranceDuration = 0.55;
const entranceStagger = 0.05;
const backgroundChildDepthGap = 0.24;
const backgroundCollectionNeutralScale = 10;

type TheatreValues = Record<ObjectId, TheatreObjectValue>;
type BoxChildValues = Record<BoxChildObjectId, TheatreObjectValue>;
type BackgroundChildValues = Record<BackgroundChildObjectId, TheatreObjectValue>;
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
  pivot?: THREE.Vector3;
};

function isBoxChildObjectId(id: ObjectId): id is BoxChildObjectId {
  return boxChildObjectIds.includes(id as BoxChildObjectId);
}
function isBackgroundObjectId(id: ObjectId): id is BackgroundObjectId {
  return backgroundObjectIds.includes(id as BackgroundObjectId);
}

function isBackgroundChildObjectId(id: ObjectId): id is BackgroundChildObjectId {
  return backgroundChildObjectIds.includes(id as BackgroundChildObjectId);
}


function cloneNode(
  node: THREE.Object3D,
  centerPivot = false,
  backgroundChildId?: BackgroundChildObjectId | null,
) {
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

  if (backgroundChildId !== undefined) {
    const composite = new THREE.Group();
    composite.name = `${node.name}_background`;
    composite.add(cloned);
    composite.updateMatrixWorld(true);

    const child = backgroundChildId
      ? cloned.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(backgroundChildId))
      : null;
    if (child && backgroundChildId) {
      child.name = backgroundChildId;
      composite.attach(child);
    }

    composite.updateMatrixWorld(true);

    const backgroundBounds = new THREE.Box3().setFromObject(cloned);
    if (child) {
      const childBounds = new THREE.Box3().setFromObject(child);
      child.position.z += backgroundBounds.max.z - childBounds.min.z + backgroundChildDepthGap;
      child.updateMatrixWorld(true);
    }

    const center = backgroundBounds.getCenter(new THREE.Vector3());
    const wrapper = new THREE.Group();
    wrapper.name = `${node.name}_centered`;
    composite.position.sub(center);
    wrapper.add(composite);
    wrapper.updateMatrixWorld(true);
    return wrapper;
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

type BoxTextureMaterialState = {
  material: THREE.MeshStandardMaterial;
  map: THREE.Texture | null;
  color: THREE.Color;
  texture: THREE.Texture;
};

function createBoxTextureOverlay(material: THREE.MeshStandardMaterial, source: THREE.Texture) {
  const image = source.image as
    | (CanvasImageSource & {
        naturalHeight?: number;
        naturalWidth?: number;
        height?: number;
        width?: number;
      })
    | undefined;
  const width = image?.naturalWidth ?? image?.width ?? 0;
  const height = image?.naturalHeight ?? image?.height ?? 0;
  if (!image || !width || !height) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = material.color.getStyle();
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = source.anisotropy;
  texture.needsUpdate = true;
  return texture;
}

function applyBoxTexture(
  object: THREE.Object3D,
  nodeName: string,
  materialName: string | null,
  recursive: boolean,
  overlay: boolean,
  texture: THREE.Texture,
) {
  const target = object.getObjectByName(nodeName);
  if (!target) return [];

  const states: BoxTextureMaterialState[] = [];
  target.traverse((child) => {
    if (!recursive && child !== target) return;
    if (!("material" in child)) return;
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return;
      if (materialName && material.name !== materialName) return;
      const appliedTexture = overlay ? createBoxTextureOverlay(material, texture) : texture;
      if (!appliedTexture) return;
      states.push({
        material,
        map: material.map,
        color: material.color.clone(),
        texture: appliedTexture,
      });
      material.map = appliedTexture;
      material.color.set("#ffffff");
      material.needsUpdate = true;
    });
  });
  return states;
}

function setOpacity(materials: THREE.Material[], opacity: number) {
  materials.forEach((material) => {
    material.transparent = opacity < 0.999;
    material.opacity = opacity;
    material.depthWrite = opacity > 0.5;
  });
}

type CrewneckLogoMaterialState = {
  material: THREE.MeshStandardMaterial;
  baseEmissive: THREE.Color;
  baseEmissiveMap: THREE.Texture | null;
  baseEmissiveIntensity: number;
  logoMap: THREE.Texture;
};

function createCrewneckLogoTexture(image: HTMLImageElement) {
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

function setCrewneckLogoVisible(states: CrewneckLogoMaterialState[], visible: boolean) {
  states.forEach(({ material, baseEmissive, baseEmissiveMap, baseEmissiveIntensity, logoMap }) => {
    if (visible) material.emissive.set("#ffffff");
    else material.emissive.copy(baseEmissive);
    material.emissiveMap = visible ? logoMap : baseEmissiveMap;
    material.emissiveIntensity = visible ? 1 : baseEmissiveIntensity;
    material.needsUpdate = true;
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

function applyBackgroundChildState(
  root: THREE.Object3D,
  parentId: BackgroundObjectId,
  childValues: BackgroundChildValues,
  rest: RestTransform | undefined,
  childMaterials: THREE.Material[],
  parentOpacity: number,
  tiltQuaternion: THREE.Quaternion,
  rotationEuler: THREE.Euler,
  rotationQuaternion: THREE.Quaternion,
  parentWorldQuaternion: THREE.Quaternion,
  localTiltQuaternion: THREE.Quaternion,
  baseChildQuaternion: THREE.Quaternion,
  pivotOffset: THREE.Vector3,
) {
  const childId = backgroundChildByParent[parentId];
  if (!childId || !rest) return;

  const target = root.getObjectByName(childId);
  const value = childValues[childId];
  if (!target || !value) return;

  target.position.set(
    rest.position.x + value.position.x,
    rest.position.y + value.position.y,
    rest.position.z + value.position.z,
  );
  rotationEuler.set(value.rotation.x, value.rotation.y, value.rotation.z, "XYZ");
  rotationQuaternion.setFromEuler(rotationEuler);
  baseChildQuaternion.copy(rest.quaternion).multiply(rotationQuaternion);
  if (target.parent) {
    target.parent.getWorldQuaternion(parentWorldQuaternion);
    if (
      !Number.isFinite(parentWorldQuaternion.x) ||
      !Number.isFinite(parentWorldQuaternion.y) ||
      !Number.isFinite(parentWorldQuaternion.z) ||
      !Number.isFinite(parentWorldQuaternion.w)
    ) {
      parentWorldQuaternion.identity();
    }
  } else {
    parentWorldQuaternion.identity();
  }
  localTiltQuaternion
    .copy(parentWorldQuaternion)
    .invert()
    .multiply(tiltQuaternion)
    .multiply(parentWorldQuaternion);
  target.quaternion.copy(localTiltQuaternion).multiply(baseChildQuaternion);
  target.scale.set(rest.scale.x * value.scale, rest.scale.y * value.scale, rest.scale.z * value.scale);
  if (rest.pivot) {
    pivotOffset.copy(rest.pivot).multiply(target.scale).applyQuaternion(baseChildQuaternion);
    target.position.add(pivotOffset);
    pivotOffset.copy(rest.pivot).multiply(target.scale).applyQuaternion(target.quaternion);
    target.position.sub(pivotOffset);
  }
  const opacity = value.opacity * parentOpacity;
  target.visible = value.visible && opacity > 0.01;
  setOpacity(childMaterials, opacity);
}

function initialTheatreValues(breakpoint: Breakpoint): TheatreValues {
  const objects = getTheatreObjects(breakpoint);

  return objectIds.reduce((values, id) => {
    values[id] = objects[id].value as TheatreObjectValue;
    return values;
  }, {} as TheatreValues);
}

function applyTheatreViewport(id: ObjectId, value: TheatreObjectValue, viewport: ViewportInfo) {
  const state = valueToSceneState(value);
  if (id === backgroundCollectionId) {
    const applied = applyViewport(state, viewport);
    return { ...applied, scale: state.scale / backgroundCollectionNeutralScale };
  }
  if (isBackgroundObjectId(id)) {
    return applyBackgroundGridViewport(id, state, viewport);
  }
  return applyViewport(state, viewport);
}

function applyCrewneckGridLayout(
  applied: AppliedSceneState,
  values: TheatreValues,
  viewport: ViewportInfo,
) {
  const crewneckValue = values.crewneck;
  const backgroundValue = values.bg_crewneck;
  const crewneckState = applyTheatreViewport("crewneck", crewneckValue, viewport);
  const backgroundState = applyTheatreViewport("bg_crewneck", backgroundValue, viewport);

  applied.bg_crewneck = backgroundState;
  applied.crewneck = applyCrewneckGridViewport(
    crewneckState,
    backgroundState,
    valueToSceneState(backgroundValue),
    crewneckValue.grid ?? crewneckGridDefaults,
    viewport,
  );
  return applied;
}

function applyTheatreValues(values: TheatreValues, viewport: ViewportInfo) {
  const applied = objectIds.reduce((result, id) => {
    result[id] = applyTheatreViewport(id, values[id], viewport);
    return result;
  }, {} as AppliedSceneState);

  return applyCrewneckGridLayout(applied, values, viewport);
}

function updateAppliedTheatreValue(
  applied: AppliedSceneState,
  values: TheatreValues,
  id: ObjectId,
  viewport: ViewportInfo,
) {
  if (id === "crewneck" || id === "bg_crewneck") {
    applyCrewneckGridLayout(applied, values, viewport);
    return;
  }

  applied[id] = applyTheatreViewport(id, values[id], viewport);
}

type MerchObjectProps = {
  id: ObjectId;
  appliedRef: MutableRefObject<AppliedSceneState>;
  theatreValuesRef: MutableRefObject<TheatreValues>;
  domPinsRef: MutableRefObject<DomPinMap>;
  activeViewportRef: MutableRefObject<ViewportInfo>;
  backgroundCollectionRef: MutableRefObject<THREE.Group | null>;
  motionInputRef: MutableRefObject<SceneMotionInput>;
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
  setSelectedRef: (id: ObjectId, instance: THREE.Object3D | null) => void;
  activeBreakpoint: Breakpoint;
  entranceEnabled: boolean;
  entranceIndex: number;
  entranceStartRef: MutableRefObject<number | null>;
};

function MerchObject({ id, appliedRef, theatreValuesRef, domPinsRef, activeViewportRef, backgroundCollectionRef, motionInputRef, lockMotion, selectedObjectId, editorEnabled, hoverTiltX, hoverTiltY, hoverFollow, hoverRange, productCupColor, productCupArtworkUrl, productCupDecorationMethod, setSelectedRef, activeBreakpoint, entranceEnabled, entranceIndex, entranceStartRef }: MerchObjectProps) {
  const { scene, animations } = useGLTF(modelPath);
  const { camera, gl } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const pointerRef = useRef(new THREE.Vector2());
  const pinTargetRef = useRef(new THREE.Vector3());
  const collectionLocalTargetRef = useRef(new THREE.Vector3());
  const collectionWorldTargetRef = useRef(new THREE.Vector3());
  const collectionWorldScaleRef = useRef(new THREE.Vector3());
  const collectionWorldQuaternionRef = useRef(new THREE.Quaternion());
  const collectionFollowQuaternionRef = useRef(new THREE.Quaternion());
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
  const childParentWorldQuaternionRef = useRef(new THREE.Quaternion());
  const childLocalTiltQuaternionRef = useRef(new THREE.Quaternion());
  const childBaseQuaternionRef = useRef(new THREE.Quaternion());
  const childPivotOffsetRef = useRef(new THREE.Vector3());
  const lastOpacityRef = useRef(Number.NaN);
  const lastAnimationProgressRef = useRef(Number.NaN);
  const crewneckLogoMaterialsRef = useRef<CrewneckLogoMaterialState[]>([]);
  const lastShowLogoRef = useRef<boolean | null>(null);

  const object = useMemo(() => {
    const node = scene.getObjectByName(modelNodeNames[id] ?? id);
    return node ? cloneNode(node, id === "box", isBackgroundObjectId(id) ? backgroundChildByParent[id] ?? null : undefined) : null;
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
  const backgroundChildId = isBackgroundObjectId(id) ? backgroundChildByParent[id] : undefined;
  const backgroundChildRestTransform = useMemo(() => {
    if (!backgroundChildId || !object) return undefined;
    const child = object.getObjectByName(backgroundChildId);
    if (!child) return undefined;
    const bounds = new THREE.Box3().setFromObject(child);
    const pivot = bounds.isEmpty()
      ? new THREE.Vector3()
      : child.worldToLocal(bounds.getCenter(new THREE.Vector3()));
    const rest = {
      position: child.position.clone(),
      quaternion: child.quaternion.clone(),
      scale: child.scale.clone(),
      pivot,
    };
    child.userData.restTransform = rest;
    return rest;
  }, [backgroundChildId, object]);
  const materials = useMemo(() => (object ? collectMaterials(object) : []), [object]);
  const backgroundChildMaterials = useMemo(() => {
    if (!backgroundChildId || !object) return [];
    const child = object.getObjectByName(backgroundChildId);
    return child ? collectMaterials(child) : [];
  }, [backgroundChildId, object]);
  const boxChildMaterials = useMemo(() => {
    if (id !== "box" || !object) return {};
    return boxChildObjectIds.reduce((result, childId) => {
      const child = object.getObjectByName(childId);
      if (child) result[childId] = collectMaterials(child);
      return result;
    }, {} as Partial<Record<BoxChildObjectId, THREE.Material[]>>);
  }, [id, object]);
  useEffect(() => {
    if (id !== "crewneck" || !object) return;

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      const logoMap = createCrewneckLogoTexture(image);
      const logoStates = materials.flatMap((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return [];
        return [{
          material,
          baseEmissive: material.emissive.clone(),
          baseEmissiveMap: material.emissiveMap,
          baseEmissiveIntensity: material.emissiveIntensity,
          logoMap,
        }];
      });
      crewneckLogoMaterialsRef.current = logoStates;
      const showLogo = theatreValuesRef.current.crewneck.showLogo === true;
      setCrewneckLogoVisible(logoStates, showLogo);
      lastShowLogoRef.current = showLogo;
    };
    image.onerror = () => {
      if (!cancelled) console.warn("[Merch Monk] Could not load crewneck logo texture: " + crewneckLogoPath);
    };
    image.src = crewneckLogoPath;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
      setCrewneckLogoVisible(crewneckLogoMaterialsRef.current, false);
      crewneckLogoMaterialsRef.current[0]?.logoMap.dispose();
      crewneckLogoMaterialsRef.current = [];
      lastShowLogoRef.current = null;
    };
  }, [id, materials, object, theatreValuesRef]);
  useEffect(() => {
    if (id !== "box" || !object) return;

    let cancelled = false;
    const materialStates: BoxTextureMaterialState[] = [];
    const textures = new Set<THREE.Texture>();
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    boxTextureTargets.forEach((target) => {
      loader.load(
        target.path,
        (loadedTexture) => {
          if (cancelled) {
            loadedTexture.dispose();
            return;
          }
          loadedTexture.colorSpace = THREE.SRGBColorSpace;
          loadedTexture.flipY = false;
          loadedTexture.anisotropy = gl.capabilities.getMaxAnisotropy();
          loadedTexture.needsUpdate = true;
          textures.add(loadedTexture);
          const appliedStates = applyBoxTexture(
            object,
            target.nodeName,
            target.materialName,
            target.recursive,
            target.overlay,
            loadedTexture,
          );
          if (appliedStates.length === 0) {
            console.warn(`[Merch Monk] Could not find texture target: ${target.nodeName}/${target.materialName ?? "material"}`);
          }
          appliedStates.forEach((state) => textures.add(state.texture));
          materialStates.push(...appliedStates);
        },
        undefined,
        () => {
          if (!cancelled) console.warn("[Merch Monk] Could not load box texture: " + target.path);
        },
      );
    });

    return () => {
      cancelled = true;
      materialStates.forEach(({ material, map, color, texture }) => {
        if (material.map !== texture) return;
        material.map = map;
        material.color.copy(color);
        material.needsUpdate = true;
      });
      textures.forEach((texture) => texture.dispose());
    };
  }, [gl, id, object]);
  useEffect(() => {
    if (id !== "product_cup" || !object) return;

    let cancelled = false;
    let colorTexture: THREE.CanvasTexture | null = null;
    let bumpTexture: THREE.CanvasTexture | null = null;
    applyProductCupMaterial(object, productCupColor, productCupDecorationMethod);
    if (!productCupArtworkUrl) return;

    const artworkUrl = productCupArtworkUrl;
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
      if (!cancelled) console.warn(`[Merch Monk] Could not load product cup artwork: ${artworkUrl}`);
    };
    image.src = artworkUrl;

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

  function applyState(tilt = tiltRef.current, entranceScale = 1) {
    const group = groupRef.current;
    if (!group) return;
    const state = appliedRef.current[id];
    if (!state) return;

    const isBackground = isBackgroundObjectId(id);
    let worldX = state.worldPosition[0];
    let worldY = state.worldPosition[1];
    let worldZ = state.worldPosition[2];
    let worldScale = state.scale;
    let collectionFollow = 0;
    const domPin = domPinsRef.current[id];
    if (domPin?.active) {
      const value = theatreValuesRef.current[id];
      const offset = percentOffsetToWorld([
        value.position.x,
        value.position.y,
        0,
      ], activeViewportRef.current);
      const pinTarget = pinTargetRef.current.set(
        domPin.worldPosition[0] + offset[0],
        domPin.worldPosition[1] + offset[1],
        state.worldPosition[2],
      );
      const parent = group.parent;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        parent.worldToLocal(pinTarget);
      }
      worldX = pinTarget.x;
      worldY = pinTarget.y;
      worldZ = pinTarget.z;
    }

    if (id === "crewneck" && backgroundCollectionRef.current) {
      const backgroundState = appliedRef.current.bg_crewneck;
      const backgroundValue = theatreValuesRef.current.bg_crewneck;
      const collectionState = appliedRef.current[backgroundCollectionId];
      const grid = theatreValuesRef.current.crewneck.grid ?? crewneckGridDefaults;
      const collectionPresence = collectionState.visible ? collectionState.opacity : 0;
      collectionFollow = getCrewneckGridFollowWeight(
        valueToSceneState(backgroundValue),
        grid,
        activeViewportRef.current,
      ) * collectionPresence;

      if (collectionFollow > 0.0001) {
        const localTarget = collectionLocalTargetRef.current.set(
          backgroundState.worldPosition[0] + (grid.offset.x / 100) * backgroundState.scale,
          backgroundState.worldPosition[1] - (grid.offset.y / 100) * backgroundState.scale,
          state.worldPosition[2],
        );
        const collection = backgroundCollectionRef.current;
        collection.updateWorldMatrix(true, false);
        const worldTarget = collectionWorldTargetRef.current.copy(localTarget).applyMatrix4(collection.matrixWorld);
        if (domPin?.active) {
          worldX += (worldTarget.x - worldX) * collectionFollow;
          worldY += (worldTarget.y - worldY) * collectionFollow;
        } else {
          worldX += (worldTarget.x - localTarget.x) * collectionFollow;
          worldY += (worldTarget.y - localTarget.y) * collectionFollow;
        }

        collection.getWorldScale(collectionWorldScaleRef.current);
        const gridTargetScale = backgroundState.scale * (grid.scale / 100);
        worldScale += gridTargetScale * (collectionWorldScaleRef.current.x - 1) * collectionFollow;

        collection.getWorldQuaternion(collectionWorldQuaternionRef.current);
        collectionFollowQuaternionRef.current
          .identity()
          .slerp(collectionWorldQuaternionRef.current, collectionFollow);
      }
    }

    group.position.set(worldX, worldY, worldZ);
    baseEulerRef.current.set(state.rotation[0], state.rotation[1], state.rotation[2], "XYZ");
    baseQuaternionRef.current.setFromEuler(baseEulerRef.current);
    globalTiltEulerRef.current.set(tilt.x, tilt.y, 0, "XYZ");
    globalTiltQuaternionRef.current.setFromEuler(globalTiltEulerRef.current);
    group.quaternion.copy(baseQuaternionRef.current);
    if (!isBackground) group.quaternion.premultiply(globalTiltQuaternionRef.current);
    if (collectionFollow > 0.0001) {
      group.quaternion.premultiply(collectionFollowQuaternionRef.current);
    }
    group.scale.setScalar(worldScale * entranceScale);
    group.visible = state.visible && state.opacity > 0.01;
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
      if (isBackground) {
        applyBackgroundChildState(
          object,
          id,
          theatreValuesRef.current as BackgroundChildValues,
          backgroundChildRestTransform,
          backgroundChildMaterials,
          state.opacity,
          globalTiltQuaternionRef.current,
          childRotationEulerRef.current,
          childRotationQuaternionRef.current,
          childParentWorldQuaternionRef.current,
          childLocalTiltQuaternionRef.current,
          childBaseQuaternionRef.current,
          childPivotOffsetRef.current,
        );

      }
      if (id === "crewneck") {
        const showLogo = theatreValuesRef.current.crewneck.showLogo === true;
        if (lastShowLogoRef.current !== showLogo) {
          setCrewneckLogoVisible(crewneckLogoMaterialsRef.current, showLogo);
          lastShowLogoRef.current = showLogo;
        }
      }
    }
  }

  useEffect(() => {
    if (id === "box" && isBoxChildObjectId(selectedObjectId) && object) {
      setSelectedRef(selectedObjectId, object.getObjectByName(selectedObjectId) ?? null);
      return;
    }

    if (
      isBackgroundChildObjectId(selectedObjectId) &&
      backgroundParentByChild[selectedObjectId] === id &&
      object
    ) {
      setSelectedRef(selectedObjectId, object.getObjectByName(selectedObjectId) ?? null);
      return;
    }

    if (selectedObjectId === id && groupRef.current) {
      setSelectedRef(id, groupRef.current);
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
    const motionInput = motionInputRef.current;
    const entranceStart = entranceStartRef.current;
    const entranceElapsed = entranceStart === null ? 0 : clock.elapsedTime - entranceStart - entranceIndex * entranceStagger;
    const entranceProgress = entranceEnabled
      ? THREE.MathUtils.clamp(entranceElapsed / entranceDuration, 0, 1)
      : 1;
    const entranceScale = 1 - Math.pow(1 - entranceProgress, 3);
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
      applyState(tiltRef.current, entranceScale);
      return;
    }

    const motionObject = backgroundChildId
      ? object?.getObjectByName(backgroundChildId) ?? null
      : isBackgroundObjectId(id)
        ? null
        : groupRef.current;
    const motionValue = backgroundChildId ? theatreValuesRef.current[backgroundChildId] : state;

    if (
      !groupRef.current ||
      !object ||
      !motionObject ||
      !state.visible ||
      state.opacity <= 0.08 ||
      !motionValue?.visible ||
      motionValue.opacity <= 0.08 ||
      !motionInput.active
    ) {
      targetTiltRef.current.set(0, 0);
    } else if (motionInput.source === "orientation") {
      const orientationRange = 24 * Math.max(hoverRange, 0.25);
      const horizontal = THREE.MathUtils.clamp(motionInput.orientationX / orientationRange, -1, 1);
      const vertical = THREE.MathUtils.clamp(motionInput.orientationY / orientationRange, -1, 1);
      targetTiltRef.current.set(-vertical * hoverTiltX, horizontal * hoverTiltY);
    } else {
      const canvasBounds = gl.domElement.getBoundingClientRect();
      pointerRef.current.set(
        ((motionInput.clientX - canvasBounds.left) / Math.max(canvasBounds.width, 1)) * 2 - 1,
        -((motionInput.clientY - canvasBounds.top) / Math.max(canvasBounds.height, 1)) * 2 + 1,
      );
      groupRef.current.updateMatrixWorld(true);
      raycasterRef.current.setFromCamera(pointerRef.current, camera);

      const isPointerOverObject = raycasterRef.current.intersectObject(motionObject, true).length > 0;
      if (isPointerOverObject) {
        targetTiltRef.current.set(0, 0);
      } else {
        boxRef.current.setFromObject(motionObject);
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
    applyState(tiltRef.current, entranceScale);
  });

  if (!object) return null;

  return (
    <group
      ref={(instance) => {
        groupRef.current = instance;
        if (selectedObjectId === id) setSelectedRef(id, instance);
      }}
      onPointerDown={(event) => {
        if (!editorEnabled) return;
        event.stopPropagation();

        let clicked: THREE.Object3D | null = event.object;
        while (id === "box" && object && clicked) {
          if (isBoxChildObjectId(clicked.name as ObjectId)) {
            editorStore.setSelection({ selectedObject: clicked.name as BoxChildObjectId });
            setSelectedRef(clicked.name as BoxChildObjectId, clicked);
            void selectTheatreObject(clicked.name as BoxChildObjectId, activeBreakpoint);
            return;
          }
          if (clicked === object) break;
          clicked = clicked.parent;
        }

        clicked = event.object;
        while (backgroundChildId && object && clicked) {
          if (clicked.name === backgroundChildId) {
            editorStore.setSelection({ selectedObject: backgroundChildId });
            setSelectedRef(backgroundChildId, clicked);
            void selectTheatreObject(backgroundChildId, activeBreakpoint);
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
  motionInputRef: MutableRefObject<SceneMotionInput>;
  onReady?: () => void;
  viewport: ViewportInfo;
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

function SceneContent({ productCupColor, productCupArtworkUrl = null, productCupDecorationMethod = "digital", motionInputRef, onReady, viewport }: SceneContentProps) {
  const performanceDebug = getPerformanceDebug();
  if (performanceDebug) performanceDebug.sceneRenders += 1;
  const runtime = useExperienceRuntime();
  const editor = useEditorStore();
  const runtimeBreakpointMode = editor.enabled ? editor.breakpointMode : "auto";
  const activeBreakpoint = resolveBreakpointMode(runtimeBreakpointMode, viewport.breakpoint);
  const activeViewport = useMemo(
    () => ({ ...viewport, breakpoint: activeBreakpoint }),
    [activeBreakpoint, viewport],
  );
  const activeViewportRef = useRef(activeViewport);
  activeViewportRef.current = activeViewport;
  const domPinsRef = useRef<DomPinMap>({});
  const backgroundCollectionRef = useRef<THREE.Group | null>(null);
  useSceneProgress(activeBreakpoint);
  const [selectedTransformTarget, setSelectedTransformTarget] = useState<{
    id: ObjectId;
    object: THREE.Object3D;
  } | null>(null);
  const setSelectedRef = useCallback((id: ObjectId, instance: THREE.Object3D | null) => {
    if (!instance) return;
    setSelectedTransformTarget((current) => (
      current?.id === id && current.object === instance
        ? current
        : { id, object: instance }
    ));
  }, []);
  const theatreValuesRef = useRef<TheatreValues>(initialTheatreValues(activeBreakpoint));
  const appliedRef = useRef<AppliedSceneState>(
    applyTheatreValues(theatreValuesRef.current, activeViewport),
  );
  const entranceStartRef = useRef<number | null>(null);
  const entranceEnabled = runtime.mode === "webflow" && !editor.enabled;

  useEffect(() => {
    const objects = getTheatreObjects(activeBreakpoint);
    theatreValuesRef.current = initialTheatreValues(activeBreakpoint);
    appliedRef.current = applyTheatreValues(theatreValuesRef.current, activeViewportRef.current);

    const unsubscribers = objectIds.map((id) => objects[id].onValuesChange((value) => {
      const debug = getPerformanceDebug();
      if (debug) debug.theatreUpdates += 1;
      theatreValuesRef.current[id] = value as TheatreObjectValue;
      updateAppliedTheatreValue(appliedRef.current, theatreValuesRef.current, id, activeViewportRef.current);
    }));

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [activeBreakpoint]);

  useEffect(() => {
    appliedRef.current = applyTheatreValues(theatreValuesRef.current, activeViewport);
  }, [activeViewport]);

  function saveTransform() {
    if (!selectedTransformTarget || selectedTransformTarget.id !== editor.selectedObject) return;
    const selectedObject = selectedTransformTarget.object;

    const object = getTheatreObject(editor.selectedObject, activeBreakpoint);
    const current = object.value as TheatreObjectValue;

    if (isBoxChildObjectId(editor.selectedObject) || isBackgroundChildObjectId(editor.selectedObject)) {
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

    const currentState = valueToSceneState(current as TheatreObjectValue);
    if (editor.selectedObject === "crewneck") {
      const backgroundValue = theatreValuesRef.current.bg_crewneck;
      const backgroundTheatreState = valueToSceneState(backgroundValue);
      const grid = current.grid ?? crewneckGridDefaults;
      const follow = getCrewneckGridFollowWeight(backgroundTheatreState, grid, activeViewport);

      if (follow > 0.001) {
        const normalState = applyViewport(currentState, activeViewport);
        const backgroundState = applyTheatreViewport("bg_crewneck", backgroundValue, activeViewport);
        const inverseFollow = 1 / follow;
        const targetPosition: Vec3 = [
          (selectedObject.position.x - normalState.worldPosition[0] * (1 - follow)) * inverseFollow,
          (selectedObject.position.y - normalState.worldPosition[1] * (1 - follow)) * inverseFollow,
          selectedObject.position.z,
        ];
        const targetScale = (
          selectedObject.scale.x - normalState.scale * (1 - follow)
        ) * inverseFollow;
        const nextGrid = crewneckGridWorldToSettings(
          targetPosition,
          targetScale,
          backgroundState,
          grid,
        );

        void setTheatreObjectValue(editor.selectedObject, {
          position: {
            x: current.position.x,
            y: current.position.y,
            z: selectedObject.position.z,
          },
          rotation: {
            x: selectedObject.rotation.x,
            y: selectedObject.rotation.y,
            z: selectedObject.rotation.z,
          },
          grid: nextGrid,
          visible: true,
          opacity: Math.max(current.opacity, 1),
        }, activeBreakpoint);
        return;
      }
    }

    if (isBackgroundObjectId(editor.selectedObject)) {
      const next = backgroundGridWorldToTheatre(
        editor.selectedObject,
        selectedObject.position.toArray() as Vec3,
        selectedObject.scale.x,
        activeViewport,
      );
      void setTheatreObjectValue(editor.selectedObject, {
        ...next,
        visible: true,
        opacity: Math.max(current.opacity, 1),
      }, activeBreakpoint);
      return;
    }

    const domPin = domPinsRef.current[editor.selectedObject];
    const anchorWorld = domPin?.active ? domPin.worldPosition : anchorToWorld([current.anchor.x, current.anchor.y], activeViewport);
    const position = worldOffsetToPercent([
      selectedObject.position.x - anchorWorld[0],
      selectedObject.position.y - anchorWorld[1],
      selectedObject.position.z - anchorWorld[2],
    ], activeViewport);
    const next: Partial<TheatreObjectValue> = {
      position: {
        x: position[0],
        y: position[1],
        z: position[2],
      },
      rotation: {
        x: selectedObject.rotation.x,
        y: selectedObject.rotation.y,
        z: selectedObject.rotation.z,
      },
      scale: worldScaleToPercent(selectedObject.scale.x, activeViewport),
      visible: true,
      opacity: Math.max(current.opacity, 1),
    };

    void setTheatreObjectValue(editor.selectedObject, next, activeBreakpoint);
  }

  function renderMerchObject(id: ObjectId) {
    return (
      <MerchObject
        key={id}
        id={id}
        appliedRef={appliedRef}
        theatreValuesRef={theatreValuesRef}
        domPinsRef={domPinsRef}
        activeViewportRef={activeViewportRef}
        backgroundCollectionRef={backgroundCollectionRef}
        motionInputRef={motionInputRef}
        lockMotion={editor.enabled && (
          editor.selectedObject === id ||
          (editor.selectedObject === backgroundCollectionId && isBackgroundObjectId(id)) ||
          (id === "box" && isBoxChildObjectId(editor.selectedObject)) ||
          (isBackgroundChildObjectId(editor.selectedObject) && backgroundParentByChild[editor.selectedObject] === id)
        )}
        selectedObjectId={editor.selectedObject}
        editorEnabled={editor.enabled}
        hoverTiltX={editor.hoverTiltX}
        hoverTiltY={editor.hoverTiltY}
        hoverFollow={editor.hoverFollow}
        hoverRange={editor.hoverRange}
        productCupColor={productCupColor}
        productCupArtworkUrl={productCupArtworkUrl}
        productCupDecorationMethod={productCupDecorationMethod}
        setSelectedRef={setSelectedRef}
        activeBreakpoint={activeBreakpoint}
        entranceEnabled={entranceEnabled && entranceObjectIds.includes(id)}
        entranceIndex={Math.max(0, entranceObjectIds.indexOf(id))}
        entranceStartRef={entranceStartRef}
      />
    );
  }

  return (
    <>
      <DomPinController
        root={runtime.pageElement ?? document}
        breakpoint={activeBreakpoint}
        viewport={activeViewport}
        pinsRef={domPinsRef}
      />
      <SceneReadinessController entranceStartRef={entranceStartRef} onReady={onReady} />
      <OrthographicCamera
        makeDefault
        position={[0, 0, 12]}
        zoom={activeViewport.height / activeViewport.worldHeight}
        near={0.01}
        far={100}
      />
      <Environment preset={studioEnvironmentPreset} background={false} />
      {renderObjectIds.filter((id) => !isBackgroundObjectId(id)).map(renderMerchObject)}
      <BackgroundCollection
        activeViewportRef={activeViewportRef}
        appliedRef={appliedRef}
        collectionRef={backgroundCollectionRef}
        domPinsRef={domPinsRef}
        selectedObjectId={editor.selectedObject}
        setSelectedRef={setSelectedRef}
      >
        {backgroundObjectIds.map(renderMerchObject)}
      </BackgroundCollection>
      {editor.enabled && selectedTransformTarget?.id === editor.selectedObject && (pinnableObjectIds.includes(editor.selectedObject) || isBoxChildObjectId(editor.selectedObject) || isBackgroundChildObjectId(editor.selectedObject)) ? (
        <TransformControls object={selectedTransformTarget.object} mode={editor.mode} size={0.8} onObjectChange={saveTransform} />
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
  const viewport = useViewportInfo();
  const { inputRef: motionInputRef } = useSceneMotionInput(viewport.breakpoint);
  const dpr = breakpointDprRanges[viewport.breakpoint];

  return (
    <>
      <div className={`scene-layer ${runtime.mode === "webflow" ? "is-webflow" : ""} ${editor.enabled ? "is-editing" : ""}`} aria-hidden="true">
        <Canvas
          gl={{ antialias: true, alpha: true }}
          dpr={dpr}
          onCreated={({ gl, scene }) => {
            configureSceneRenderer(gl, scene);
          }}
        >
          {performanceDebugEnabled ? <PerformanceProbe /> : null}
          <Suspense fallback={null}>
            <SceneContent
              productCupColor={productCupColor}
              productCupArtworkUrl={productCupArtworkUrl}
              productCupDecorationMethod={productCupDecorationMethod}
              motionInputRef={motionInputRef}
              onReady={onReady}
              viewport={viewport}
            />
          </Suspense>
        </Canvas>
      </div>
    </>
  );
}

useGLTF.preload(modelPath);
