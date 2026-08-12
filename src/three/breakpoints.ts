import type { Breakpoint } from "./types";

export type BreakpointMode = "auto" | Breakpoint;

export const breakpoints = ["desktop", "tablet", "mobile"] as const satisfies readonly Breakpoint[];

export const breakpointLabels: Record<Breakpoint, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

export const breakpointPreviewSizes: Record<Breakpoint, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
};

export const breakpointPreviewRanges: Record<Breakpoint, { minWidth: number; maxWidth: number }> = {
  desktop: { minWidth: 992, maxWidth: 1600 },
  tablet: { minWidth: 768, maxWidth: 991 },
  mobile: { minWidth: 320, maxWidth: 767 },
};

export const breakpointDprRanges: Record<Breakpoint, [min: number, max: number]> = {
  desktop: [1, 1.5],
  tablet: [1, 1.25],
  mobile: [1, 2],
};

const mobileInitialDpr = 1.5;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function resolveBreakpointDprLimits(
  breakpoint: Breakpoint,
  deviceDpr = window.devicePixelRatio || 1,
) {
  const [min, configuredMax] = breakpointDprRanges[breakpoint];
  return {
    min,
    max: clamp(deviceDpr, min, configuredMax),
  };
}

export function resolveInitialBreakpointDpr(
  breakpoint: Breakpoint,
  deviceDpr = window.devicePixelRatio || 1,
) {
  const { min, max } = resolveBreakpointDprLimits(breakpoint, deviceDpr);
  return breakpoint === "mobile" ? clamp(mobileInitialDpr, min, max) : max;
}

export function getBreakpoint(width: number): Breakpoint {
  if (width < 768) return "mobile";
  if (width < 992) return "tablet";
  return "desktop";
}

export function resolveBreakpointMode(mode: BreakpointMode, viewportBreakpoint: Breakpoint): Breakpoint {
  return mode === "auto" ? viewportBreakpoint : mode;
}
