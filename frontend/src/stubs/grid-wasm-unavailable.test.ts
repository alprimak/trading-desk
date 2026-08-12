import { describe, it, expect } from 'vitest';

/**
 * Guards the one non-obvious invariant of the dev stub (issue #30).
 *
 * The stub exists so Vite's dev-mode import analysis can resolve
 * `@askturret/grid-wasm`, which is not installed. It must THROW on evaluation,
 * not merely export nothing.
 *
 * Why that matters: @askturret/grid's `loadWasmModule()` does
 *
 *     const wasm = await import('@askturret/grid-wasm');
 *     if (wasm.default && typeof wasm.default === 'function') { ...init... }
 *     wasmModule = wasm;            // <-- reached by ANY non-throwing module
 *
 * so a silently-empty stub would be assigned to `wasmModule` and make
 * `isWasmAvailable()` return true, after which the grid calls WASM functions
 * that do not exist. Throwing is what routes it to the JS fallback instead.
 */
describe('grid-wasm dev stub', () => {
  it('rejects on import so the grid falls back to its JS implementation', async () => {
    await expect(import('./grid-wasm-unavailable')).rejects.toThrow(
      /@askturret\/grid-wasm is not installed/
    );
  });
});
