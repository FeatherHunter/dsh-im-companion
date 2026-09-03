/** d1-home 写管道：动手前重查 + 换绑写透 + 确认框 + 撤销窗（纯行为，无布局）。 */
import { h } from '../../client/dom'
import { openDirPicker } from '../../client/ui/dir-picker'
import { toast } from '../../client/ui/toast'
import type { RpcCall } from '../../client/data/fleet-api'
import type { FeatureCtx } from '../protocol'
import { UNDO_WINDOW_MS, isAbsWorkspace, resolveMove, shortName, undoTarget } from './model'

let undoTimer: ReturnType<typeof setTimeout> | null = null
let undoEl: HTMLElement | null = null

export function dismissUndo(): void {
  try {
    if (undoTimer) clearTimeout(undoTimer)
    undoTimer = null
    undoEl?.remove()
    undoEl = null
  } catch { /* 忽略 */ }
}

export interface HomeBot {
  botId: string
  channel: string
  workspace: string
  stale?: boolean
}

/** 最新名单重查（防自己双窗口脏写）：刷新后按 botId 取回真值。 */
export async function freshBot(
  ctx: FeatureCtx,
  channel: string,
  botId: string,
): Promise<{ ok: true; bot: HomeBot } | { ok: false; reason: string }> {
  if (!ctx.rpc) return { ok: false, reason: '连接服务不可用，稍后再试' }
  try {
    await ctx.refresh()
  } catch { /* 刷新失败仍用手头快照继续由调用方裁决 */ }
  const snap = await readSnapshot(ctx, channel, botId)
  if (!snap) return { ok: false, reason: '名单已过期，刷新后再看' }
  if (snap.stale) return { ok: false, reason: '显示慢半拍（轮询失败），刷新后再动手' }
  return { ok: true, bot: snap }
}

type SnapReader = (bots: HomeBot[]) => HomeBot | undefined

/** 快照读取：经订阅拿一次最新（只读消费，不开第二份轮询）。 */
function readSnapshot(ctx: FeatureCtx, channel: string, botId: string): Promise<HomeBot | null> {
  return new Promise((resolve) => {
    let done = false
    const finish = (b: HomeBot | null): void => {
      if (done) return
      done = true
      resolve(b)
    }
    try {
      const off = ctx.subscribe((snap) => {
        try {
          const hit = (snap.bots as HomeBot[]).find((b) => b.channel === channel && b.botId === botId) ?? null
          finish(hit)
        } catch {
          finish(null)
        } finally {
          try { off() } catch { /* 忽略 */ }
        }
      })
    } catch {
      finish(null)
    }
    setTimeout(() => finish(null), 3000)
  })
}

export async function setWorkspace(
  ctx: FeatureCtx,
  channel: string,
  botId: string,
  workspace: string,
  label: string,
): Promise<boolean> {
  if (!ctx.rpc) {
    toast('连接服务不可用')
    return false
  }
  if (!isAbsWorkspace(workspace)) {
    toast('目标家地址非法，换家已取消（坏数据进不来）')
    return false
  }
  try {
    await (ctx.rpc as RpcCall)('/' + channel, 'bot.workspace.set', { botId, workspace }, AbortSignal.timeout(8000))
    await ctx.refresh()
    return true
  } catch (e) {
    toast(label + '失败：' + String((e as Error)?.message ?? e))
    return false
  }
}

export function showUndo(ctx: FeatureCtx, channel: string, botId: string, from: string, text: string): void {
  dismissUndo()
  const startedAt = Date.now()
  try {
    const msg = h('span', {}, text + '（5s 内可撤销）')
    const btn = h('button', {
      onClick: () => {
        if (Date.now() - startedAt >= UNDO_WINDOW_MS) {
          dismissUndo()
          toast('已落定，撤销窗口已过')
          return
        }
        dismissUndo()
        void (async () => {
          if (await setWorkspace(ctx, channel, botId, from, '撤销')) toast('已撤销，回到' + shortName(from), 'check')
        })()
      },
    }, '撤销')
    undoEl = h('div', { className: 'd1-undo', role: 'status' }, msg, btn) as HTMLElement
    document.body.appendChild(undoEl)
    undoTimer = setTimeout(() => { dismissUndo(); toast('撤销超时，换家已落定') }, UNDO_WINDOW_MS)
  } catch { /* 提示失败不阻断已落地换绑 */ }
}

/* 自有确认框（d1-* 命名空间；行为：Esc/点阴影取消，原样不动）。 */
export function askMove(ctx: FeatureCtx, channel: string, botId: string, from: string, to: string): void {
  try {
    dismissUndo()
    const box = h('div', { className: 'd1-confirmbox', role: 'dialog', 'aria-modal': 'true' }) as HTMLElement
    let closed = false
    const close = (note: string | null): void => {
      if (closed) return
      closed = true
      try { box.remove() } catch { /* 忽略 */ }
      try { document.removeEventListener('keydown', onKey, true) } catch { /* 忽略 */ }
      if (note) toast(note)
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close('已取消，原样不动') }
    const go = (): void => {
      close(null)
      void (async () => {
        const fresh = await freshBot(ctx, channel, botId)
        if (!fresh.ok) {
          toast(fresh.reason)
          return
        }
        if (fresh.bot.workspace !== from) {
          toast('它已经不在' + shortName(from) + '了，刷新后再看')
          return
        }
        if (await setWorkspace(ctx, channel, botId, to, '换家')) {
          const back = undoTarget(from)
          if (back) showUndo(ctx, channel, botId, back, '已换到' + shortName(to))
          else toast('已换到' + shortName(to), 'check')
        }
      })()
    }
    const btns = h('div', { className: 'd1-confirm-btns' },
      h('button', { onClick: () => close('已取消，原样不动') }, '取消'),
      h('button', { onClick: go }, '确认换家'))
    box.appendChild(h('div', { className: 'd1-confirm' },
      '把“' + botId + '”从' + shortName(from) + '换到' + shortName(to) + '？', btns) as unknown as Node)
    box.addEventListener('mousedown', (e: Event) => { if (e.target === box) close('已取消，原样不动') })
    document.addEventListener('keydown', onKey, true)
    document.body.appendChild(box)
  } catch { /* 弹层失败则不动（fail-closed） */ }
}

/* 选别家（评审声明：与 c1a/drawer、e2-adopt 原生优先口径同源，重复优于跨 feature 引用）。 */
export function pickHome(ctx: FeatureCtx, initial: string): Promise<string | null> {
  try {
    const svc: unknown = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined
    const pick = (svc as { pickDirectory?: unknown } | null)?.pickDirectory
    const native = typeof pick === 'function'
      ? () => Promise.resolve((pick as () => unknown)()).then((p: unknown) => (typeof p === 'string' ? p : null))
      : undefined
    return openDirPicker(ctx.rpc, initial, native).promise
  } catch {
    return Promise.resolve(null)
  }
}

/** 名册行换家入口：选家 → 判定 → 无操作提示 / 确认框（未绑定不在名册，兜底指引）。 */
export function actMove(ctx: FeatureCtx, bot: HomeBot): void {
  void (async () => {
    const to = await pickHome(ctx, bot.workspace)
    if (!to) return
    const v = resolveMove(bot, { kind: 'workspace', workspace: to })
    if (v.kind === 'noop') {
      toast('它已经在这里了')
      return
    }
    if (v.kind === 'reject-unbound') {
      toast('它还没进过家，去左栏串门领人')
      return
    }
    askMove(ctx, bot.channel, bot.botId, v.from, v.to)
  })()
}
