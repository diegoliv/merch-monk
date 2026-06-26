import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrthographicCamera, TransformControls, useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { anchorToWorld, applyViewport } from "./math";
import { objectIds } from "./sceneObjects";
import { editorStore, useEditorStore } from "./editorStore";
import { getTheatreObject, theatreObjects, type TheatreObjectValue, valueToSceneState } from "./theatreProject";
import { selectTheatreObject, setTheatreObjectValue } from "./theatreStudio";
import { useSceneProgress } from "./useSceneProgress";
import { useViewportInfo } from "./useViewportInfo";
import type { AppliedSceneState, ObjectId } from "./types";

const modelPath = "/models/merch_monk_website.glb";

type TheatreValues = Record<ObjectId, TheatreObjectValue>;

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

function cloneNode(node: THREE.Object3D) {
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
  return cloned;
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

function initialTheatreValues(): TheatreValues {
  return objectIds.reduce((values, id) => {
    values[id] = theatreObjects[id].value;
    return values;
  }, {} as TheatreValues);
}

type MerchObjectProps = {
  id: ObjectId;
  state: AppliedSceneState[ObjectId];
  selected: boolean;
  editorEnabled: boolean;
  hoverTiltX: number;
  hoverTiltY: number;
  hoverFollow: number;
  hoverRange: number;
  setSelectedRef: (instance: THREE.Group | null) => void;
};

function MerchObject({ id, state, selected, editorEnabled, hoverTiltX, hoverTiltY, hoverFollow, hoverRange, setSelectedRef }: MerchObjectProps) {
  const { scene } = useGLTF(modelPath);
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
  const boxRef = useRef(new THREE.Box3());
  const centerRef = useRef(new THREE.Vector3());
  const object = useMemo(() => {
    const node = scene.getObjectByName(id);
    return node ? cloneNode(node) : null;
  }, [id, scene]);

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
    if (object) setOpacity(object, state.opacity);
  }

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
    if (selected) {
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
        if (selected) setSelectedRef(instance);
      }}
      onPointerDown={(event) => {
        if (!editorEnabled) return;
        event.stopPropagation();
        editorStore.setSelection({ selectedObject: id });
        void selectTheatreObject(id);
      }}
    >
      <primitive object={object} />
    </group>
  );
}

function SceneContent() {
  useSceneProgress();
  const viewport = useViewportInfo();
  const editor = useEditorStore();
  const [selectedObject, setSelectedObject] = useState<THREE.Group | null>(null);
  const [theatreValues, setTheatreValues] = useState<TheatreValues>(initialTheatreValues);

  useEffect(() => {
    const unsubscribers = objectIds.map((id) => theatreObjects[id].onValuesChange((value) => {
      setTheatreValues((current) => ({ ...current, [id]: value }));
    }));

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const applied = objectIds.reduce((result, id) => {
    result[id] = applyViewport(valueToSceneState(theatreValues[id]), viewport);
    return result;
  }, {} as AppliedSceneState);

  function saveTransform() {
    if (!selectedObject) return;

    const object = getTheatreObject(editor.selectedObject);
    const current = object.value;
    const anchorWorld = anchorToWorld([current.anchor.x, current.anchor.y], viewport);
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

    void setTheatreObjectValue(editor.selectedObject, next);
  }

  return (
    <>
      <OrthographicCamera
        makeDefault
        position={[0, 0, 12]}
        zoom={viewport.height / viewport.worldHeight}
        near={0.01}
        far={100}
      />
      <Environment preset="apartment" background={false} />
      {objectIds.map((id) => (
        <MerchObject
          key={id}
          id={id}
          state={applied[id]}
          selected={editor.enabled && editor.selectedObject === id}
          editorEnabled={editor.enabled}
          hoverTiltX={editor.hoverTiltX}
          hoverTiltY={editor.hoverTiltY}
          hoverFollow={editor.hoverFollow}
          hoverRange={editor.hoverRange}
          setSelectedRef={(instance) => {
            if (editor.selectedObject === id) setSelectedObject(instance);
          }}
        />
      ))}
      {editor.enabled && selectedObject ? (
        <TransformControls object={selectedObject} mode={editor.mode} size={0.8} onObjectChange={saveTransform} />
      ) : null}
    </>
  );
}

export function GlobalSceneCanvas() {
  const editor = useEditorStore();

  return (
    <div className={`scene-layer ${editor.enabled ? "is-editing" : ""}`} aria-hidden="true">
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
          <SceneContent />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(modelPath);
