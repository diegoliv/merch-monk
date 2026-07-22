import type { Breakpoint } from "./types";

type DomBindingRoot = Document | HTMLElement;

type ResponsiveBindingOptions = {
  root: DomBindingRoot;
  valueAttribute: string;
  breakpointAttribute: string;
  value: string;
  breakpoint: Breakpoint;
  label: string;
  required?: boolean;
};

function escapeAttributeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isUsableElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function selectCandidate(root: DomBindingRoot, selector: string, label: string) {
  const matches = Array.from(root.querySelectorAll<HTMLElement>(selector));
  const usable = matches.filter(isUsableElement);

  if (usable.length > 1) {
    console.warn("[Merch Monk] Multiple visible " + label + " elements found. Using the first one.", usable);
  }

  return usable[0] ?? null;
}

export function resolveResponsiveDataElement({
  root,
  valueAttribute,
  breakpointAttribute,
  value,
  breakpoint,
  label,
  required = false,
}: ResponsiveBindingOptions) {
  const escapedValue = escapeAttributeValue(value);
  const exactSelector = "[" + valueAttribute + "=\"" + escapedValue + "\"][" + breakpointAttribute + "=\"" + breakpoint + "\"]";
  const defaultSelector = "[" + valueAttribute + "=\"" + escapedValue + "\"]:not([" + breakpointAttribute + "])";
  const exact = selectCandidate(root, exactSelector, label + " (" + breakpoint + ")");
  if (exact) return exact;

  const fallback = selectCandidate(root, defaultSelector, label + " (default)");
  if (fallback) return fallback;

  if (required) {
    console.warn(
      "[Merch Monk] No visible " + label + " found for breakpoint \"" + breakpoint +
      "\". Expected " + exactSelector + " or " + defaultSelector + ".",
    );
  }

  return null;
}
