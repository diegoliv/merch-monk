import { createContext, useContext } from "react";

export type ExperienceMode = "mock" | "webflow";

export type ExperienceRuntime = {
  mode: ExperienceMode;
  canvasElement?: HTMLElement | null;
  pageElement?: HTMLElement | null;
  previewScrollerSelector: string;
};

const defaultRuntime: ExperienceRuntime = {
  mode: "mock",
  previewScrollerSelector: ".responsive-preview-frame.is-previewing",
};

const ExperienceRuntimeContext = createContext<ExperienceRuntime>(defaultRuntime);

export const ExperienceRuntimeProvider = ExperienceRuntimeContext.Provider;

export function useExperienceRuntime() {
  return useContext(ExperienceRuntimeContext);
}

