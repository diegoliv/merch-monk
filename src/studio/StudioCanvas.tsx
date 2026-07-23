import {
  type CSSProperties,
  type MutableRefObject,
  Suspense,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, TransformControls } from "@react-three/drei";
import type {
  OrbitControls as OrbitControlsImpl,
  TransformControls as TransformControlsImpl,
} from "three-stdlib";
import * as THREE from "three";
import { configureSceneRenderer, sceneEnvironmentIntensity } from "../three/sceneAppearance";
import { resolveSceneEnvironmentUrl, SceneEnvironment } from "../three/SceneEnvironment";
import { StudioObject } from "./StudioObject";
import type {
  CameraView,
  ShadowSettings,
  StudioMaterialDescriptor,
  StudioMaterialEdit,
  StudioTransform,
  TransformMode,
} from "./studioTypes";

export type StudioCanvasHandle = {
  exportPng: (width?: number, height?: number) => Promise<Blob>;
  frameObject: () => void;
  resetView: () => void;
  setCameraView: (view: CameraView) => void;
};

type StudioCanvasProps = {
  modelUrl: string;
  visibleNames: string[];
  selectedName: string | null;
  transforms: Record<string, StudioTransform>;
  transformMode: TransformMode;
  materialEdits: Record<string, Record<string, StudioMaterialEdit>>;
  customAspectRatio: number | null;
  shadowSettings: ShadowSettings;
  onObjectsDiscovered: (names: string[]) => void;
  onMaterialsDiscovered: (materials: StudioMaterialDescriptor[]) => void;
  onTransformChange: (transform: StudioTransform) => void;
  onReady?: () => void;
};

type StudioSceneApi = StudioCanvasHandle;

type StudioSceneProps = Omit<StudioCanvasProps, "customAspectRatio"> & {
  onApiReady: (api: StudioSceneApi | null) => void;
};

const cameraHome = new THREE.Vector3(3.4, 2.5, 5.8);
const studioLightOffset = new THREE.Vector3(4, 7, 5);
const studioShadowFloorPosition: [number, number, number] = [0, -1.34, 0];
const studioShadowFloorRotation: [number, number, number] = [-Math.PI / 2, 0, 0];
const studioShadowFloorSize: [number, number] = [200, 200];
const shadowBlurSamples: Record<ShadowSettings["resolution"], number> = {
  512: 6,
  1024: 10,
  2048: 16,
  4096: 24,
};
const cameraViewDirections: Record<CameraView, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0, 1),
  side: new THREE.Vector3(1, 0, 0),
  back: new THREE.Vector3(0, 0, -1),
  top: new THREE.Vector3(0, 1, 0),
  bottom: new THREE.Vector3(0, -1, 0),
};

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not encode the Studio canvas."));
    }, "image/png");
  });
}

function DynamicStudioShadows({
  enabled,
  visibleNames,
  lightRef,
  blur,
}: {
  enabled: boolean;
  visibleNames: string[];
  lightRef: MutableRefObject<THREE.DirectionalLight | null>;
  blur: number;
}) {
  const { gl, scene } = useThree();
  const boundsRef = useRef(new THREE.Box3());
  const targetRef = useRef<THREE.Object3D | null>(null);
  const centerRef = useRef(new THREE.Vector3());
  const sizeRef = useRef(new THREE.Vector3());

  useEffect(() => () => {
    const target = targetRef.current;
    if (target?.parent === scene) scene.remove(target);
  }, [scene]);

  useFrame(() => {
    if (!enabled || !lightRef.current) return;

    scene.updateMatrixWorld(true);
    const bounds = boundsRef.current.makeEmpty();
    visibleNames.forEach((name) => {
      const object = scene.getObjectByName(`${name}_studio-transform`);
      if (object) bounds.expandByObject(object);
    });
    if (bounds.isEmpty()) return;

    const light = lightRef.current;
    const center = bounds.getCenter(centerRef.current);
    const size = bounds.getSize(sizeRef.current);
    const blurPadding = 1 + THREE.MathUtils.clamp(blur / 100, 0, 1) * 3.5;
    const extent = (Math.max(size.x, size.y, size.z, 2) * 0.72 + 0.8) * blurPadding;
    const shadowCamera = light.shadow.camera as THREE.OrthographicCamera;

    if (light.target.parent !== scene) scene.add(light.target);
    targetRef.current = light.target;
    light.target.position.copy(center);
    light.position.copy(center).add(studioLightOffset);
    light.target.updateMatrixWorld(true);
    light.updateMatrixWorld(true);

    shadowCamera.left = -extent;
    shadowCamera.right = extent;
    shadowCamera.top = extent;
    shadowCamera.bottom = -extent;
    shadowCamera.near = 0.1;
    shadowCamera.far = 40;
    shadowCamera.updateProjectionMatrix();
    shadowCamera.updateMatrixWorld(true);

    gl.shadowMap.needsUpdate = true;
    light.shadow.needsUpdate = true;
  });

  return null;
}

function StudioScene({
  modelUrl,
  visibleNames,
  selectedName,
  transforms,
  transformMode,
  materialEdits,
  shadowSettings,
  onObjectsDiscovered,
  onMaterialsDiscovered,
  onTransformChange,
  onReady,
  onApiReady,
}: StudioSceneProps) {
  const { camera, gl, invalidate, scene, size } = useThree();
  const environmentUrl = resolveSceneEnvironmentUrl(modelUrl);
  const orbitRef = useRef<OrbitControlsImpl>(null);
  const transformRef = useRef<TransformControlsImpl>(null);
  const directionalLightRef = useRef<THREE.DirectionalLight>(null);
  const [selectedObject, setSelectedObject] = useState<THREE.Group | null>(null);
  const readySentRef = useRef(false);
  const environmentIntensity = THREE.MathUtils.lerp(
    sceneEnvironmentIntensity,
    0.08,
    shadowSettings.contrast,
  );
  const groundShadowOpacity = THREE.MathUtils.lerp(0.06, 0.65, shadowSettings.contrast);

  const refreshShadows = useCallback(() => {
    if (!shadowSettings.enabled) return;
    gl.shadowMap.needsUpdate = true;
    if (directionalLightRef.current) {
      directionalLightRef.current.shadow.needsUpdate = true;
    }
    invalidate();
  }, [gl, invalidate, shadowSettings.enabled]);

  useEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.VSMShadowMap;
    gl.shadowMap.autoUpdate = true;
    refreshShadows();
    invalidate();
  }, [gl, invalidate, refreshShadows, shadowSettings.enabled]);

  useEffect(() => {
    refreshShadows();
  }, [materialEdits, refreshShadows, shadowSettings, transforms, visibleNames]);

  const getCompositionSphere = useCallback(() => {
    const bounds = new THREE.Box3();
    visibleNames.forEach((name) => {
      const object = scene.getObjectByName(name + "_studio-transform");
      if (!object) return;
      object.updateMatrixWorld(true);
      bounds.expandByObject(object);
    });
    if (bounds.isEmpty() && selectedObject) {
      selectedObject.updateMatrixWorld(true);
      bounds.expandByObject(selectedObject);
    }
    if (bounds.isEmpty()) return null;
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    return Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere : null;
  }, [scene, selectedObject, visibleNames]);

  const frameObject = useCallback(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const sphere = getCompositionSphere();
    if (!sphere) return;

    const controls = orbitRef.current;
    const direction = camera.position.clone().sub(controls?.target ?? sphere.center);
    if (direction.lengthSq() < 0.001) direction.copy(cameraHome);
    direction.normalize();

    camera.position.copy(sphere.center).add(direction.multiplyScalar(8));
    camera.zoom = Math.min(size.width, size.height) / Math.max(sphere.radius * 2.7, 0.01);
    camera.near = 0.01;
    camera.far = 100;
    camera.updateProjectionMatrix();
    controls?.target.copy(sphere.center);
    controls?.update();
    invalidate();
  }, [camera, getCompositionSphere, invalidate, size.height, size.width]);

  const resetView = useCallback(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    camera.position.copy(cameraHome);
    camera.up.set(0, 1, 0);
    orbitRef.current?.target.set(0, 0, 0);
    orbitRef.current?.update();
    frameObject();
  }, [camera, frameObject]);

  const setCameraView = useCallback((view: CameraView) => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const sphere = getCompositionSphere();
    if (!sphere) return;

    const direction = cameraViewDirections[view];
    camera.up.set(0, 1, 0);
    if (view === "top") camera.up.set(0, 0, -1);
    if (view === "bottom") camera.up.set(0, 0, 1);
    camera.position.copy(sphere.center).addScaledVector(direction, 8);
    orbitRef.current?.target.copy(sphere.center);
    orbitRef.current?.update();
    frameObject();
  }, [camera, frameObject, getCompositionSphere]);

  const exportPng = useCallback(async (requestedWidth?: number, requestedHeight?: number) => {
    if (!(camera instanceof THREE.OrthographicCamera)) {
      throw new Error("Studio export requires the orthographic camera.");
    }

    const width = Math.max(1, Math.round(requestedWidth ?? gl.domElement.width));
    const height = Math.max(1, Math.round(requestedHeight ?? gl.domElement.height));
    const maxTextureSize = gl.capabilities.maxTextureSize;
    if (width > maxTextureSize || height > maxTextureSize) {
      throw new Error(`Maximum supported export dimension is ${maxTextureSize}px.`);
    }
    if (width * height > 24_000_000) {
      throw new Error("Export is limited to 24 megapixels to keep the browser responsive.");
    }

    const controls = transformRef.current;
    const wasVisible = controls?.visible ?? false;
    if (controls) controls.visible = false;

    const previousPixelRatio = gl.getPixelRatio();
    try {
      gl.setPixelRatio(1);
      gl.setSize(width, height, false);
      gl.render(scene, camera);
      return await canvasToBlob(gl.domElement);
    } finally {
      gl.setPixelRatio(previousPixelRatio);
      gl.setSize(size.width, size.height, false);
      if (controls) controls.visible = wasVisible;
      gl.render(scene, camera);
    }
  }, [camera, gl, scene, size.height, size.width]);

  useEffect(() => {
    onApiReady({ exportPng, frameObject, resetView, setCameraView });
    return () => onApiReady(null);
  }, [exportPng, frameObject, onApiReady, resetView, setCameraView]);

  useEffect(() => {
    if (!selectedObject) return;
    const frame = requestAnimationFrame(() => {
      frameObject();
      if (!readySentRef.current) {
        readySentRef.current = true;
        onReady?.();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [frameObject, onReady, selectedName, selectedObject]);

  const handleObjectChange = useCallback(() => {
    if (!selectedObject) return;
    selectedObject.updateMatrixWorld(true);
    onTransformChange({
      position: selectedObject.position.toArray(),
      rotation: [
        THREE.MathUtils.radToDeg(selectedObject.rotation.x),
        THREE.MathUtils.radToDeg(selectedObject.rotation.y),
        THREE.MathUtils.radToDeg(selectedObject.rotation.z),
      ],
      scale: selectedObject.scale.toArray(),
    });
    refreshShadows();
  }, [onTransformChange, refreshShadows, selectedObject]);

  return (
    <>
      <SceneEnvironment url={environmentUrl} intensity={environmentIntensity} />

      <directionalLight
        ref={directionalLightRef}
        position={studioLightOffset.toArray()}
        intensity={shadowSettings.lightIntensity}
        castShadow={shadowSettings.enabled}
        shadow-mapSize-width={shadowSettings.resolution}
        shadow-mapSize-height={shadowSettings.resolution}
        shadow-radius={Math.max(1, shadowSettings.blur * 2)}
        shadow-blurSamples={shadowBlurSamples[shadowSettings.resolution]}
        shadow-camera-near={0.1}
        shadow-camera-far={40}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
        shadow-bias={-0.00035}
        shadow-normalBias={shadowSettings.bias}
      />
      <StudioObject
        modelUrl={modelUrl}
        visibleNames={visibleNames}
        activeName={selectedName}
        transforms={transforms}
        materialEdits={materialEdits}
        onObjectsDiscovered={onObjectsDiscovered}
        onMaterialsDiscovered={onMaterialsDiscovered}
        onObjectReady={setSelectedObject}
      />
      <DynamicStudioShadows
        enabled={shadowSettings.enabled}
        visibleNames={visibleNames}
        lightRef={directionalLightRef}
        blur={shadowSettings.blur}
      />
      {shadowSettings.enabled && shadowSettings.groundEnabled ? (
        <mesh
          name="studio-shadow-floor"
          position={studioShadowFloorPosition}
          rotation={studioShadowFloorRotation}
          receiveShadow
        >
          <planeGeometry args={studioShadowFloorSize} />
          <shadowMaterial
            color={shadowSettings.color}
            opacity={groundShadowOpacity}
            transparent
            depthWrite={false}
          />
        </mesh>
      ) : null}
      <OrbitControls
        ref={orbitRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minZoom={40}
        maxZoom={900}
      />
      {selectedObject ? (
        <TransformControls
          ref={transformRef}
          object={selectedObject}
          mode={transformMode}
          size={0.72}
          onChange={refreshShadows}
          onObjectChange={handleObjectChange}
        />
      ) : null}
    </>
  );
}

export const StudioCanvas = forwardRef<StudioCanvasHandle, StudioCanvasProps>(
  function StudioCanvas({
    modelUrl,
    visibleNames,
    selectedName,
    transforms,
    transformMode,
    materialEdits,
    customAspectRatio,
    shadowSettings,
    onObjectsDiscovered,
    onMaterialsDiscovered,
    onTransformChange,
    onReady,
  }, ref) {
    const sceneApiRef = useRef<StudioSceneApi | null>(null);
    const handleApiReady = useCallback((api: StudioSceneApi | null) => {
      sceneApiRef.current = api;
    }, []);

    useImperativeHandle(ref, () => ({
      exportPng: (width, height) => {
        if (!sceneApiRef.current) return Promise.reject(new Error("Studio scene is not ready."));
        return sceneApiRef.current.exportPng(width, height);
      },
      frameObject: () => sceneApiRef.current?.frameObject(),
      resetView: () => sceneApiRef.current?.resetView(),
      setCameraView: (view) => sceneApiRef.current?.setCameraView(view),
    }), []);

    return (
      <div
        className={`studio-canvas-frame ${customAspectRatio ? "is-custom-size" : ""}`}
        style={customAspectRatio
          ? ({
            "--studio-aspect": customAspectRatio,
            aspectRatio: customAspectRatio,
          } as CSSProperties)
          : undefined}
      >
        <Canvas
          orthographic
          shadows="variance"
          frameloop="always"
          camera={{ position: cameraHome.toArray(), zoom: 180, near: 0.01, far: 100 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
          onCreated={({ gl, scene }) => configureSceneRenderer(gl, scene)}
        >
          <Suspense fallback={null}>
            <StudioScene
              modelUrl={modelUrl}
              visibleNames={visibleNames}
              selectedName={selectedName}
              transforms={transforms}
              transformMode={transformMode}
              materialEdits={materialEdits}
              shadowSettings={shadowSettings}
              onObjectsDiscovered={onObjectsDiscovered}
              onMaterialsDiscovered={onMaterialsDiscovered}
              onTransformChange={onTransformChange}
              onReady={onReady}
              onApiReady={handleApiReady}
            />
          </Suspense>
        </Canvas>
      </div>
    );
  },
);
