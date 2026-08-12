import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// `@askturret/grid` dynamically imports the optional `@askturret/grid-wasm`
// package, which is not installed here (and is not declared as a dependency of
// the grid). Build and dev handle that missing specifier differently:
//
//   - build: `rollupOptions.external` below leaves the bare specifier in the
//     bundle. The import rejects at runtime in the browser and the grid's own
//     try/catch falls back to its JS implementation. This already works.
//   - dev:   Vite's import analysis resolves the specifier eagerly and 500s the
//     whole module before any try/catch can run, which broke `npm run dev`
//     entirely (issue #30).
//
// The dev-only alias below points the specifier at a stub that throws on
// evaluation, so dev reaches the same JS fallback path production already uses.
// It is scoped to `command === 'serve'`, leaving the production build untouched.
const gridWasmDevStub = fileURLToPath(
  new URL('./src/stubs/grid-wasm-unavailable.ts', import.meta.url)
)

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: command === 'serve' ? { '@askturret/grid-wasm': gridWasmDevStub } : {},
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      external: ['@askturret/grid-wasm'],
    },
  },
}))
