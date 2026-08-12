/**
 * Dev-server stub for the optional `@askturret/grid-wasm` package.
 *
 * `@askturret/grid` calls `await import('@askturret/grid-wasm')` from three
 * places, each wrapped in try/catch with a JS fallback. The package is not
 * installed here and is not declared in the grid's dependencies, so:
 *
 *   - `vite build` is fine: rollupOptions.external leaves the bare specifier
 *     in the bundle, the import rejects at runtime in the browser, and the
 *     grid's catch takes the JS fallback path.
 *   - `vite dev` was NOT fine: import-analysis resolves the specifier eagerly
 *     and fails the whole module with a 500 before any try/catch can run.
 *
 * Aliasing the specifier to this module in dev makes it resolvable, and
 * throwing on evaluation reproduces exactly what production does — the dynamic
 * import rejects, the grid catches it, and the JS fallback engages.
 *
 * It MUST throw. A stub that merely exported nothing would be worse than the
 * bug: `loadWasmModule()` only guards `wasm.default` before assigning
 * `wasmModule = wasm`, so a silent stub would make `isWasmAvailable()` report
 * true and the grid would then call WASM functions that do not exist.
 *
 * Delete this (and the dev alias in vite.config.ts) if `@askturret/grid-wasm`
 * is ever added as a real dependency — see issue #30.
 */

// `export {}` marks this as a module (it has no other exports by design — see
// above; anything importable here would defeat the point).
export {};

throw new Error(
  '[dev stub] @askturret/grid-wasm is not installed; using the grid\'s JS fallback path. ' +
    'This rejection is expected and is handled by @askturret/grid (see frontend/src/stubs/grid-wasm-unavailable.ts).'
);
