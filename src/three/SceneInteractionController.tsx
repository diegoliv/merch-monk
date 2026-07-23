import { useEffect, useMemo, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneMotionInput } from "./useSceneMotionInput";
import type { ObjectId } from "./types";

type SceneInteractionTarget = {
  object: THREE.Object3D;
  isActive: () => boolean;
};

export type SceneInteractionRegistry = {
  targets: Map<ObjectId, SceneInteractionTarget>;
  owners: WeakMap<THREE.Object3D, ObjectId>;
  nodesById: Map<ObjectId, THREE.Object3D[]>;
  register: (id: ObjectId, target: SceneInteractionTarget) => void;
  unregister: (id: ObjectId, object?: THREE.Object3D) => void;
};

export type SceneInteractionState = {
  hoveredId: ObjectId | null;
  pointerNdc: THREE.Vector2;
};

export function createSceneInteractionRegistry(): SceneInteractionRegistry {
  const targets = new Map<ObjectId, SceneInteractionTarget>();
  const owners = new WeakMap<THREE.Object3D, ObjectId>();
  const nodesById = new Map<ObjectId, THREE.Object3D[]>();

  function unregister(id: ObjectId, object?: THREE.Object3D) {
    const current = targets.get(id);
    if (object && current?.object !== object) return;
    nodesById.get(id)?.forEach((node) => owners.delete(node));
    nodesById.delete(id);
    targets.delete(id);
  }

  function register(id: ObjectId, target: SceneInteractionTarget) {
    unregister(id);
    const nodes: THREE.Object3D[] = [];
    target.object.traverse((node) => {
      owners.set(node, id);
      nodes.push(node);
    });
    nodesById.set(id, nodes);
    targets.set(id, target);
  }

  return { targets, owners, nodesById, register, unregister };
}

function isWorldVisible(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

export function DemandFrameEvents() {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const requestFrame = () => invalidate();
    document.addEventListener("scroll", requestFrame, { capture: true, passive: true });
    window.addEventListener("resize", requestFrame, { passive: true });
    window.addEventListener("orientationchange", requestFrame, { passive: true });
    return () => {
      document.removeEventListener("scroll", requestFrame, true);
      window.removeEventListener("resize", requestFrame);
      window.removeEventListener("orientationchange", requestFrame);
    };
  }, [invalidate]);

  return null;
}

type SceneInteractionControllerProps = {
  inputRef: MutableRefObject<SceneMotionInput>;
  registry: SceneInteractionRegistry;
  stateRef: MutableRefObject<SceneInteractionState>;
};

export function SceneInteractionController({ inputRef, registry, stateRef }: SceneInteractionControllerProps) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  useFrame(() => {
    const input = inputRef.current;
    if (!input.active || input.source !== "pointer") {
      stateRef.current.hoveredId = null;
      return;
    }

    const canvasBounds = gl.domElement.getBoundingClientRect();
    if (canvasBounds.width <= 0 || canvasBounds.height <= 0) {
      stateRef.current.hoveredId = null;
      return;
    }

    const pointer = stateRef.current.pointerNdc;
    pointer.set(
      ((input.clientX - canvasBounds.left) / canvasBounds.width) * 2 - 1,
      -((input.clientY - canvasBounds.top) / canvasBounds.height) * 2 + 1,
    );

    const activeTargets = Array.from(registry.targets.values())
      .filter((target) => target.isActive() && isWorldVisible(target.object))
      .map((target) => target.object);
    if (activeTargets.length === 0) {
      stateRef.current.hoveredId = null;
      return;
    }

    raycaster.setFromCamera(pointer, camera);
    const intersection = raycaster.intersectObjects(activeTargets, true)[0];
    let hit: THREE.Object3D | null = intersection?.object ?? null;
    let hoveredId: ObjectId | null = null;
    while (hit && hoveredId === null) {
      hoveredId = registry.owners.get(hit) ?? null;
      hit = hit.parent;
    }
    stateRef.current.hoveredId = hoveredId;
  }, -75);

  return null;
}
