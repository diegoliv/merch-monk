const previewContainerName = "page-preview";
const previewStyleAttribute = "data-merch-monk-webflow-preview";
const previewVariableScopeSelector = ".merch-monk-page.merch-monk-previewing > *";
const webflowStylesheetPattern = /\/css\/[^/?]*\.webflow\.[^/?]*\.css(?:[?#]|$)/i;

type StylesheetReplacement = {
  original: CSSStyleSheet;
  wasDisabled: boolean;
  preview: HTMLStyleElement;
};

function isWebflowStylesheet(stylesheet: CSSStyleSheet) {
  return Boolean(stylesheet.href && webflowStylesheetPattern.test(stylesheet.href));
}

function getContainerCondition(conditionText: string) {
  const condition = conditionText
    .trim()
    .replace(/^(?:only\s+)?(?:screen|all)\s+and\s+/i, "")
    .trim();

  if (!/\(\s*(?:min-|max-)?width\s*:/i.test(condition)) return null;
  if (/^(?:not\s+|print\b)/i.test(condition)) return null;

  const features = condition.split(/\s+and\s+/i);
  const supportsContainerQueries = features.every((feature) => (
    /^\(\s*(?:min-|max-)?(?:width|height|aspect-ratio|orientation)\s*:/i.test(feature.trim())
  ));

  return supportsContainerQueries ? condition : null;
}

function serializeResponsiveCustomProperties(rule: CSSStyleRule) {
  const includesGlobalScope = rule.selectorText
    .split(",")
    .some((selector) => /^(?::root|html|body)$/i.test(selector.trim()));

  if (!includesGlobalScope) return "";

  const declarations: string[] = [];
  for (let index = 0; index < rule.style.length; index += 1) {
    const property = rule.style.item(index);
    if (!property.startsWith("--")) continue;

    const value = rule.style.getPropertyValue(property).trim();
    const priority = rule.style.getPropertyPriority(property);
    declarations.push(`${property}: ${value}${priority ? ` !${priority}` : ""};`);
  }

  if (declarations.length === 0) return "";
  return `${previewVariableScopeSelector} {\n${declarations.join("\n")}\n}`;
}

function serializeRules(rules: CSSRuleList, insideResponsiveContainer = false): string {
  return Array.from(rules, (rule) => serializeRule(rule, insideResponsiveContainer)).join("\n");
}

function serializeRule(rule: CSSRule, insideResponsiveContainer = false): string {
  if (rule.type === CSSRule.MEDIA_RULE) {
    const mediaRule = rule as CSSMediaRule;
    const containerCondition = getContainerCondition(mediaRule.conditionText);

    if (containerCondition) {
      return `@container ${previewContainerName} ${containerCondition} {\n${serializeRules(mediaRule.cssRules, true)}\n}`;
    }
  }

  const responsiveCustomProperties = insideResponsiveContainer && rule.type === CSSRule.STYLE_RULE
    ? serializeResponsiveCustomProperties(rule as CSSStyleRule)
    : "";

  const nestedRules = (rule as CSSRule & { cssRules?: CSSRuleList }).cssRules;
  if (!nestedRules || nestedRules.length === 0) {
    return [rule.cssText, responsiveCustomProperties].filter(Boolean).join("\n");
  }

  const openingBrace = rule.cssText.indexOf("{");
  if (openingBrace < 0) return rule.cssText;

  const serializedRule = `${rule.cssText.slice(0, openingBrace).trim()} {\n${serializeRules(nestedRules, insideResponsiveContainer)}\n}`;
  return [serializedRule, responsiveCustomProperties].filter(Boolean).join("\n");
}

export function replaceViewportUnits(cssText: string) {
  const containerUnit: Record<string, string> = {
    w: "cqw",
    h: "cqh",
    min: "cqmin",
    max: "cqmax",
    i: "cqi",
    b: "cqb",
  };

  const replaceableToken = /url\([^)]*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(-?(?:\d+\.?\d*|\.\d+))(?:[sld])?v(w|h|min|max|i|b)\b/gi;

  return cssText.replace(
    replaceableToken,
    (match, value: string | undefined, axis: string | undefined) => (
      value && axis ? `${value}${containerUnit[axis.toLowerCase()]}` : match
    ),
  );
}

function createPreviewStylesheet(stylesheet: CSSStyleSheet) {
  const owner = stylesheet.ownerNode;
  if (!(owner instanceof HTMLElement) || !owner.parentNode) return null;

  const preview = document.createElement("style");
  preview.setAttribute(previewStyleAttribute, "true");
  preview.media = owner instanceof HTMLLinkElement || owner instanceof HTMLStyleElement ? owner.media : "";

  const nonce = owner.getAttribute("nonce");
  if (nonce) preview.setAttribute("nonce", nonce);

  preview.textContent = replaceViewportUnits(serializeRules(stylesheet.cssRules));
  owner.parentNode.insertBefore(preview, owner.nextSibling);
  return preview;
}

export function enableWebflowBreakpointPreview() {
  const replacements: StylesheetReplacement[] = [];
  const stylesheets = Array.from(document.styleSheets).filter(isWebflowStylesheet);

  stylesheets.forEach((stylesheet) => {
    try {
      const preview = createPreviewStylesheet(stylesheet);
      if (!preview) return;

      const wasDisabled = stylesheet.disabled;
      stylesheet.disabled = true;
      replacements.push({ original: stylesheet, wasDisabled, preview });
    } catch (error) {
      console.warn("[Merch Monk] Could not adapt a Webflow stylesheet for responsive preview.", error);
    }
  });

  if (stylesheets.length === 0) {
    console.warn("[Merch Monk] No Webflow stylesheet was found for responsive preview.");
  }

  return () => {
    replacements.forEach(({ original, preview, wasDisabled }) => {
      original.disabled = wasDisabled;
      preview.remove();
    });
  };
}
