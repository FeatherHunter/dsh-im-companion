/** 目录选择原语（新增共享原语，各 feature 复用）：原生系统对话框优先，否则 host 桥目录浏览。
 * 与 components/workspace-picker 同源语义，落共享层供 feature 经契约使用（feature 禁直引 A1 私有）。
 * 内置浏览全用 af-* 主题类（title/sub/dirbar/list/diritem/foot）：裸 h3/div/button 会吃到宿主样式
 * （紫标题/原生按钮），在设置页里即截图中的混乱卡片。卡片加宽 + 遮罩置顶（见 theme 附则）。 */
import { h } from '../dom'
import { icon } from '../icons'
import { makeButton } from './button'
import { showModal, type ModalHandle } from './modal'
import type { RpcCall } from '../data/fleet-api'
import { HOST_CHANNEL } from '../data/meta'

export interface DirPickerHandle {
  promise: Promise<string | null>
  el: HTMLElement
}

const isAbs = (p: string): boolean => !!p && (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p))

/** 原生选择器归一：按优先级从候选服务取首个可用的 pickDirectory（官方直连/get 透传同口径，this 绑定保留）。 */
export function nativePicker(...svcs: unknown[]): (() => Promise<unknown>) | undefined {
  for (const svc of svcs) {
    try {
      const pick = (svc as { pickDirectory?: unknown } | null)?.pickDirectory
      if (typeof pick === 'function') {
        const bound = (pick as () => Promise<unknown>).bind(svc)
        return () => Promise.resolve().then(() => bound())
      }
    } catch { /* 该候选不可用，看下一个 */ }
  }
  return undefined
}

export function openDirPicker(
  rpc: RpcCall | null, initial = '', native?: () => Promise<unknown>,
): DirPickerHandle {
  let resolveFn: (v: string | null) => void = () => undefined
  const promise = new Promise<string | null>((resolve) => {
    resolveFn = resolve
  })
  if (native) {
    const placeholder = h('div', null, '正在打开系统目录选择器…')
    void (async () => {
      try {
        const raw = await native()
        resolveFn(raw === null ? null : normalizePick(raw))
      } catch (e) {
        /* 取消类抛错（宿主取消即抛）：静默收场。真故障才回退内置，保证点击永远有可见反应。 */
        const msg = String((e as Error)?.message ?? e)
        if (/cancel|dismiss|abort|close/i.test(msg)) {
          resolveFn(null)
          return
        }
        try { console.warn('[dsh-im-companion] native picker failed, falling back:', e) } catch { /* ignore */ }
        if (!rpc) {
          resolveFn(null)
          return
        }
        openHostBrowser()
      }
    })()
    return { promise, el: placeholder }
  }
  if (!rpc) {
    resolveFn(null)
    return { promise, el: h('div') }
  }
  const hostModal = openHostBrowser()
  return { promise, el: hostModal.el }

  function openHostBrowser(): { el: HTMLElement } {
  const state = { path: '' }
  /* 列表弹性高度：卡片定高后由它吸收内容多少，弹窗不再上下抖动 */
  const list = h('div', { className: 'af-list', style: { flex: '1 1 auto', minHeight: '0', overflow: 'auto' } })
  const bar = h('div', { className: 'af-dirbar' }, h('span', null, '…'))
  /* 直达行：家目录子树之外的任意文件夹靠粘贴绝对路径进入（复用 af-compose 输入行样式，不新增类） */
  const goInput = h('input', {
    type: 'text', placeholder: '粘贴绝对路径直达，如 D:\\agents\\xiaosun', 'aria-label': '粘贴绝对路径直达',
    onKeyDown: (ev: Event) => { if ((ev as KeyboardEvent).key === 'Enter') void jump() },
  })
  const goBtn = makeButton({ label: '前往', title: '跳到输入的绝对路径', onClick: () => void jump() })
  const goRow = h('div', { className: 'af-compose', style: { margin: '8px 0 0' } }, goInput, goBtn)
  /* 盘符/根快捷入口：fs.roots 取不到则整行隐藏，不影响浏览 */
  const chips = h('div', { style: { display: 'none', gap: '6px', flexWrap: 'wrap', margin: '8px 0 0' } })
  /* 按钮只 resolve 不关窗 = 点取消没反应（选择亦然）：统一经 done 先关窗再回值 */
  let modal: ModalHandle;
  const done = (v: string | null): void => {
    try { modal?.close() } catch { /* 关闭失败忽略 */ }
    resolveFn(v)
  }
  const choose = makeButton({ kind: 'primary', label: '选择此目录', disabled: true, onClick: () => done(state.path) })
  const cancel = makeButton({ kind: 'ghost', label: '取消', onClick: () => done(null) })
  modal = showModal([
    h('h3', { className: 'af-modal-title' }, '选择目录'),
    h('div', { className: 'af-modal-sub' }, '为该 Agent 选一个文件夹'),
    bar, goRow, chips, list,
    h('div', { className: 'af-modal-foot', style: { flex: 'none' } }, cancel, choose),
  ], { onClose: () => resolveFn(null) })
  try {
    /* 宽卡（长 Windows 路径不挤压）+ 置顶于 c1a 抽屉遮罩（1250 > 1200）；极简 DOM 环境缺 classList 则跳过 */
    modal.el.classList.add('af-modal--wide')
    modal.el.parentElement?.classList.add('af-overlay--top')
    /* 固定弹窗几何：卡片定高纵向排布，矮屏 overlay 滚动兜底（overlay 已 overflow:auto） */
    modal.el.style.height = 'min(560px, calc(100vh - 96px))'
    modal.el.style.minHeight = '280px'
    modal.el.style.display = 'flex'
    modal.el.style.flexDirection = 'column'
    modal.el.style.overflow = 'hidden'
  } catch {
    /* 保持默认尺寸层叠 */
  }
  /** 直达：绝对路径直跳（非法输入就地提示，不抛不关窗）。 */
  async function jump(): Promise<void> {
    const target = goInput.value.trim()
    if (!isAbs(target)) {
      list.replaceChildren(h('div', { className: 'af-error' }, '请输入绝对路径（Windows 如 D:\\agents\\x，macOS/Linux 如 /home/x）'))
      return
    }
    await navigate(target)
  }
  async function navigate(path: string): Promise<void> {
    state.path = path
    choose.disabled = !path
    bar.replaceChildren(h('span', null, '…'))
    list.replaceChildren(h('div', { className: 'af-loading-row' }, h('span', { className: 'af-spin' }), '正在读取目录…'))
    try {
      const raw = await rpc!(HOST_CHANNEL, 'fs.list', { path }, AbortSignal.timeout(5000))
      const res = raw as { ok: boolean; value?: { path: string; parent: string | null; entries: { name: string; path: string }[] }; error?: { message?: string } }
      if (!res.ok || !res.value) throw new Error(res.error?.message ?? '目录读取失败')
      state.path = res.value.path
      choose.disabled = !state.path
      /* 直达框不跟随回填：它是 transient 命令，当前路径由路径条展示；回填会覆盖用户正在输入的半截路径 */
      const curPath = res.value.path
      const curParent = res.value.parent
      bar.replaceChildren()
      if (curParent) {
        bar.appendChild(h('button', {
          className: 'af-btn ghost sm', type: 'button',
          style: { padding: '0 6px', flex: 'none' }, title: curParent,
          onClick: () => void navigate(curParent),
        }, '…上级'))
      }
      bar.appendChild(h('span', { title: curPath, style: { wordBreak: 'break-all' } }, curPath))
      const rows = res.value.entries.map((e) => {
        const row = h('div', {
          className: 'af-diritem', role: 'button', tabIndex: 0, title: e.path,
          onClick: () => void navigate(e.path),
          onKeyDown: (ev: Event) => {
            const k = (ev as KeyboardEvent).key
            if (k === 'Enter' || k === ' ') { ev.preventDefault(); void navigate(e.path) }
          },
        }, icon('folder', 16), h('span', null, e.name))
        return row
      })
      if (!rows.length) list.replaceChildren(h('div', { className: 'af-loading-row' }, '（此目录下没有子文件夹）'))
      else list.replaceChildren(...rows)
    } catch (e) {
      list.replaceChildren(h('div', { className: 'af-error' }, '读取失败：' + String((e as Error)?.message ?? e)))
    }
  }
  /* 盘符入口与初始定位互不等待，任一失败不影响另一路 */
  void (async () => {
    try {
      const rootRaw = await rpc!(HOST_CHANNEL, 'fs.roots', {}, AbortSignal.timeout(5000))
      const rootRes = rootRaw as { ok: boolean; value?: { roots?: unknown } }
      const roots = rootRes.ok && rootRes.value && Array.isArray(rootRes.value.roots)
        ? (rootRes.value.roots as unknown[]).filter((x): x is string => typeof x === 'string' && !!x).slice(0, 26)
        : []
      if (!roots.length) return
      chips.replaceChildren(...roots.map((rt) => h('button', {
        className: 'af-btn ghost sm', type: 'button', title: rt,
        onClick: () => void navigate(rt),
      }, rt)))
      chips.style.display = 'flex'
    } catch {
      /* 取不到盘符即无快捷入口，不影响浏览 */
    }
  })()
  void (async () => {
    if (isAbs(initial)) {
      await navigate(initial)
      return
    }
    try {
      const rootRaw = await rpc!(HOST_CHANNEL, 'fs.defaultRoot', {}, AbortSignal.timeout(5000))
      const rootRes = rootRaw as { ok: boolean; value?: { path: string } }
      await navigate(rootRes.ok && rootRes.value ? rootRes.value.path : '')
    } catch {
      await navigate('')
    }
  })()
    return modal
  }

  function normalizePick(raw: unknown): string | null {
    if (typeof raw === 'string') {
      const s = raw.trim()
      return s ? s : null
    }
    if (raw && typeof raw === 'object') {
      const rec = raw as Record<string, unknown>
      for (const k of ['path', 'value', 'dir']) {
        if (typeof rec[k] === 'string' && (rec[k] as string).trim()) return (rec[k] as string).trim()
      }
    }
    return null
  }
}
