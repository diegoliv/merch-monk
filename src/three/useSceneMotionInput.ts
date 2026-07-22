import { useEffect, useRef, type MutableRefObject } from "react";
import type { Breakpoint } from "./types";

export type SceneMotionInput = {
  active: boolean;
  clientX: number;
  clientY: number;
  orientationX: number;
  orientationY: number;
  source: "pointer" | "orientation";
};

type DeviceOrientationEventConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

type LegacyOrientationWindow = Window & {
  orientation?: number;
};

function getOrientationEventConstructor() {
  if (typeof window.DeviceOrientationEvent === "undefined") return null;
  return window.DeviceOrientationEvent as DeviceOrientationEventConstructor;
}

function getScreenOrientationAngle() {
  const screenAngle = window.screen.orientation?.angle;
  const legacyAngle = (window as LegacyOrientationWindow).orientation;
  const angle = typeof screenAngle === "number"
    ? screenAngle
    : typeof legacyAngle === "number"
      ? legacyAngle
      : 0;

  return ((angle % 360) + 360) % 360;
}

function getScreenRelativeOrientation(beta: number, gamma: number) {
  const angle = getScreenOrientationAngle();

  if (angle === 90) return { x: beta, y: -gamma };
  if (angle === 180) return { x: -gamma, y: -beta };
  if (angle === 270) return { x: -beta, y: gamma };
  return { x: gamma, y: beta };
}

function shortestAngleDelta(value: number, origin: number) {
  return ((value - origin + 540) % 360) - 180;
}

function resetInput(input: SceneMotionInput, source: SceneMotionInput["source"]) {
  input.active = false;
  input.clientX = 0;
  input.clientY = 0;
  input.orientationX = 0;
  input.orientationY = 0;
  input.source = source;
}

export function useSceneMotionInput(breakpoint: Breakpoint): {
  inputRef: MutableRefObject<SceneMotionInput>;
} {
  const inputRef = useRef<SceneMotionInput>({
    active: false,
    clientX: 0,
    clientY: 0,
    orientationX: 0,
    orientationY: 0,
    source: breakpoint === "desktop" ? "pointer" : "orientation",
  });
  const usesOrientation = breakpoint !== "desktop";

  useEffect(() => {
    const input = inputRef.current;
    resetInput(input, usesOrientation ? "orientation" : "pointer");

    if (!usesOrientation) {
      function handlePointerMove(event: PointerEvent) {
        input.clientX = event.clientX;
        input.clientY = event.clientY;
        input.active = true;
      }

      function deactivatePointer() {
        input.active = false;
      }

      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      window.addEventListener("pointerleave", deactivatePointer);
      window.addEventListener("blur", deactivatePointer);
      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerleave", deactivatePointer);
        window.removeEventListener("blur", deactivatePointer);
      };
    }

    const constructor = getOrientationEventConstructor();
    if (!constructor) return;
    const requestPermission = constructor.requestPermission?.bind(constructor);

    let neutral: { x: number; y: number } | null = null;
    let listeningForOrientation = false;
    let disposed = false;

    function calibrateOnNextReading() {
      neutral = null;
      input.active = false;
      input.orientationX = 0;
      input.orientationY = 0;
    }

    function handleOrientation(event: DeviceOrientationEvent) {
      if (event.beta === null || event.gamma === null) return;
      const orientation = getScreenRelativeOrientation(event.beta, event.gamma);

      if (!neutral) {
        neutral = orientation;
        return;
      }

      const nextX = shortestAngleDelta(orientation.x, neutral.x);
      const nextY = shortestAngleDelta(orientation.y, neutral.y);
      input.orientationX += (nextX - input.orientationX) * 0.22;
      input.orientationY += (nextY - input.orientationY) * 0.22;
      input.active = true;
    }

    function startOrientationInput() {
      if (listeningForOrientation || disposed) return;
      listeningForOrientation = true;
      window.addEventListener("deviceorientation", handleOrientation, { passive: true });
      window.addEventListener("orientationchange", calibrateOnNextReading);
      window.screen.orientation?.addEventListener("change", calibrateOnNextReading);
    }

    function stopOrientationInput() {
      if (!listeningForOrientation) return;
      listeningForOrientation = false;
      window.removeEventListener("deviceorientation", handleOrientation);
      window.removeEventListener("orientationchange", calibrateOnNextReading);
      window.screen.orientation?.removeEventListener("change", calibrateOnNextReading);
    }

    function requestOrientationOnFirstClick() {
      const permissionRequest = requestPermission?.();
      if (!permissionRequest) return;

      void permissionRequest
        .then((result) => {
          if (result === "granted") startOrientationInput();
        })
        .catch(() => {
          resetInput(input, "orientation");
        });
    }

    if (requestPermission) {
      window.addEventListener("click", requestOrientationOnFirstClick, {
        capture: true,
        once: true,
        passive: true,
      });
    } else {
      startOrientationInput();
    }

    return () => {
      disposed = true;
      window.removeEventListener("click", requestOrientationOnFirstClick, true);
      stopOrientationInput();
      resetInput(input, "orientation");
    };
  }, [usesOrientation]);

  return { inputRef };
}
