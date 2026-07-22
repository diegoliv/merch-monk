import type {
  AppliedObjectState,
  BackgroundObjectId,
  Breakpoint,
  SceneObjectState,
  Vec3,
  ViewportInfo,
} from "./types";


export type CrewneckGridSettings = {
  follow: number;
  offset: { x: number; y: number };
  scale: number;
};

export type BackgroundGridLayout = {
  cellSize: number;
  columns: number;
  gap: number;
  height: number;
  left: number;
  right: number;
  rows: number;
  top: number;
  width: number;
};

const backgroundGridFullScale: Record<Breakpoint, number> = {
  desktop: 28,
  tablet: 10,
  mobile: 10,
};
export const crewneckGridDefaults: CrewneckGridSettings = {
  follow: 1,
  offset: { x: 0, y: 0 },
  scale: 79.57211668135525,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getBackgroundGridLayout(
  width: number,
  height: number,
  breakpoint: Breakpoint = "desktop",
): BackgroundGridLayout {
  const columns = 3;
  const rows = 3;
  const isDesktop = breakpoint === "desktop";
  const edge = isDesktop
    ? clamp(width * 0.02, 24, 40)
    : breakpoint === "tablet"
      ? clamp(width * 0.06, 32, 56)
      : clamp(width * 0.04, 14, 24);
  const gap = isDesktop
    ? clamp(width * 0.0125, 16, 24)
    : breakpoint === "tablet"
      ? clamp(width * 0.02, 14, 22)
      : clamp(width * 0.03, 10, 16);
  const availableWidth = Math.max(1, isDesktop ? width * 0.5 - edge : width - edge * 2);
  const widthLimitedCellSize = Math.max(1, (availableWidth - gap * (columns - 1)) / columns);
  const cellSize = Math.min(height * 0.28, widthLimitedCellSize);
  const gridWidth = cellSize * columns + gap * (columns - 1);
  const gridHeight = cellSize * rows + gap * (rows - 1);
  const left = isDesktop ? width - edge - gridWidth : (width - gridWidth) / 2;

  return {
    cellSize,
    columns,
    gap,
    height: gridHeight,
    left,
    right: width - left - gridWidth,
    rows,
    top: (height - gridHeight) / 2,
    width: gridWidth,
  };
}


export function applyBackgroundGridViewport(
  _id: BackgroundObjectId,
  state: SceneObjectState,
  viewport: ViewportInfo,
): AppliedObjectState {
  const layout = getBackgroundGridLayout(viewport.width, viewport.height, viewport.breakpoint);
  const worldUnit = Math.min(viewport.worldWidth, viewport.worldHeight) / 100;
  const fullScale = (layout.cellSize / viewport.height) * viewport.worldHeight;

  return {
    position: state.position,
    rotation: state.rotation,
    scale: fullScale * (state.scale / backgroundGridFullScale[viewport.breakpoint]),
    opacity: state.opacity,
    visible: state.visible,
    worldPosition: [
      state.position[0] * worldUnit,
      -state.position[1] * worldUnit,
      state.position[2],
    ],
  };
}

export function backgroundGridWorldToTheatre(
  _id: BackgroundObjectId,
  worldPosition: Vec3,
  worldScale: number,
  viewport: ViewportInfo,
) {
  const layout = getBackgroundGridLayout(viewport.width, viewport.height, viewport.breakpoint);
  const worldUnit = Math.min(viewport.worldWidth, viewport.worldHeight) / 100;
  const fullScale = (layout.cellSize / viewport.height) * viewport.worldHeight;

  return {
    position: {
      x: worldUnit > 0 ? worldPosition[0] / worldUnit : 0,
      y: worldUnit > 0 ? -worldPosition[1] / worldUnit : 0,
      z: worldPosition[2],
    },
    scale: fullScale > 0
      ? (worldScale / fullScale) * backgroundGridFullScale[viewport.breakpoint]
      : backgroundGridFullScale[viewport.breakpoint],
  };
}

export function getCrewneckGridFollowWeight(
  backgroundState: SceneObjectState,
  settings: CrewneckGridSettings,
  viewport: ViewportInfo,
) {
  if (!backgroundState.visible) return 0;

  const fullScale = backgroundGridFullScale[viewport.breakpoint];
  const presence = clamp(backgroundState.scale / fullScale, 0, 1);
  const easedPresence = presence * presence * (3 - 2 * presence);
  return clamp(settings.follow, 0, 1) * easedPresence * clamp(backgroundState.opacity, 0, 1);
}

export function applyCrewneckGridViewport(
  crewneckState: AppliedObjectState,
  backgroundState: AppliedObjectState,
  backgroundTheatreState: SceneObjectState,
  settings: CrewneckGridSettings,
  viewport: ViewportInfo,
): AppliedObjectState {
  const follow = getCrewneckGridFollowWeight(backgroundTheatreState, settings, viewport);
  if (follow <= 0) return crewneckState;

  const targetPosition: Vec3 = [
    backgroundState.worldPosition[0] + (settings.offset.x / 100) * backgroundState.scale,
    backgroundState.worldPosition[1] - (settings.offset.y / 100) * backgroundState.scale,
    crewneckState.worldPosition[2],
  ];
  const targetScale = backgroundState.scale * (settings.scale / 100);

  return {
    ...crewneckState,
    scale: crewneckState.scale + (targetScale - crewneckState.scale) * follow,
    worldPosition: [
      crewneckState.worldPosition[0] + (targetPosition[0] - crewneckState.worldPosition[0]) * follow,
      crewneckState.worldPosition[1] + (targetPosition[1] - crewneckState.worldPosition[1]) * follow,
      crewneckState.worldPosition[2],
    ],
  };
}

export function crewneckGridWorldToSettings(
  targetWorldPosition: Vec3,
  targetWorldScale: number,
  backgroundState: AppliedObjectState,
  current: CrewneckGridSettings,
): CrewneckGridSettings {
  if (backgroundState.scale <= 0.000001) return current;

  return {
    follow: current.follow,
    offset: {
      x: ((targetWorldPosition[0] - backgroundState.worldPosition[0]) / backgroundState.scale) * 100,
      y: -((targetWorldPosition[1] - backgroundState.worldPosition[1]) / backgroundState.scale) * 100,
    },
    scale: Math.max(0, (targetWorldScale / backgroundState.scale) * 100),
  };
}
