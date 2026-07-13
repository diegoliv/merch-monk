import type { AppliedSceneState, SceneObjectState, SceneState, Vec3, ViewportInfo } from "./types";
import { objectIds } from "./sceneObjects";


export function getWorldSize(width: number, height: number) {
  const worldHeight = 10;
  const worldWidth = worldHeight * (width / Math.max(height, 1));
  return { worldWidth, worldHeight };
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function interpolateObjectState(a: SceneObjectState, b: SceneObjectState, t: number): SceneObjectState {
  return {
    anchor: [lerp(a.anchor[0], b.anchor[0], t), lerp(a.anchor[1], b.anchor[1], t)],
    position: lerpVec3(a.position, b.position, t),
    rotation: lerpVec3(a.rotation, b.rotation, t),
    scale: lerp(a.scale, b.scale, t),
    opacity: lerp(a.opacity, b.opacity, t),
    visible: a.visible || b.visible || lerp(a.opacity, b.opacity, t) > 0.01,
  };
}

export function anchorToWorld(anchor: [number, number], viewport: ViewportInfo): Vec3 {
  const x = (anchor[0] / 100 - 0.5) * viewport.worldWidth;
  const y = (0.5 - anchor[1] / 100) * viewport.worldHeight;
  return [x, y, 0];
}

export function percentOffsetToWorld(position: Vec3, viewport: ViewportInfo): Vec3 {
  return [
    (position[0] / 100) * viewport.worldWidth,
    -(position[1] / 100) * viewport.worldHeight,
    position[2],
  ];
}

export function worldOffsetToPercent(position: Vec3, viewport: ViewportInfo): Vec3 {
  return [
    (position[0] / viewport.worldWidth) * 100,
    -(position[1] / viewport.worldHeight) * 100,
    position[2],
  ];
}

export function percentScaleToWorld(scale: number, viewport: ViewportInfo) {
  return (scale / 100) * Math.min(viewport.worldWidth, viewport.worldHeight);
}

export function worldScaleToPercent(scale: number, viewport: ViewportInfo) {
  return (scale / Math.min(viewport.worldWidth, viewport.worldHeight)) * 100;
}

export function applyViewport(state: SceneObjectState, viewport: ViewportInfo) {
  const anchored = anchorToWorld(state.anchor, viewport);
  const offset = percentOffsetToWorld(state.position, viewport);
  return {
    position: state.position,
    rotation: state.rotation,
    scale: percentScaleToWorld(state.scale, viewport),
    opacity: state.opacity,
    visible: state.visible,
    worldPosition: [
      anchored[0] + offset[0],
      anchored[1] + offset[1],
      anchored[2] + offset[2],
    ] as Vec3,
  };
}

export function interpolateSceneState(from: SceneState, to: SceneState, viewport: ViewportInfo, progress: number): AppliedSceneState {
  const eased = easeInOut(Math.min(Math.max(progress, 0), 1));

  return objectIds.reduce((result, id) => {
    const fromState = from[id][viewport.breakpoint];
    const toState = to[id][viewport.breakpoint];
    result[id] = applyViewport(interpolateObjectState(fromState, toState, eased), viewport);
    return result;
  }, {} as AppliedSceneState);
}
