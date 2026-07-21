# Merch Monk — 3D experience for Webflow

This repository contains two independent experiences:

- **Main experience:** a persistent Three.js scene, animated on scroll and editable with Theatre.js, designed to be mounted over a page built in Webflow.
- **Studio:** a separate interface for composing scenes with objects from the GLB, editing materials, configuring the camera and shadows, and exporting PNGs.

The project uses Vite, React, TypeScript, React Three Fiber, Theatre.js, GSAP/ScrollTrigger, and Lenis. The website UI remains in Webflow; the main bundle injects only the canvas, the 3D runtime, and, when requested, the editing tools.

## Installation and commands

Requires Node.js and npm.

```bash
npm install
npm run dev
```

On Windows/PowerShell, use `npm.cmd` if the execution policy blocks the `npm.ps1` wrapper:

```powershell
npm.cmd install
npm.cmd run dev
```

| Command | Result |
| --- | --- |
| `npm run dev` | Vite server at `http://localhost:5173` |
| `npm run build` | Typecheck + local mock build in `dist/` |
| `npm run build:webflow` | Typecheck + main experience bundle in `webflow-dist/` |
| `npm run build:studio` | Typecheck + standalone Studio bundle in `studio-dist/` |
| `npm run preview` | Preview of the latest Vite build |

Local pages:

- `http://localhost:5173/`: local mock of the page and main scene.
- `http://localhost:5173/?editor=true`: mock with the Theatre.js editor open.
- `http://localhost:5173/studio.html`: standalone Studio.
- Add `?perf` to the main experience URL to print metrics to the console every 2 seconds and temporarily expose `window.__MERCH_MONK_PERF__`.

## Architecture overview

```text
src/main.tsx                 complete local mock
src/webflow.tsx              Webflow experience entrypoint
src/studio.tsx               Studio entrypoint
src/WebflowExperience.tsx    integration with the Webflow DOM
src/three/                   scene, Theatre, scroll, breakpoints, and editor
src/studio/                  Studio interface and runtime
webflow-loader/              loaders that select the local or production runtime
webflow-dist/                published artifacts for the main experience
studio-dist/                 published Studio artifacts
public/models/               source GLB used by the builds
```

The main experience keeps a single global canvas. Scrolling does not mount and unmount different scenes: it advances the Theatre sequence and interpolates the objects across the page sections.

## Main experience in Webflow

### Minimum structure

By default, the script looks for:

- `.canvas-layer_middle`: the element where React and the canvas will be mounted;
- `.page-wrapper`: the page used as a reference and as the simulated viewport in the editor.

The selectors can be changed through the loader configuration. The elements must exist when `DOMContentLoaded` fires.

### Recommended production snippet

Replace `<COMMIT_SHA>` with the full hash of the published commit and provide a public URL for the Theatre JSON. Pinning the commit prevents unexpected changes and avoids `@main` caching issues on jsDelivr.

```html
<script>
  window.MerchMonkWebflow = Object.assign(
    {},
    window.MerchMonkWebflow || {},
    {
      productionBaseUrl:
        "https://cdn.jsdelivr.net/gh/diegoliv/merch-monk@<COMMIT_SHA>/webflow-dist/",

      theatreStateUrl:
        "https://cdn.prod.website-files.com/YOUR-PUBLIC-STATE.json",

      theatreStateTimeoutMs: 6000
    }
  );
</script>

<script src="https://cdn.jsdelivr.net/gh/diegoliv/merch-monk@<COMMIT_SHA>/webflow-loader/merch-monk-loader.js"></script>
```

The loader adds the CSS and imports the bundle as a module. The GLB is resolved automatically from `webflow-dist/models/` unless `modelUrl` is provided.

### Local editing inside the Webflow page

1. Run `npm.cmd run dev`.
2. Open the Webflow page with `?editor=true` appended to the URL.
3. The loader will try to import `http://localhost:5173/src/webflow.tsx`, enable Theatre, and use the local GLB.

Example:

```text
https://merch-monk.webflow.io/?editor=true
```

`?editor=true` forces the local runtime and does not silently fall back to production if the server is unavailable. This prevents you from unknowingly editing the wrong bundle. To try the local runtime and fall back to production after a timeout, remove the query parameter and use:

```html
<script>
  window.MerchMonkWebflow = {
    preferLocal: true,
    localOrigin: "http://localhost:5173",
    localTimeoutMs: 2500
  };
</script>
```

### Preview the local Theatre state in production

The Theatre controls include **Preview in production** next to the JSON export action. It captures the current Theatre project through Theatre's export API, stores a browser-local snapshot, and opens the same Webflow URL with:

```text
?mmState=local
```

This preview uses the published production bundle, CSS, and GLB with the editor disabled. Only the Theatre state comes from the local snapshot. The configured `theatreStateUrl` is ignored for that tab.

The editor and preview tabs must use the same Webflow origin so they can share the snapshot. If the snapshot is missing, invalid, or belongs to another Theatre project, the loader stops before importing the production bundle and shows a visible error instead of silently falling back to the external or bundled state.

For diagnostics, `window.MerchMonkWebflow.runtimeSource` remains `production`, `window.MerchMonkWebflow.stateSource` is `local-preview`, and the canvas receives `data-merch-monk-state-source="local-preview"`. Remove `mmState=local` to return to the configured production state.

### `window.MerchMonkWebflow` configuration

| Field | Default | Purpose |
| --- | --- | --- |
| `canvasSelector` | `.canvas-layer_middle` | Canvas host |
| `pageSelector` | `.page-wrapper` | Page/viewport used by the editor |
| `preferLocal` | `false` | Attempts to load the local Vite runtime |
| `localOrigin` | `http://localhost:5173` | Vite origin |
| `localEntry` | `<localOrigin>/src/webflow.tsx` | Alternative local entrypoint |
| `localTimeoutMs` | `2500` | Delay before falling back to production |
| `productionBaseUrl` | jsDelivr `@main/webflow-dist/` | Base URL for production artifacts; prefer a pinned commit |
| `productionEntry` | `<base>/merch-monk-webflow.js` | Alternative ES module bundle |
| `productionCss` | `<base>/style.css` | Alternative stylesheet |
| `modelUrl` | Resolved from the runtime | Alternative GLB |
| `productColor` | `orange` | Initial `product_cup` color: `orange`, `white`, `blue`, or `black` |
| `editor` | `false` | Shows Theatre and Scene Controls in the loaded bundle |
| `theatreState` | — | Inline JSON object; takes precedence over `theatreStateUrl` |
| `theatreStateUrl` | — | Public URL for a Theatre export |
| `theatreStateTimeoutMs` | `6000` | Timeout for the external JSON |
| `stateSource` | Set by the loader | Diagnostic state source: `bundled`, `bundled-fallback`, `external`, `inline`, `local-preview`, or `local-preview-error` |
| `onReady(detail)` | — | Callback invoked when the scene is usable |
| `runtimeSource` | Set by the loader | Diagnostic value: `local-loading`, `local`, `local-error`, `local-state-error`, or `production` |

The external JSON is loaded before the production bundle is imported because the Theatre project is initialized during module import. In local mode, the loader does not fetch `theatreStateUrl`; use the bundled state or provide `theatreState` inline.

## Sections and scroll animation

Each section occupies one unit of the Theatre sequence. The runtime uses the first selector found on each row:

| Step | Data attribute | Compatible Webflow class |
| --- | --- | --- |
| Hero | `data-scene="hero"` | `.section_hero` |
| Ordering | `data-scene="ordering"` | `.section_home-ordering` |
| Options | `data-scene="options"` | `.section_home-options` |
| Momo | `data-scene="momo"` | `.section_home-momo` |
| Pricing/Confidence | `data-scene="pricing"` | `.section_home-confidence` |
| Minutes | `data-scene="minutes"` | `.section_home-weeks-minutes` |

For each section, ScrollTrigger uses `start: "top top"`, `end: "bottom top"`, and `scrub: true`. If a section does not exist, that step does not receive a trigger.

## Cup configurator controls

The runtime listens for document clicks and recognizes these attributes:

| Attribute | Value | Effect |
| --- | --- | --- |
| `data-cup-color` | A 6-digit hexadecimal color, such as `#ff4a09` | Recolors `product_cup` and applies `.is-active` to the control |
| `data-decoration-method` | `print`, `engraved`, or `digital` | Changes the artwork treatment and applies `.is-active` |
| `data-cup-logo-add` | Public image URL | Applies the artwork to the cup, adds `.is-uploaded`, and sets `data-cup-logo-state="uploaded"` |

Example:

```html
<button data-cup-color="#ff4a09" class="is-active">Orange</button>
<button data-decoration-method="digital" class="is-active">Digital</button>
<button data-cup-logo-add="https://cdn.example.com/logo.png">Add logo</button>
```

No artwork texture is loaded or applied during page load. The artwork URL must allow CORS, and it is loaded only after a `[data-cup-logo-add]` control is clicked. The hook accepts the first artwork applied during that mount; it does not open a file picker or implement removal on its own.

## Custom events and readiness state

### `merch-monk:ready`

Dispatched once Theatre is ready and the scene has produced a usable frame.

```js
window.addEventListener(
  "merch-monk:ready",
  (event) => {
    const { canvasElement, pageElement, readyAt } = event.detail;
    console.log("Merch Monk ready", { canvasElement, pageElement, readyAt });
  },
  { once: true }
);
```

The same `detail` object is passed to `window.MerchMonkWebflow.onReady`. The host also receives:

```text
class: is-ready
data-merch-monk-ready="true"
```

This makes it possible to reveal content without relying on a timeout:

```css
.canvas-layer_middle { opacity: 0; }
.canvas-layer_middle.is-ready { opacity: 1; }
```

### `merch-monk:local-error`

Dispatched when the local runtime import fails.

```js
window.addEventListener("merch-monk:local-error", (event) => {
  console.error("Local editor unavailable", event.detail.origin, event.detail.error);
});
```

### `merch-monk:local-state-error`

Dispatched when `mmState=local` cannot read or validate the saved preview snapshot. In this mode the production bundle is intentionally not imported.

```js
window.addEventListener("merch-monk:local-state-error", (event) => {
  console.error("Local state preview unavailable", event.detail.storageKey, event.detail.error);
});
```

There are no separate public events for individual frames, breakpoints, colors, or scroll steps. Those behaviors are internal to the runtime.

## Theatre.js: editing, breakpoints, and export

### Breakpoints

The active production breakpoint is resolved from the host width:

| Breakpoint | Width | Theatre sheet |
| --- | --- | --- |
| Mobile | `< 700px` | `Scroll Scene / mobile` |
| Tablet | `700–1099px` | `Scroll Scene / tablet` |
| Desktop | `>= 1100px` | `Scroll Scene` |

Desktop is the base. In the `Scene Controls` panel:

- `Copy from...` copies the object and its complete timeline from a selected source into the active breakpoint;
- `Copy to...` sends the active object and its complete timeline to one selected breakpoint or to both other breakpoints;
- each transfer reports its source and destination after the copy finishes;
- the status compares normalized values and keyframes and displays `Base`, `Matches Desktop`, `Matches Tablet`, `Matches Mobile`, or `Custom`;
- `G`, `R`, and `S` switch between translate, rotate, and scale when a text field is not focused.

If an older JSON file does not contain tablet or mobile, `prepareTheatreState()` clones the desktop sheet to fill the missing sheet. This keeps the scene working, but those breakpoints will not yet have their own direction.

### Updating only the animations

Recommended workflow, without rebuilding the app:

1. Open the page with `?editor=true` and make the adjustments.
2. In `Scene Controls > Export`, click `Export minified JSON`.
3. Rename/version the downloaded file. The default name is `merch-monk-home_state.json`.
4. Host the JSON in Webflow Assets or at another public URL with CORS.
5. Update only `theatreStateUrl` in the Embed and publish Webflow.
6. Verify desktop, tablet, and mobile in the production bundle.

The export is Theatre-compatible JSON without extra whitespace. It should contain all three sheets listed above.

### Bundled state and priority order

In production, the priority order is:

1. A valid `window.MerchMonkWebflow.theatreState`;
2. a valid JSON file loaded from `theatreStateUrl`;
3. the fallback compiled from `src/three/merch-monk-home.theatre-project-state.json`.

The loader validates `definitionVersion` and `sheetsById`, uses `cache: "no-store"`, and falls back to the bundled state if the URL fails, times out, or returns an invalid format. Files named `public/merch-monk-home_state-*.json` are versioned snapshots; the effective state is the one referenced by the Embed or, when none is provided, the compiled fallback.

To update the fallback as well, replace `src/three/merch-monk-home.theatre-project-state.json` literally and rebuild the bundles.

Editor preferences are stored in `localStorage` under `merch-monk-theatre-editor-settings`. If the editor opens with an unexpected selection, breakpoint, or slider values, remove this key and reload the page.

## Studio

Studio is an isolated bundle: it does not initialize Theatre.js, GSAP, ScrollTrigger, or Lenis. It lists top-level objects from the GLB, excluding `bg_*` roots, and allows multiple objects to remain visible while one is selected for editing.

Main features:

- translate, rotate, and scale through a gizmo and numeric fields;
- colors and texture upload/replacement per material;
- custom canvas sizes and export presets;
- front, side, back, top, and bottom camera views;
- object and ground shadows with intensity, contrast, blur, bias, color, and resolution controls;
- PNG export.

### Production embed

Use Studio on a dedicated Webflow page:

```html
<div class="merch-monk-studio"></div>

<script>
  window.MerchMonkStudio = {
    productionBaseUrl:
      "https://cdn.jsdelivr.net/gh/diegoliv/merch-monk@<COMMIT_SHA>/studio-dist/"
  };
</script>

<script src="https://cdn.jsdelivr.net/gh/diegoliv/merch-monk@<COMMIT_SHA>/webflow-loader/merch-monk-studio-loader.js"></script>
```

### `window.MerchMonkStudio` configuration

| Field | Default | Purpose |
| --- | --- | --- |
| `mountSelector` | `.merch-monk-studio` | Studio host |
| `modelUrl` | Resolved from the runtime | Alternative GLB |
| `productionBaseUrl` | jsDelivr `@main/studio-dist/` | Production base URL; prefer a pinned commit |
| `productionEntry` | `<base>/merch-monk-studio.js` | Alternative JavaScript bundle |
| `productionCss` | `<base>/studio.css` | Alternative stylesheet |
| `preferLocal` | `false` | Uses local Vite and falls back to production if the import fails |
| `localOrigin` | `http://localhost:5173` | Local origin |
| `localEntry` | `<localOrigin>/src/studio.tsx` | Alternative local entrypoint |
| `onReady(detail)` | — | Readiness callback |
| `runtimeSource` | Set by the loader | `local` or `production` |

### `merch-monk-studio:ready`

```js
window.addEventListener(
  "merch-monk-studio:ready",
  (event) => {
    const { hostElement, readyAt } = event.detail;
    console.log("Studio ready", { hostElement, readyAt });
  },
  { once: true }
);
```

The same `detail` object is passed to `window.MerchMonkStudio.onReady`. The host receives `.is-ready` and `data-merch-monk-studio-ready="true"`.

## Assets and build artifacts

- `public/models/merch_monk_website.glb` is the source model.
- `npm run build:webflow` copies the contents of `public/` to `webflow-dist/` and generates the main experience JavaScript and CSS.
- `npm run build:studio` does not copy all of `public/`; it explicitly copies only the GLB to `studio-dist/models/`.
- `webflow-loader/*.js` is not regenerated by the Vite commands. If the loader contract changes, edit and publish these files separately.
- The default crewneck, cup, and box textures are loaded from Webflow URLs defined in `GlobalSceneCanvas.tsx`.

## Publishing checklist

1. Run the affected builds:

   ```powershell
   npm.cmd run build
   npm.cmd run build:webflow
   npm.cmd run build:studio
   ```

2. Review `git status` and the diff. This checkout often contains screenshots and local QA files; stage only the paths related to the change.
3. Commit and push.
4. Replace `<COMMIT_SHA>` in the Embeds with the published hash.
5. Confirm HTTP 200 for the loader, entrypoint, CSS, chunks, GLB, and, when used, the Theatre JSON.
6. Validate the published Webflow page and wait for `merch-monk:ready` or `merch-monk-studio:ready`.

## Quick troubleshooting

| Symptom | Check |
| --- | --- |
| Nothing mounts | Confirm `canvasSelector`/`mountSelector` and look for the missing-target warning in the console |
| Local editor does not open | Confirm `npm run dev`, port 5173, and the `merch-monk:local-error` event |
| Local production preview shows an error | Return to the editor on the same Webflow origin and click **Preview in production** again |
| External state is ignored | Check the public URL, CORS, `definitionVersion`, `sheetsById`, and whether inline `theatreState` is overriding the URL |
| Tablet/mobile repeat desktop | Confirm that the JSON contains `Scroll Scene / tablet` and `Scroll Scene / mobile` |
| Scroll does not animate a step | Confirm the corresponding class or `data-scene` attribute and the section's actual height |
| A published change does not appear | Use commit-pinned URLs instead of `@main` and check every referenced chunk |
| Local behavior differs from production | Validate the `webflow-dist` bundle with the same Theatre state used in Webflow |
