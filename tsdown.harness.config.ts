import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'

const harness = {
  entry: { 'af-harness': 'src/dev/preview-host.ts' },
  outDir: 'tools/preview',
  format: 'iife',
  platform: 'browser',
  dts: false,
  deps: { alwaysBundle: () => true },
  sourcemap: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
} satisfies UserConfig

export default [harness]