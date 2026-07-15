import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { tuneMaterial } from "../three/sceneAppearance";
import {
  defaultStudioTransform,
  type StudioMaterialDescriptor,
  type StudioMaterialEdit,
  type StudioTransform,
} from "./studioTypes";

type StudioObjectProps = {
  modelUrl: string;
  visibleNames: string[];
  activeName: string | null;
  transforms: Record<string, StudioTransform>;
  materialEdits: Record<string, Record<string, StudioMaterialEdit>>;
  onObjectsDiscovered: (names: string[]) => void;
  onMaterialsDiscovered: (materials: StudioMaterialDescriptor[]) => void;
  onObjectReady: (object: THREE.Group | null) => void;
};

type StudioObjectInstanceProps = {
  source: THREE.Object3D;
  name: string;
  active: boolean;
  transform: StudioTransform;
  materialEdits: Record<string, StudioMaterialEdit>;
  onMaterialsDiscovered: (materials: StudioMaterialDescriptor[]) => void;
  onObjectReady: (object: THREE.Group | null) => void;
};

type PreparedObject = {
  object: THREE.Group;
  materials: StudioMaterialDescriptor[];
};

function materialId(name: string, index: number) {
  const safeName = name.trim().toLowerCase().replace(/[^a-z0-9.-]+/g, "-") || "material";
  return `${safeName}-${index}`;
}

function prepareObject(source: THREE.Object3D): PreparedObject {
  const cloned = cloneSkeleton(source);
  const materialClones = new Map<THREE.Material, THREE.Material>();
  const descriptors: StudioMaterialDescriptor[] = [];

  cloned.traverse((child) => {
    if (!("material" in child)) return;
    const mesh = child as THREE.Mesh;
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const nextMaterials = sourceMaterials.map((sourceMaterial) => {
      let material = materialClones.get(sourceMaterial);
      if (!material) {
        material = sourceMaterial.clone();
        tuneMaterial(material);
        const id = materialId(material.name, descriptors.length);
        material.userData.studioMaterialId = id;
        material.userData.studioOriginalMap = "map" in material
          ? (material as THREE.MeshStandardMaterial).map
          : null;
        descriptors.push({
          id,
          name: material.name || `Material ${descriptors.length + 1}`,
          color: "color" in material
            ? `#${(material as THREE.MeshStandardMaterial).color.getHexString()}`
            : "#ffffff",
        });
        materialClones.set(sourceMaterial, material);
      }
      return material;
    });
    mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0];
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  cloned.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(cloned);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  cloned.position.sub(center);

  const normalized = new THREE.Group();
  normalized.name = `${source.name}_studio-normalized`;
  if (Number.isFinite(maxDimension) && maxDimension > 0) {
    normalized.scale.setScalar(2.6 / maxDimension);
  }
  normalized.add(cloned);
  normalized.updateMatrixWorld(true);

  return { object: normalized, materials: descriptors };
}

function StudioObjectInstance({
  source,
  name,
  active,
  transform,
  materialEdits,
  onMaterialsDiscovered,
  onObjectReady,
}: StudioObjectInstanceProps) {
  const transformRef = useRef<THREE.Group>(null);
  const prepared = useMemo(() => prepareObject(source), [source]);

  useEffect(() => {
    if (!active) return;
    onMaterialsDiscovered(prepared.materials);
  }, [active, onMaterialsDiscovered, prepared]);

  useEffect(() => {
    if (!active) return;
    onObjectReady(transformRef.current);
    return () => onObjectReady(null);
  }, [active, onObjectReady, prepared]);

  useEffect(() => {
    let cancelled = false;
    const loadedTextures: THREE.Texture[] = [];

    prepared.object.traverse((child) => {
      if (!("material" in child)) return;
      const mesh = child as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        const id = material.userData.studioMaterialId as string | undefined;
        const edit = id ? materialEdits[id] : undefined;
        if (!edit) return;
        if ("color" in material) {
          (material as THREE.MeshStandardMaterial).color.set(edit.color);
        }

        const pbr = material as THREE.MeshStandardMaterial;
        const originalMap = material.userData.studioOriginalMap as THREE.Texture | null;
        if (!edit.textureUrl) {
          pbr.map = originalMap;
          material.needsUpdate = true;
          return;
        }

        new THREE.TextureLoader().load(
          edit.textureUrl,
          (texture) => {
            if (cancelled) {
              texture.dispose();
              return;
            }
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.flipY = false;
            texture.needsUpdate = true;
            loadedTextures.push(texture);
            pbr.map = texture;
            material.needsUpdate = true;
          },
          undefined,
          () => {
            if (!cancelled) console.warn(`[Merch Monk Studio] Could not load texture for ${edit.name}.`);
          },
        );
      });
    });

    return () => {
      cancelled = true;
      loadedTextures.forEach((texture) => texture.dispose());
    };
  }, [materialEdits, prepared]);

  return (
    <group
      ref={transformRef}
      name={`${name}_studio-transform`}
      position={transform.position}
      rotation={transform.rotation.map(THREE.MathUtils.degToRad) as THREE.Vector3Tuple}
      scale={transform.scale}
    >
      <primitive object={prepared.object} />
    </group>
  );
}

export function StudioObject({
  modelUrl,
  visibleNames,
  activeName,
  transforms,
  materialEdits,
  onObjectsDiscovered,
  onMaterialsDiscovered,
  onObjectReady,
}: StudioObjectProps) {
  const { scene } = useGLTF(modelUrl);

  const objectNames = useMemo(
    () => scene.children
      .filter((child) => Boolean(child.name) && !child.name.toLowerCase().startsWith("bg_"))
      .map((child) => child.name),
    [scene],
  );

  const sources = useMemo(
    () => new Map(scene.children.map((child) => [child.name, child])),
    [scene],
  );

  useEffect(() => {
    onObjectsDiscovered(objectNames);
  }, [objectNames, onObjectsDiscovered]);

  useEffect(() => {
    if (activeName) return;
    onMaterialsDiscovered([]);
    onObjectReady(null);
  }, [activeName, onMaterialsDiscovered, onObjectReady]);

  return (
    <>
      {visibleNames.map((name) => {
        const source = sources.get(name);
        if (!source) return null;
        return (
          <StudioObjectInstance
            key={name}
            source={source}
            name={name}
            active={name === activeName}
            transform={transforms[name] ?? defaultStudioTransform}
            materialEdits={materialEdits[name] ?? {}}
            onMaterialsDiscovered={onMaterialsDiscovered}
            onObjectReady={onObjectReady}
          />
        );
      })}
    </>
  );
}
