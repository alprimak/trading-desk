/**
 * Vitest/jsdom environment setup.
 *
 * jsdom does not implement `window.matchMedia`. `SignCrossingOverlay` (issue
 * #24) reads it unconditionally during render:
 *
 *     const prefersReducedMotion =
 *       window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 *
 * which is correct in a browser but throws `window.matchMedia is not a
 * function` under jsdom. Once `App.test.tsx` (issue #28) began rendering the
 * real <App /> — which mounts the overlay — every App test died on it.
 *
 * Neither PR could see this: #24 added the caller, #28 added the renderer, and
 * each was green against a master that lacked the other. It only appeared once
 * both had merged.
 *
 * Shimming the missing browser API in the test environment is the right layer
 * to fix it — the component is not wrong, jsdom is just incomplete. `matches`
 * defaults to false (motion allowed), which is the browser default and what the
 * existing overlay tests assume.
 */

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {}, // deprecated, kept for older consumers
      removeListener: () => {}, // deprecated, kept for older consumers
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
