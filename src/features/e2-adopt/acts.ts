/** e2-adopt 写管道：绑定写透 + 确认弹窗 + 撤销窗（纯行为，无布局）。 */
import { h } from '../../client/dom'
import { toast } from '../../client/ui/toast'
import type { FeatureCtx } from '../protocol'
import { UNDO_WINDOW_MS, resolveDrop, shortName, undoTarget } from './model'

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

export async function setWorkspace(ctx: FeatureCtx, channel: string, botId: string, workspace: string, label: string): Promise<boolean> {
  if (!ctx.rpc) {
    toast('连接服务不可用')
    return false
  }
  try {
    await ctx.rpc('/' + channel, 'bot.workspace.set', { botId, workspace }, AbortSignal.timeout(8000))
    await ctx.refresh()
    return true
  } catch (e) {
    toast(label + '失败：' + String((e as Error)?.message ?? e))
    return false
  }
}

export function showUndo(ctx: FeatureCtx, channel: string, botId: string, from: string, text: string): void {
  dismissUndo()
  try {
    const msg = h('span', {}, text + '（5s 内可撤销）')
    const btn = h('button', {
      onClick: () => {
        dismissUndo()
        void (async () => {
          if (await setWorkspace(ctx, channel, botId, from, '撤销')) toast('已撤销，回到' + shortName(from), 'check')
        })()
      },
    }, '撤销')
    undoEl = h('div', { className: 'e2-undo', role: 'status' }, msg, btn) as HTMLElement
    document.body.appendChild(undoEl)
    undoTimer = setTimeout(() => { dismissUndo(); toast('撤销超时，绑定已生效') }, UNDO_WINDOW_MS)
  } catch { /* 提示失败不阻断已落地绑定 */ }
}

/* 自有确认框（不复用共享 showModal：其遮罩层级低于本面板，确认框会被压住。行为同源：Esc/点阴影关闭）。 */
export function askMove(ctx: FeatureCtx, channel: string, botId: string, from: string, to: string): void {
  try {
    dismissUndo()
    const box = h('div', { className: 'e2-confirmbox', role: 'dialog', 'aria-modal': 'true' }) as HTMLElement
    let closed = false
    const close = (): void => {
      if (closed) return
      closed = true
      try { box.remove() } catch { /* 忽略 */ }
      try { document.removeEventListener('keydown', onKey, true) } catch { /* 忽略 */ }
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close() }
    const go = (): void => {
      close()
      void (async () => {
        if (await setWorkspace(ctx, channel, botId, to, '换绑')) {
          const back = undoTarget(from)
          if (back) showUndo(ctx, channel, botId, back, '已换绑到' + shortName(to))
          else toast('已换绑到' + shortName(to), 'check')
        }
      })()
    }
    const btns = h('div', { className: 'e2-confirm-btns' },
      h('button', { onClick: close }, '留在这里'),
      h('button', { onClick: go }, '确认换绑'))
    box.appendChild(h('div', { className: 'e2-confirm' }, '“' + botId + '”现属' + shortName(from) + '，换绑到“' + shortName(to) + '”？', btns) as unknown as Node)
    box.addEventListener('mousedown', (e: Event) => { if (e.target === box) close() })
    document.addEventListener('keydown', onKey, true)
    document.body.appendChild(box)
  } catch { /* 弹层失败则不动（fail-closed） */ }
}

export function actDrop(ctx: FeatureCtx, bot: { botId: string; channel: string; workspace: string }, target: { kind: 'workspace'; workspace: string } | { kind: 'empty' }): void {
  const v = resolveDrop(bot, target)
  if (v.kind === 'bind') {
    void (async () => {
      if (await setWorkspace(ctx, bot.channel, bot.botId, v.to, '绑定')) {
        const back = undoTarget('')
        if (back) showUndo(ctx, bot.channel, bot.botId, back, '已绑定到' + shortName(v.to))
        else toast('已绑定到' + shortName(v.to), 'check')
      }
    })()
  } else if (v.kind === 'confirm-move') {
    askMove(ctx, bot.channel, bot.botId, v.from, v.to)
  } else if (v.kind === 'noop') {
    toast('它已经在这里了')
  } else {
    toast('空白处不可放，请拖到分组上')
  }
}
