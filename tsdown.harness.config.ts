import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'

const harness = {
  entry: { 'af-harness': 'src/dev/preview-host.ts' },
  outDir: 'tools/preview',
  // ⚠️ 不要改回默认的 clean（tsdown 默认会清空 outDir）：`tools/preview/` 里同时住着手写脚本
  // `welcome-panels.ts`（且它被追踪入库），清目录会把它一并删掉，且没有任何脚本引用它、不会报错。
  // 2026-09-11 实测踩过：重打一次 harness 就静默删掉了该文件（已用 git checkout 找回）。
  clean: false,
  format: 'iife',
  platform: 'browser',
  dts: false,
  deps: { alwaysBundle: () => true },
  sourcemap: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
} satisfies UserConfig

export default [harness]