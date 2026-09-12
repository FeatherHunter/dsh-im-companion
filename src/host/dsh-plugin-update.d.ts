/** `dsh-plugin-update@0.1.1` 的最小类型声明（T7 #90）。
 *
 * 为什么需要：包内 `files` 只发 `dist/*.js`（真身核查事实 1），**一个 .d.ts 都没有**；
 * 本仓 `strict` 打开 `noImplicitAny` ⇒ 直接 import 会报 TS7016
 * （"Could not find a declaration file for module 'dsh-plugin-update'"）。
 * 不引 @types（不存在），也不改 tsconfig（本票文件域外），故在 `src/host/` 内自带声明——
 * tsconfig 的 `include` 已含 `src/host`，ambient 声明随之进程序。
 *
 * 只声明本仓真正用到的 5 个成员，形状逐条对齐发布产物：
 * - `createHostUpdate` `dist/host.js:212` 返回 `{ phoneNames, handlers }`（:251）；
 * - `registrySpec` `dist/reader.js:43`、`profileNameValid` `dist/reader.js:40`、`detectEnvironmentKind` `dist/host.js:32`；
 * - `__resetSharedUpdateReaderForTests` `dist/host.js:256`。
 * ⚠️ 实测坑：包根**不导出** `validVersion`（17 个导出里没有它，只从 `dist/service.js` 出），
 * 故本仓在 `update-reader.ts` 自持一份同义实现——别在这里加声明，会编译过而运行时炸。
 * 包升级时须复核本文件（与自有读取器同属「包语义被集成方依赖」的表面）。
 */
declare module 'dsh-plugin-update' {
  /** `registrySpec(spec)`：说明符是否算「版本号/范围/纯标识」的注册表安装（`dist/reader.js:43-45`）。 */
  export const registrySpec: (spec: unknown) => boolean
  /** `profileNameValid(name)`：使用范围名是否合法（`dist/reader.js:40-42`）。 */
  export const profileNameValid: (name: unknown) => boolean
  /** `detectEnvironmentKind(ctx)`：桌面宿主判 `desktop`，否则 `cli`（`dist/host.js:32-35`）。 */
  export const detectEnvironmentKind: (ctx: unknown) => string
  /** 建更新能力：`{ phoneNames, handlers }`；`handlers` 的键即三个电话名（`dist/host.js:246-251`）。 */
  export function createHostUpdate(
    deps?: { ctx?: unknown; logCtx?: unknown; desktopPnpm?: unknown; readerOverrides?: Record<string, unknown> },
    configInput?: { pluginId: string; prefix?: string; targetPackageName?: string; registryUrl?: string; homeDir?: string },
  ): {
    phoneNames: { updateStatus: string; updateCheck: string; updateInstall: string }
    handlers: Record<string, (args?: Record<string, unknown>) => Promise<unknown>>
  }
  /** 只给测试/门禁：复位包内缓存的读取器（`dist/host.js:256-260`）。 */
  export function __resetSharedUpdateReaderForTests(): void
}
