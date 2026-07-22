import { useEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { percentOffsetToWorld } from "./math";
import { backgroundCollectionId } from "./sceneObjects";
import type { DomPinMap } from "./DomPinController";
import type { AppliedSceneState, ObjectId, ViewportInfo } from "./types";

type BackgroundCollectionProps = {
  activeViewportRef: MutableRefObject<ViewportInfo>;
  appliedRef: MutableRefObject<AppliedSceneState>;
  children: ReactNode;
  collectionRef: MutableRefObject<THREE.Group | null>;
  domPinsRef: MutableRefObject<DomPinMap>;
  selectedObjectId: ObjectId;
  setSelectedRef: (id: ObjectId, instance: THREE.Object3D | null) => void;
};

export function BackgroundCollection({
  activeViewportRef,
  appliedRef,
  children,
  collectionRef,
  domPinsRef,
  selectedObjectId,
  setSelectedRef,
}: BackgroundCollectionProps) {
  const groupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (selectedObjectId === backgroundCollectionId && groupRef.current) {
      setSelectedRef(backgroundCollectionId, groupRef.current);
    }
  }, [selectedObjectId, setSelectedRef]);

  useFrame(() => {
    const group = groupRef.current;
    const state = appliedRef.current[backgroundCollectionId];
    if (!group || !state) return;

    let x = state.worldPosition[0];
    let y = state.worldPosition[1];
    const domPin = domPinsRef.current[backgroundCollectionId];
    if (domPin?.active) {
      const offset = percentOffsetToWorld(state.position, activeViewportRef.current);
      x = domPin.worldPosition[0] + offset[0];
      y = domPin.worldPosition[1] + offset[1];
    }

    group.position.set(x, y, state.worldPosition[2]);
    group.rotation.set(state.rotation[0], state.rotation[1], state.rotation[2], "XYZ");
    group.scale.setScalar(state.scale);
    group.visible = state.visible && state.opacity > 0.01;
    group.updateMatrixWorld(true);
  }, -50);

  return (
    <group
      name={backgroundCollectionId}
      ref={(instance) => {
        groupRef.current = instance;
        collectionRef.current = instance;
        if (instance && selectedObjectId === backgroundCollectionId) {
          setSelectedRef(backgroundCollectionId, instance);
        }
      }}
    >
      {children}
    </group>
  );
}
