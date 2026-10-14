/** 「在文件浏览器打开目录」（T12 #129，owner 第 6 条）：**客户端只说意图，配方归宿主**。
 *
 * 三系统同一份客户端代码：面板发 `config.openDir`，这里按 `process.platform` 查表调起本机文件管理器
 * （win32 explorer / darwin open / linux xdg-open）。取证：DSH 侧对插件没有一等的「打开目录」端口
 * （app.asar 全量扫 `openFolder` 零命中），生态做法（dsh-mattpocock-skills-deck 的 platform 层）
 * 同样是插件自持配方 —— 故本仓自持，且配方只有这一处。
 * 调起一律 fire-and-forget：等到 `spawn` 事件即算成功（不等它退出），失败回**错误原文**给面板灰字显示。
 * 可注入 `spawnFn`/`platform` ⇒ 验证物能在不真的开窗口的前提下断言三系统参数。 */
import { spawn as nodeSpawn } from 'node:child_process'

export interface OpenRecipe {
  exe: string
  args: (dir: string) => string[]
}

/** 平台配方表（静态查表，不拼字符串命令、不过 shell ⇒ 路径里的空格/& 都不需要引号处理）。 */
export function openRecipeFor(platform: string): OpenRecipe | null {
  if (platform === 'win32') return { exe: 'explorer.exe', args: (dir) => [dir] }
  if (platform === 'darwin') return { exe: 'open', args: (dir) => [dir] }
  if (platform === 'linux') return { exe: 'xdg-open', args: (dir) => [dir] }
  return null
}

export interface OpenResult {
  ok: boolean
  /** 实际调起的可执行文件名（失败时也回，便于日志定位）。 */
  opener: string
  /** 失败原因**原文**（成功时空串）——面板照原样灰字显示，不翻译、不吞。 */
  message: string
}

/** 够用的 spawn 形状（真实现是 node:child_process.spawn；验证物塞假件）。 */
export type SpawnLike = (exe: string, args: string[], opts: Record<string, unknown>) => {
  once?: (ev: string, cb: (arg?: unknown) => void) => unknown
  unref?: () => void
}

const SPAWN_TIMEOUT_MS = 3000

/** 打开目录（fire-and-forget）。空路径 / 不支持的平台 / 调起失败 ⇒ `{ok:false, message:原文}`。 */
export async function openDir(dir: string, opts: { platform?: string; spawnFn?: SpawnLike } = {}): Promise<OpenResult> {
  const target = String(dir ?? '').trim()
  if (!target) return { ok: false, opener: '', message: '目录为空，没有可打开的位置' }
  const platform = opts.platform ?? process.platform
  const recipe = openRecipeFor(platform)
  if (!recipe) return { ok: false, opener: '', message: '当前平台不支持打开目录：' + platform }
  const spawnFn = opts.spawnFn ?? (nodeSpawn as unknown as SpawnLike)
  return await new Promise<OpenResult>((resolve) => {
    let done = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const settle = (r: OpenResult): void => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      resolve(r)
    }
    let child: ReturnType<SpawnLike>
    try {
      child = spawnFn(recipe.exe, recipe.args(target), { detached: true, stdio: 'ignore', windowsHide: true })
    } catch (e) {
      settle({ ok: false, opener: recipe.exe, message: String((e as Error)?.message ?? e) })
      return
    }
    try {
      child.once?.('error', (e) => settle({ ok: false, opener: recipe.exe, message: String((e as Error)?.message ?? e) }))
      child.once?.('spawn', () => {
        try { child.unref?.() } catch { /* 放不掉也无妨：不是产品路径 */ }
        settle({ ok: true, opener: recipe.exe, message: '' })
      })
      /* 兜底：本机调起偶尔既不报错也不给 spawn 事件 ⇒ 超时按成功记账（不让面板卡在“正在打开”）。 */
      timer = setTimeout(() => settle({ ok: true, opener: recipe.exe, message: '' }), SPAWN_TIMEOUT_MS)
    } catch (e) {
      settle({ ok: false, opener: recipe.exe, message: String((e as Error)?.message ?? e) })
    }
  })
}
