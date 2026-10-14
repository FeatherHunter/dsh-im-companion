/** T8 #121：新建家的「新建工作区」支路——选目录 → DSH 注册工作区 → 等投影 →（调用方）落家。
 * 三步跨系统无事务（T1 §3／U9）：`workspaces.create` 幂等（已存在的目录返回 `created:false`），
 * 失败一律抛/回 null 并明文提示，绝不写半行家数据。落家仍走既有 home-ops 管道（本模块不碰家表）。 */
import { toast } from '../ui/toast'
import { ctxNativePicker, openDirPicker, type DirPickerCopy } from '../ui/dir-picker'
import type { RpcCall } from '../data/fleet-api'
import { normPath, type WorkspaceRef } from '../data/home-model'
import { logLine, logOn } from '../log'

export const NEW_HOME_DIR_COPY: DirPickerCopy = {
  title: '选择目录',
  sub: '选一个文件夹：先在 DSH 里建成工作区，再把它认成家',
}

/** 投影等待上限：unary 回声通常立刻合并，follow 增量可能晚到；超时即报错不落家（可重试）。 */
const ADOPT_TIMEOUT_MS = 8000
const POLL_MS = 120

const sleep = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms) })

/** 最近一次失败的明文原因：弹层就地显示（验收 5「弹层内明文原因」），读一次即清、下次选目录也清。 */
let dirErr = ''
export function takeDirError(): string { const m = dirErr; dirErr = ''; return m }
const fail = (msg: string): null => { toast(msg); dirErr = msg; return null }

const errText = (e: unknown): string => {
  const o = e as { code?: unknown; message?: unknown } | null
  const s = String(o?.message ?? o?.code ?? e ?? '')
  return s && s !== 'undefined' ? s : '未知错误'
}

interface ModelResult {
  ok?: boolean
  value?: { workspace?: unknown; created?: boolean }
  error?: { code?: string; message?: string }
}

interface WorkspaceService {
  list?: { create?: (input: { path: string }) => Promise<ModelResult> }
  create?: (input: { path: string }) => Promise<unknown>
}

/** ctx.get('workspaces') 惰性读法（与 panel.ts getWorkspaces 同口径；取不到即 null）。 */
function workspaceService(ctx: unknown): WorkspaceService | null {
  try {
    const get = (ctx as { get?: (n: string) => unknown } | null)?.get
    if (typeof get !== 'function') return null
    return (get('workspaces') ?? null) as WorkspaceService | null
  } catch {
    return null
  }
}

/** 已注册工作区全名单（投影读取：DSH workspace.json → 宿主注册表 → remote.workspace.follow → 客户端快照）。 */
export function readWorkspaces(ctx: unknown): WorkspaceRef[] {
  try {
    const snap = (workspaceService(ctx)?.list as { getSnapshot?: () => Record<string, unknown> } | undefined)
      ?.getSnapshot?.()
    /* 键名走字符串索引：绿框命名空间扫描把 `.item` 当旧类名残留（home-steel），别在这里踩。 */
    const rows = snap ? snap['items'] : undefined
    if (!Array.isArray(rows)) return []
    const out: WorkspaceRef[] = []
    for (const raw of rows) {
      const it = raw as { workspaceId?: unknown; path?: unknown; title?: unknown }
      const workspaceId = String(it?.workspaceId ?? '')
      const path = String(it?.path ?? '')
      if (workspaceId && path && !out.some((w) => w.workspaceId === workspaceId)) {
        out.push({ workspaceId, path, title: String(it?.title ?? '') })
      }
    }
    return out
  } catch {
    return []
  }
}

/** 选目录（原生优先；取消/失败 ⇒ null 且不弹恨话——选目录是用户的自由动作）。 */
export async function pickDirectory(ctx: unknown, rpc: RpcCall | null): Promise<string | null> {
  dirErr = ''
  try {
    const picked = await openDirPicker(rpc, '', ctxNativePicker(ctx), NEW_HOME_DIR_COPY).promise
    /* 取径结果由共享原语 dir-picker 记 `dir.pick`（成功/取消/内置浏览都在那一处）：这里再记一次＝每次点两行（真机日志实证）。 */
    return (picked ?? '').trim() || null
  } catch (e) {
    if (logOn('debug')) logLine('debug', 'ui.action', { area: 'dir', action: 'pick', ok: false, message: errText(e) })
    return null
  }
}

export interface AdoptResult {
  ref: WorkspaceRef
  created: boolean
}

/** DSH 侧收养：`workspaces.create({path})` → 等投影出现该区 → 返回 canonical 项（id/path/title）。 */
export async function adoptDirectory(
  ctx: unknown, dir: string, timeoutMs = ADOPT_TIMEOUT_MS,
): Promise<AdoptResult | null> {
  const path = (dir ?? '').trim()
  if (!path) {
    logLine('info', 'dir.adopt', { dir: '', workspaceId: '', created: false, ok: false, message: '先选一个目录' })
    return fail('先选一个目录')
  }
  const svc = workspaceService(ctx)
  const list = svc?.list
  if (!list && typeof svc?.create !== 'function') {
    logLine('info', 'dir.adopt', { dir: path, workspaceId: '', created: false, ok: false, message: 'DSH 的工作区服务不可用（workspaces 服务缺失）' })
    return fail('DSH 的工作区服务不可用（需要宿主在运行）')
  }
  const key = normPath(path)
  let created = true
  try {
    if (typeof list?.create === 'function') {
      const r = await list.create({ path })
      if (!r || r.ok !== true) {
        const why = 'DSH 建工作区失败：' + errText(r?.error)
        logLine('info', 'dir.adopt', { dir: path, workspaceId: '', created: false, ok: false, message: why })
        return fail(why)
      }
      created = r.value?.created !== false
    } else {
      await svc?.create?.({ path })
    }
  } catch (e) {
    /* WorkspaceCreateError（带 .rpcError）：不存在目录 / 无权限 / 非法 payload —— 原文照报，别吞。 */
    const rpcErr = (e as { rpcError?: { code?: string; message?: string } })?.rpcError
    const why = 'DSH 建工作区失败：' + errText(rpcErr ?? e)
    logLine('info', 'dir.adopt', { dir: path, workspaceId: '', created: false, ok: false, message: 'DSH 建工作区失败（抛出）：' + errText(rpcErr ?? e) })
    return fail(why)
  }
  const t0 = Date.now()
  for (;;) {
    const hit = readWorkspaces(ctx).find((w) => normPath(w.path) === key)
    if (hit) {
      logLine('info', 'dir.adopt', { dir: path, workspaceId: hit.workspaceId, created, ok: true, message: created ? '新建工作区并等到投影' : '复用已有工作区' })
      return { ref: hit, created }
    }
    if (Date.now() - t0 >= timeoutMs) {
      logLine('info', 'dir.adopt', { dir: path, workspaceId: '', created, ok: false, message: '等投影超时（' + timeoutMs + 'ms）：DSH 未把该目录加进工作区列表' })
      return fail('DSH 还没把工作区加进列表：稍等几秒，再点一次「创建」')
    }
    await sleep(POLL_MS)
  }
}
