import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

const dprStep = 0.25;
const sampleWindowSize = 30;
const idleFrameGapMs = 180;
const initialWarmupMs = 1200;
const upgradeCooldownMs = 4000;
const downgradeCooldownMs = 1000;
const goodAverageFrameMs = 18.5;
const goodP90FrameMs = 20;
const slowAverageFrameMs = 21;
const slowP90FrameMs = 25;
const slowFrameMs = 22;
const slowFrameRatio = 0.2;
const stableWindowsBeforeUpgrade = 3;
const performanceDebugEnabled = new URLSearchParams(window.location.search).has("perf");

type AdaptiveDprControllerProps = {
  dpr: number;
  enabled: boolean;
  minDpr: number;
  maxDpr: number;
  onChange: (dpr: number) => void;
};

function roundDpr(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function AdaptiveDprController({ dpr, enabled, minDpr, maxDpr, onChange }: AdaptiveDprControllerProps) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const samplesRef = useRef<number[]>([]);
  const lastFrameAtRef = useRef<number | null>(null);
  const lastChangeAtRef = useRef(performance.now());
  const mountedAtRef = useRef(performance.now());
  const stableWindowsRef = useRef(0);

  useEffect(() => {
    gl.domElement.dataset.merchMonkDpr = dpr.toFixed(2);
    samplesRef.current = [];
    stableWindowsRef.current = 0;
    lastChangeAtRef.current = performance.now();
    invalidate();
  }, [dpr, gl, invalidate]);

  useEffect(() => {
    return () => {
      delete gl.domElement.dataset.merchMonkDpr;
    };
  }, [gl]);

  useFrame(() => {
    if (!enabled || document.visibilityState !== "visible" || maxDpr <= minDpr) {
      lastFrameAtRef.current = null;
      samplesRef.current = [];
      return;
    }

    const now = performance.now();
    const previousFrameAt = lastFrameAtRef.current;
    lastFrameAtRef.current = now;

    if (previousFrameAt === null || now - mountedAtRef.current < initialWarmupMs) return;

    const frameMs = now - previousFrameAt;
    if (frameMs > idleFrameGapMs) return;

    const samples = samplesRef.current;
    samples.push(frameMs);
    if (samples.length < sampleWindowSize) return;

    const averageFrameMs = samples.reduce((total, sample) => total + sample, 0) / samples.length;
    const sortedSamples = [...samples].sort((a, b) => a - b);
    const p90FrameMs = sortedSamples[Math.min(sortedSamples.length - 1, Math.floor(sortedSamples.length * 0.9))];
    const slowFrames = samples.filter((sample) => sample > slowFrameMs).length;
    const measuredSamples = samples.length;
    samplesRef.current = [];

    const isSlow =
      averageFrameMs >= slowAverageFrameMs ||
      p90FrameMs >= slowP90FrameMs ||
      slowFrames / measuredSamples >= slowFrameRatio;
    const isStable = averageFrameMs <= goodAverageFrameMs && p90FrameMs <= goodP90FrameMs;
    const elapsedSinceChange = now - lastChangeAtRef.current;

    if (isSlow && dpr > minDpr && elapsedSinceChange >= downgradeCooldownMs) {
      stableWindowsRef.current = 0;
      const nextDpr = roundDpr(clamp(dpr - dprStep, minDpr, maxDpr));
      if (performanceDebugEnabled) {
        console.info(
          `[Merch Monk DPR] ${dpr.toFixed(2)} -> ${nextDpr.toFixed(2)} (avg ${averageFrameMs.toFixed(1)}ms, p90 ${p90FrameMs.toFixed(1)}ms)`,
        );
      }
      onChange(nextDpr);
      return;
    }

    if (!isStable) {
      stableWindowsRef.current = 0;
      return;
    }

    stableWindowsRef.current += 1;
    if (
      stableWindowsRef.current >= stableWindowsBeforeUpgrade &&
      dpr < maxDpr &&
      elapsedSinceChange >= upgradeCooldownMs
    ) {
      stableWindowsRef.current = 0;
      const nextDpr = roundDpr(clamp(dpr + dprStep, minDpr, maxDpr));
      if (performanceDebugEnabled) {
        console.info(
          `[Merch Monk DPR] ${dpr.toFixed(2)} -> ${nextDpr.toFixed(2)} (avg ${averageFrameMs.toFixed(1)}ms, p90 ${p90FrameMs.toFixed(1)}ms)`,
        );
      }
      onChange(nextDpr);
    }
  }, -140);

  return null;
}
