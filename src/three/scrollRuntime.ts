import type gsap from "gsap";
import type { ScrollTrigger } from "gsap/ScrollTrigger";

type GsapRuntime = typeof gsap;
type ScrollTriggerRuntime = typeof ScrollTrigger;

declare global {
  interface Window {
    gsap?: GsapRuntime;
    ScrollTrigger?: ScrollTriggerRuntime;
  }
}

export function installScrollRuntime(gsapRuntime: GsapRuntime, scrollTriggerRuntime: ScrollTriggerRuntime) {
  gsapRuntime.registerPlugin(scrollTriggerRuntime);
  window.gsap = gsapRuntime;
  window.ScrollTrigger = scrollTriggerRuntime;
}

export function getScrollRuntime() {
  if (!window.gsap || !window.ScrollTrigger) {
    throw new Error("[Merch Monk] GSAP and ScrollTrigger must be loaded globally before the experience bundle.");
  }

  window.gsap.registerPlugin(window.ScrollTrigger);
  return { gsap: window.gsap, ScrollTrigger: window.ScrollTrigger };
}
