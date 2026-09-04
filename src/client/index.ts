/** dsh-im-companion client 入口：注册设置面板（settings.section, order 22）。
 * 铁律：settings.section 注册组件必须返回 React 元素 —— 用 React 外壳挂载命令式 FleetPanel。 */
import * as React from 'react'
import { installStyles } from './theme'
import { FleetPanel } from './components/panel'
import { extractRpc } from './data/rpc'
import { getSharedStream, resetSharedStream } from './data/connection-stream'
import { createMetaStore, type MetaStore } from './data/meta'
import { FEATURES, type FeatureCtx, type SlotsService } from '../features'

/* 注：workspaces 经 ctx.get 惰性可选查找（无需声明）；uiWorkspace 必须声明（官方 directory-picker-native 同款），否则宿主不注入原生目录服务。 */
export const inject = ['slots', 'connection', 'uiWorkspace']

export function apply(ctx: any): void {
  const PLUGIN_ID = 'dsh-im-companion'

  const disposeStyles = installStyles()

  /* F0 特性装配：FEATURES 列表循环挂载（index 只改此列表）；单份 stream 供所有特性订阅 */
  const rpc = extractRpc(ctx)
  const stream = getSharedStream(rpc)
  let metaCache: MetaStore | null = null
  void createMetaStore(rpc).then((m) => {
    metaCache = m
  }).catch(() => {
    metaCache = null
  })
  const featureCtx: FeatureCtx = {
    rpc,
    subscribe: (fn) => stream.subscribe(fn),
    refresh: () => stream.refresh(),
    get meta() {
      if (!metaCache) throw new Error('[dsh-im-companion] meta 未就绪')
      return metaCache
    },
    slots: ctx.slots as SlotsService,
    /* 原生目录直连（与 directory-picker-native 同款写法；缺失时各调用方回退内置浏览）。 */
    ...(typeof (ctx as { uiWorkspace?: { pickDirectory?: unknown } })?.uiWorkspace?.pickDirectory === 'function'
      ? { pickDirectory: () => (ctx as { uiWorkspace: { pickDirectory: () => Promise<unknown> } }).uiWorkspace.pickDirectory() }
      : {}),
    /* 宿主服务透传（B3 取 workspaces；c1a/e2 取 uiWorkspace 时同口径）：取不到按缺失处理。 */
    get: (name: string) => {
      try {
        const get = (ctx as { get?: (n: string) => unknown } | null)?.get
        return typeof get === 'function' ? get(name) : undefined
      } catch {
        return undefined
      }
    },
  }
  const stopFeatures: (() => void)[] = []
  for (const f of FEATURES) {
    try {
      if (typeof f.installStyles === 'function') {
        const stop = f.installStyles()
        if (typeof stop === 'function') stopFeatures.push(stop)
      }
      for (const s of f.slots ?? []) stopFeatures.push(s.mount(featureCtx))
    } catch {
      /* 单个特性失败不影响其他 */
    }
  }

  const FleetSettingsTab: React.FC = () => {
    const ref = React.useRef<HTMLDivElement | null>(null)
    React.useEffect(() => {
      const mount = ref.current
      if (!mount) return
      let panel: HTMLElement | null = null
      try {
        mount.replaceChildren()
        panel = FleetPanel(ctx)
        mount.appendChild(panel)
      } catch (e) {
        console.error('[dsh-im-companion] mount error', e)
        const box = document.createElement('div')
        box.textContent = 'IM机器人辅助 加载失败：' + String((e as Error)?.message ?? e)
        box.style.cssText = 'padding:20px;color:var(--dsw-alias-state-error-primary);'
        mount.replaceChildren(box)
      }
      return () => {
        try {
          ;(panel as unknown as { __afDispose?: () => void })?.__afDispose?.()
        } catch {
          /* noop */
        }
        mount.replaceChildren()
      }
    }, [])
    return React.createElement('div', { ref, style: { background: 'transparent' } })
  }

  ctx.effect(() => () => {
    for (const stop of stopFeatures) {
      try {
        stop()
      } catch {
        /* 清理失败忽略 */
      }
    }
    try {
      stream.dispose()
    } catch {
      /* 清理失败忽略 */
    }
    try {
      resetSharedStream()
    } catch {
      /* 清理失败忽略 */
    }
    disposeStyles()
  }, 'dsh-im-companion: styles+features')
  /* B3 Header 浮层已收编为特性（src/features/b3-header，#18）：此处只保留设置面板装配。 */
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: PLUGIN_ID,
      order: 22,
      label: () => 'IM机器人辅助',
      inject: () => ({}),
    }, FleetSettingsTab),
  )
}
