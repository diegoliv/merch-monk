import type {
  AppliedObjectState,
  BackgroundObjectId,
  Breakpoint,
  SceneObjectState,
  Vec3,
  ViewportInfo,
} from "./types";

type BackgroundGridSlot = {
  column: number;
  row: number;
  theatrePosition: [number, number];
};

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
  tablet: 25,
  mobile: 30,
};
const backgroundResponsiveFullScale = 10;
export const crewneckGridDefaults: CrewneckGridSettings = {
  follow: 1,
  offset: { x: 0, y: 0 },
  scale: 79.57211668135525,
};
const backgroundGridSlots: Record<Breakpoint, Record<BackgroundObjectId, BackgroundGridSlot>> = {
  desktop: {
    bg_cap: { column: 0, row: 0, theatrePosition: [-37, -30] },
    bg_umbrela: { column: 1, row: 0, theatrePosition: [-22.5, -30] },
    bg_tote: { column: 2, row: 0, theatrePosition: [-8, -30] },
    bg_crewneck: { column: 0, row: 1, theatrePosition: [-37, 0] },
    bg_notebook_2: { column: 1, row: 1, theatrePosition: [-22.5, 0] },
    bg_cup: { column: 2, row: 1, theatrePosition: [-8, 0] },
    bg_sweatpants: { column: 0, row: 2, theatrePosition: [-37, 30] },
    "bg_flip-flop": { column: 1, row: 2, theatrePosition: [-22.5, 30] },
    bg_notebook: { column: 2, row: 2, theatrePosition: [-8, 30] },
  },
  tablet: {
    bg_tote: { column: 0, row: 0, theatrePosition: [-42, -25] },
    bg_umbrela: { column: 1, row: 0, theatrePosition: [-14, -25] },
    bg_cap: { column: 2, row: 0, theatrePosition: [14, -25] },
    bg_cup: { column: 3, row: 0, theatrePosition: [42, -25] },
    "bg_flip-flop": { column: 0, row: 1, theatrePosition: [-42, 0] },
    bg_sweatpants: { column: 1, row: 1, theatrePosition: [-14, 0] },
    bg_crewneck: { column: 2, row: 1, theatrePosition: [14, 0] },
    bg_notebook: { column: 3, row: 1, theatrePosition: [42, 0] },
    bg_notebook_2: { column: 1.5, row: 1, theatrePosition: [0, 0] },
  },
  mobile: {
    bg_tote: { column: 0, row: 0, theatrePosition: [-33, -30] },
    bg_umbrela: { column: 1, row: 0, theatrePosition: [0, -30] },
    bg_cap: { column: 2, row: 0, theatrePosition: [33, -30] },
    bg_cup: { column: 0, row: 1, theatrePosition: [-33, -15] },
    bg_crewneck: { column: 1, row: 1, theatrePosition: [0, -15] },
    bg_notebook_2: { column: 2, row: 1, theatrePosition: [33, -15] },
    "bg_flip-flop": { column: 0, row: 2, theatrePosition: [-33, 0] },
    bg_notebook: { column: 1, row: 2, theatrePosition: [0, 0] },
    bg_sweatpants: { column: 2, row: 2, theatrePosition: [33, 0] },
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getBackgroundGridLayout(
  width: number,
  height: number,
  breakpoint: Breakpoint = "desktop",
): BackgroundGridLayout {
  const columns = breakpoint === "tablet" ? 4 : 3;
  const rows = breakpoint === "tablet" ? 2 : 3;
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

export function usesBackgroundGridLayout(state: SceneObjectState, viewport: ViewportInfo) {
  if (viewport.breakpoint !== "desktop") return true;

  return (
    Math.abs(state.anchor[0] - 100) < 0.001 &&
    Math.abs(state.anchor[1] - 50) < 0.001
  );
}

function getBackgroundGridSlotWorld(
  id: BackgroundObjectId,
  viewport: ViewportInfo,
  layout = getBackgroundGridLayout(viewport.width, viewport.height, viewport.breakpoint),
) {
  const slot = backgroundGridSlots[viewport.breakpoint][id];
  const centerX = layout.left + layout.cellSize / 2 + slot.column * (layout.cellSize + layout.gap);
  const centerY = layout.top + layout.cellSize / 2 + slot.row * (layout.cellSize + layout.gap);

  return {
    layout,
    slot,
    worldPosition: [
      (centerX / viewport.width - 0.5) * viewport.worldWidth,
      (0.5 - centerY / viewport.height) * viewport.worldHeight,
      0,
    ] as Vec3,
    worldScale: (layout.cellSize / viewport.height) * viewport.worldHeight,
  };
}

export function applyBackgroundGridViewport(
  id: BackgroundObjectId,
  state: SceneObjectState,
  viewport: ViewportInfo,
): AppliedObjectState {
  const { slot, worldPosition, worldScale } = getBackgroundGridSlotWorld(id, viewport);
  const offsetX = ((state.position[0] - slot.theatrePosition[0]) / 100) * viewport.worldWidth;
  const offsetY = -((state.position[1] - slot.theatrePosition[1]) / 100) * viewport.worldHeight;

  return {
    position: state.position,
    rotation: state.rotation,
    scale: worldScale * (state.scale / backgroundGridFullScale[viewport.breakpoint]),
    opacity: state.opacity,
    visible: state.visible,
    worldPosition: [worldPosition[0] + offsetX, worldPosition[1] + offsetY, state.position[2]],
  };
}

export function backgroundGridWorldToTheatre(
  id: BackgroundObjectId,
  worldPosition: Vec3,
  worldScale: number,
  viewport: ViewportInfo,
) {
  const { slot, worldPosition: slotWorldPosition, worldScale: slotWorldScale } = getBackgroundGridSlotWorld(id, viewport);
  const offsetX = ((worldPosition[0] - slotWorldPosition[0]) / viewport.worldWidth) * 100;
  const offsetY = -((worldPosition[1] - slotWorldPosition[1]) / viewport.worldHeight) * 100;

  return {
    position: {
      x: slot.theatrePosition[0] + offsetX,
      y: slot.theatrePosition[1] + offsetY,
      z: worldPosition[2],
    },
    scale: slotWorldScale > 0
      ? (worldScale / slotWorldScale) * backgroundGridFullScale[viewport.breakpoint]
      : backgroundGridFullScale[viewport.breakpoint],
  };
}

export function getCrewneckGridFollowWeight(
  backgroundState: SceneObjectState,
  settings: CrewneckGridSettings,
  viewport: ViewportInfo,
) {
  if (!backgroundState.visible) return 0;

  const fullScale = usesBackgroundGridLayout(backgroundState, viewport)
    ? backgroundGridFullScale[viewport.breakpoint]
    : backgroundResponsiveFullScale;
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
