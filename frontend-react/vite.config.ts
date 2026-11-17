/// <reference types="vitest/config" />
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * @react-pdf/* must share ONE pdfkit instance. @arcgis/core's chart export
 * (amcharts → pdfmake) pins an older pdfkit at the top of node_modules, so npm
 * nests react-pdf's pdfkit twice (under renderer and under font). In the
 * browser the font package registers the standard-font metrics into its copy,
 * the renderer creates documents with the other, and every export fails with
 * 'Standard font "Helvetica" is not registered'. This resolves every pdfkit
 * import made from inside @react-pdf as if made by the renderer; pdfmake keeps
 * its own copy. Resolved at runtime, so it survives npm layout changes.
 */
const rendererPkg = createRequire(import.meta.url).resolve('@react-pdf/renderer/package.json')
const slash = (p: string) => p.replace(/\\/g, '/')
const rendererDir = slash(dirname(rendererPkg))
function reactPdfSinglePdfkit(): Plugin {
  return {
    name: 'react-pdf-single-pdfkit',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !/[\\/]@react-pdf[\\/]/.test(importer)) return null
      if (source !== 'pdfkit' && !source.startsWith('pdfkit/')) return null
      if (slash(importer).startsWith(`${rendererDir}/`)) return null // already the renderer's own copy
      return this.resolve(source, rendererPkg, { ...options, skipSelf: true })
    },
  }
}

// https://vite.dev/config/
// Leave VITE_BASE unset so assets resolve at "/" (local and VPS).
export default defineConfig({
  plugins: [reactPdfSinglePdfkit(), react()],
  base: process.env.VITE_BASE || '/',
  optimizeDeps: {
    // The dev pre-bundler resolves dependencies on its own — apply it there too.
    rolldownOptions: { plugins: [reactPdfSinglePdfkit()] },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // PDF rendering tests lay out full multi-page documents.
    testTimeout: 60_000,
  },
})
