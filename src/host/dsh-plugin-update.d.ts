/** `dsh-plugin-update@0.2.0` 的最小类型声明（T7 #90 起自带 → #99 升 0.2.0 后收缩到 2 个成员）。
 *
 * 为什么需要：包内 `files` 只发 `dist/*.js`（真身核查事实 1，0.2.0 依旧），**一个 .d.ts 都没有**；
 * 本仓 `strict` 打开 `noImplicitAny` ⇒ 直接 import 会报 TS7016
 * （"Could not find a declaration file for module 'dsh-plugin-update'"）。
 * 不引 @types（不存在），也不改 tsconfig，故在 `src/host/` 内自带声明——
 * tsconfig 的 `include` 已含 `src/host`，ambient 声明随之进程序。
 *
 * 只声明本仓真正用到的成员，形状逐条对齐发布产物 `dist/host.js`：
 * - `createHostUpdate`：`dist/host.js:241` 两参同步函数，返回 `{ phoneNames, handlers }`（:280）；
 *   `deps` 里本仓只传 `{ ctx, logCtx, readerOverrides }`（:244-248——`pluginManager`/`desktopPnpm` 由包自己从 ctx 现取）；
 * - `__resetSharedUpdateReaderForTests`：`:285` 复位包内缓存的读取器（只给测试/verify 用）。
 * ⚠️ `UPDATE_ERROR_CODES` 一类的上游词表**不要**在这里或本仓别处再抄一份：包已经把原因码归一
 * （`dist/host.js:169-188` 的 13 个 known，白名单外折叠成 `check-failed` + `errorKind: internal`），
 * 本仓只透传。包升级时须复核本文件。
 */
declare module 'dsh-plugin-update' {
  /** 建更新能力：`{ phoneNames, handlers }`；`handlers` 的键即三个电话名（`dist/host.js:275-279`）。 */
  export function createHostUpdate(
    deps?: {
      ctx?: unknown
      logCtx?: unknown
      pluginManager?: unknown
      desktopPnpm?: unknown
      readerOverrides?: Record<string, unknown>
    },
    configInput?: {
      pluginId: string
      prefix?: string
      targetPackageName?: string
      registryUrl?: string
      homeDir?: string
      checkTimeoutMs?: number
      confirmationTtlMs?: number
      installTimeoutMs?: number
      panelPollMs?: number
    },
  ): {
    phoneNames: { updateStatus: string; updateCheck: string; updateInstall: string }
    handlers: Record<string, (args?: Record<string, unknown>) => Promise<unknown>>
  }
  /** 只给测试/门禁：复位包内缓存的读取器（`dist/host.js:285-289`）。 */
  export function __resetSharedUpdateReaderForTests(): void
}
