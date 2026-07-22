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

export function getBreakpoint(width: number): Breakpoint {
  if (width < 768) return "mobile";
  if (width < 992) return "tablet";
  return "desktop";
}

export function resolveBreakpointMode(mode: BreakpointMode, viewportBreakpoint: Breakpoint): Breakpoint {
  return mode === "auto" ? viewportBreakpoint : mode;
}
