import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrthographicCamera, TransformControls, useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { breakpointPreviewSizes, resolveBreakpointMode } from "./breakpoints";
import { anchorToWorld, applyViewport, getWorldSize } from "./math";
import { boxChildObjectIds, objectIds, renderObjectIds } from "./sceneObjects";
import { editorStore, useEditorStore } from "./editorStore";
import { getTheatreObject, getTheatreObjects, type TheatreObjectValue, valueToSceneState } from "./theatreProject";
import { selectTheatreObject, setTheatreObjectValue } from "./theatreStudio";
import { useSceneProgress } from "./useSceneProgress";
import { useViewportInfo } from "./useViewportInfo";
import type { ProductCupColor } from "../components/StorySections";
import { useExperienceRuntime } from "../experienceRuntime";
import type { AppliedSceneState, BoxChildObjectId, Breakpoint, ObjectId } from "./types";

const modelPath = window.MerchMonkWebflow?.modelUrl ?? "/models/merch_monk_website.glb";
const modelNodeNames: Partial<Record<ObjectId, string>> = { box: "box_bones", product_cup: "cup" };
const boxAnimationNames = new Set(["box_open"]);

type TheatreValues = Record<ObjectId, TheatreObjectValue>;
type BoxChildValues = Record<BoxChildObjectId, TheatreObjectValue>;
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
function setOpacity(object: THREE.Object3D, opacity: number) {
  object.traverse((child) => {
    if (!("material" in child)) return;
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    materials.forEach((material) => {
      if (!material) return;
      material.transparent = opacity < 0.999;
      material.opacity = opacity;
      material.depthWrite = opacity > 0.5;
    });
  });
}

function applyProductCupMaterial(object: THREE.Object3D, productCupColor: ProductCupColor) {
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
      } else if (name.includes("orange") || name.includes("cup.uv")) {
        pbr.color.set(productCupColor.color);
      }
      if ("roughness" in pbr) pbr.roughness = Math.max(pbr.roughness ?? 0, 0.62);
      if ("metalness" in pbr) pbr.metalness = Math.min(pbr.metalness ?? 0, 0.08);
      material.needsUpdate = true;
    });
  });
}
function applyBoxChildStates(root: THREE.Object3D, childValues: BoxChildValues, restTransforms: Partial<Record<BoxChildObjectId, RestTransform>>, parentOpacity: number) {
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

    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(value.rotation.x, value.rotation.y, value.rotation.z, "XYZ"));
    target.quaternion.copy(rest.quaternion).multiply(rotation);
    target.scale.set(rest.scale.x * value.scale, rest.scale.y * value.scale, rest.scale.z * value.scale);
    const opacity = value.opacity * parentOpacity;
    target.visible = value.visible && opacity > 0.01;
    setOpacity(target, opacity);
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
  state: AppliedSceneState[ObjectId];
  selected: boolean;
  lockMotion: boolean;
  selectedObjectId: ObjectId;
  editorEnabled: boolean;
  hoverTiltX: number;
  hoverTiltY: number;
  hoverFollow: number;
  hoverRange: number;
  animationProgress: number;
  childValues: BoxChildValues;
  productCupColor: ProductCupColor;
  setSelectedRef: (instance: THREE.Object3D | null) => void;
  activeBreakpoint: Breakpoint;
};

function MerchObject({ id, state, selected, lockMotion, selectedObjectId, editorEnabled, hoverTiltX, hoverTiltY, hoverFollow, hoverRange, animationProgress, childValues, productCupColor, setSelectedRef, activeBreakpoint }: MerchObjectProps) {
  const { scene, animations } = useGLTF(modelPath);
  const { camera, size } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const pointerRef = useRef(new THREE.Vector2());
  const pointerActiveRef = useRef(false);
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
  useEffect(() => {
    if (id !== "product_cup" || !object) return;
    applyProductCupMaterial(object, productCupColor);
  }, [id, object, productCupColor]);

  function applyState(float = 0, tilt = tiltRef.current) {
    if (!groupRef.current) return;
    groupRef.current.position.set(state.worldPosition[0], state.worldPosition[1] + float, state.worldPosition[2]);
    baseEulerRef.current.set(state.rotation[0], state.rotation[1], state.rotation[2], "XYZ");
    baseQuaternionRef.current.setFromEuler(baseEulerRef.current);
    globalTiltEulerRef.current.set(tilt.x, tilt.y, 0, "XYZ");
    globalTiltQuaternionRef.current.setFromEuler(globalTiltEulerRef.current);
    groupRef.current.quaternion.copy(baseQuaternionRef.current).premultiply(globalTiltQuaternionRef.current);
    groupRef.current.scale.setScalar(state.scale);
    groupRef.current.visible = state.visible && state.opacity > 0.01;
    if (object) {
      setOpacity(object, state.opacity);
      if (id === "box") applyBoxChildStates(object, childValues, boxChildRestTransforms, state.opacity);
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

  useEffect(() => {
    if (!mixerRef.current || !boxActionRef.current || !boxAnimationClip) return;

    const progress = THREE.MathUtils.clamp(animationProgress, 0, 1);
    const duration = boxAnimationClip.duration;
    const time = progress >= 1 ? Math.max(0, duration - 0.0001) : progress * duration;
    boxActionRef.current.time = time;
    mixerRef.current.update(0);
  }, [animationProgress, boxAnimationClip]);
  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      pointerRef.current.set((event.clientX / size.width) * 2 - 1, -(event.clientY / size.height) * 2 + 1);
      pointerActiveRef.current = true;
    }

    function handlePointerLeave() {
      pointerActiveRef.current = false;
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [size.height, size.width]);

  useEffect(() => {
    applyState(0);
  }, [state.worldPosition[0], state.worldPosition[1], state.worldPosition[2], state.rotation[0], state.rotation[1], state.rotation[2], state.scale, state.opacity, state.visible]);

  useFrame(({ clock }) => {
    if (lockMotion) {
      tiltRef.current.lerp(targetTiltRef.current.set(0, 0), 0.18);
      applyState(0, tiltRef.current);
      return;
    }

    const phase = objectIds.indexOf(id) * 0.45;
    const float = Math.sin(clock.elapsedTime * 0.55 + phase) * 0.045;
    applyState(float);

    if (!groupRef.current || !object || !state.visible || state.opacity <= 0.08 || !pointerActiveRef.current) {
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
    applyState(float, tiltRef.current);
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
  productCupColor: ProductCupColor;
};

function SceneContent({ productCupColor }: SceneContentProps) {
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
  const [theatreValues, setTheatreValues] = useState<TheatreValues>(() => initialTheatreValues(activeBreakpoint));

  useEffect(() => {
    const objects = getTheatreObjects(activeBreakpoint);
    setTheatreValues(initialTheatreValues(activeBreakpoint));

    const unsubscribers = objectIds.map((id) => objects[id].onValuesChange((value) => {
      setTheatreValues((current) => ({ ...current, [id]: value as TheatreObjectValue }));
    }));

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [activeBreakpoint]);

  const applied = objectIds.reduce((result, id) => {
    result[id] = applyViewport(valueToSceneState(theatreValues[id]), activeViewport);
    return result;
  }, {} as AppliedSceneState);
  const boxChildValues = boxChildObjectIds.reduce((values, id) => {
    values[id] = theatreValues[id];
    return values;
  }, {} as BoxChildValues);

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
          state={applied[id]}
          selected={editor.enabled && editor.selectedObject === id}
          lockMotion={editor.enabled && (editor.selectedObject === id || (id === "box" && isBoxChildObjectId(editor.selectedObject)))}
          selectedObjectId={editor.selectedObject}
          editorEnabled={editor.enabled}
          hoverTiltX={editor.hoverTiltX}
          hoverTiltY={editor.hoverTiltY}
          hoverFollow={editor.hoverFollow}
          hoverRange={editor.hoverRange}
          animationProgress={theatreValues[id].boxAnimationProgress ?? 0}
          childValues={boxChildValues}
          productCupColor={productCupColor}
          setSelectedRef={setSelectedObject}
          activeBreakpoint={activeBreakpoint}
        />
      ))}
      {editor.enabled && selectedObject && (renderObjectIds.includes(editor.selectedObject) || isBoxChildObjectId(editor.selectedObject)) ? (
        <TransformControls object={selectedObject} mode={editor.mode} size={0.8} onObjectChange={saveTransform} />
      ) : null}
    </>
  );
}

type GlobalSceneCanvasProps = {
  productCupColor: ProductCupColor;
};

export function GlobalSceneCanvas({ productCupColor }: GlobalSceneCanvasProps) {
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
        <Suspense fallback={null}>
          <SceneContent productCupColor={productCupColor} />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(modelPath);
