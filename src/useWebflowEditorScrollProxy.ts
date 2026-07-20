import { useEffect, useRef } from "react";
import { getScrollRuntime } from "./three/scrollRuntime";

type WebflowEditorScrollProxyOptions = {
  enabled: boolean;
  pageElement?: HTMLElement | null;
  layoutKey: string;
};

const proxyGeneration = new WeakMap<HTMLElement, number>();

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPageScrollLimit(pageElement: HTMLElement) {
  return Math.max(0, pageElement.scrollHeight - pageElement.clientHeight);
}

export function useWebflowEditorScrollProxy({ enabled, pageElement, layoutKey }: WebflowEditorScrollProxyOptions) {
  const refreshRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || !pageElement || !pageElement.parentElement) {
      refreshRef.current = null;
      return;
    }
    const page = pageElement;

    const { ScrollTrigger } = getScrollRuntime();
    const generation = (proxyGeneration.get(pageElement) ?? 0) + 1;
    proxyGeneration.set(pageElement, generation);

    const previousProxyState = pageElement.getAttribute("data-merch-monk-scroll-proxy");
    const initialScrollPosition = Math.max(pageElement.scrollTop, window.scrollY);
    const spacer = document.createElement("div");
    spacer.className = "merch-monk-preview-scroll-spacer";
    spacer.setAttribute("aria-hidden", "true");
    pageElement.insertAdjacentElement("afterend", spacer);
    pageElement.setAttribute("data-merch-monk-scroll-proxy", "window");

    let disposed = false;
    let maxScroll = getPageScrollLimit(pageElement);
    let refreshFrame = 0;
    const observedChildren = new Set<Element>();

    function syncPageToWindow() {
      const nextScrollTop = clamp(window.scrollY, 0, maxScroll);
      if (Math.abs(page.scrollTop - nextScrollTop) > 0.5) {
        page.scrollTop = nextScrollTop;
      }
      ScrollTrigger.update();
    }

    function refreshProxy() {
      if (disposed) return;

      maxScroll = getPageScrollLimit(page);
      spacer.style.height = `${window.innerHeight + maxScroll}px`;

      const nextScrollTop = clamp(window.scrollY, 0, maxScroll);
      if (Math.abs(window.scrollY - nextScrollTop) > 0.5) {
        window.scrollTo(0, nextScrollTop);
      }
      page.scrollTop = nextScrollTop;
      ScrollTrigger.refresh();
      ScrollTrigger.update();
    }

    function scheduleRefresh() {
      cancelAnimationFrame(refreshFrame);
      refreshFrame = requestAnimationFrame(refreshProxy);
    }

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleRefresh);

    function observePageChildren() {
      if (!resizeObserver) return;
      Array.from(page.children).forEach((child) => {
        if (observedChildren.has(child)) return;
        observedChildren.add(child);
        resizeObserver.observe(child);
      });
    }

    const mutationObserver = typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
        observePageChildren();
        scheduleRefresh();
      });

    observePageChildren();
    resizeObserver?.observe(pageElement);
    mutationObserver?.observe(pageElement, { childList: true, subtree: true });
    window.addEventListener("scroll", syncPageToWindow, { capture: true, passive: true });
    window.addEventListener("resize", scheduleRefresh);
    window.visualViewport?.addEventListener("resize", scheduleRefresh);
    pageElement.addEventListener("load", scheduleRefresh, true);

    maxScroll = getPageScrollLimit(pageElement);
    spacer.style.height = `${window.innerHeight + maxScroll}px`;
    const startingScrollTop = clamp(initialScrollPosition, 0, maxScroll);
    pageElement.scrollTop = startingScrollTop;
    window.scrollTo(0, startingScrollTop);
    refreshRef.current = scheduleRefresh;
    scheduleRefresh();

    void document.fonts?.ready.then(() => {
      if (!disposed) scheduleRefresh();
    });

    return () => {
      disposed = true;
      const restoredScrollTop = pageElement.scrollTop;
      cancelAnimationFrame(refreshFrame);
      refreshRef.current = null;
      window.removeEventListener("scroll", syncPageToWindow, true);
      window.removeEventListener("resize", scheduleRefresh);
      window.visualViewport?.removeEventListener("resize", scheduleRefresh);
      pageElement.removeEventListener("load", scheduleRefresh, true);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      spacer.remove();

      if (previousProxyState === null) {
        pageElement.removeAttribute("data-merch-monk-scroll-proxy");
      } else {
        pageElement.setAttribute("data-merch-monk-scroll-proxy", previousProxyState);
      }

      requestAnimationFrame(() => {
        if (proxyGeneration.get(pageElement) !== generation) return;
        proxyGeneration.delete(pageElement);
        window.scrollTo(0, restoredScrollTop);
        ScrollTrigger.refresh();
        ScrollTrigger.update();
      });
    };
  }, [enabled, pageElement]);

  useEffect(() => {
    if (!enabled) return;
    refreshRef.current?.();
  }, [enabled, layoutKey]);
}
