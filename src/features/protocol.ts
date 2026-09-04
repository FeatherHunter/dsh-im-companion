/** F0 特性协议：feature 只经 FeatureCtx 拿能力，不直连 host、面板、其他 feature。 */
import type { MetaStore } from '../client/data/meta'
import type { RpcCall } from '../client/data/fleet-api'
import type { StreamSnapshot } from '../client/data/connection-stream'

export type SlotTarget = 'settings.section' | 'workspace-rail' | 'session-header' | 'conversation-session'

export interface SlotRegistration {
  name: string
  id: string
  order: number
  label?: () => string
  inject?: () => unknown
}

export interface SlotsService {
  inject(name: string, fn: () => unknown): unknown
  /** 按名注册槽位组件（宿主提供；老宿主缺失时特性降级隐藏）。SessionHeader 首用（#18）。 */
  register?(opts: SlotRegistration, comp: unknown): unknown
}

export interface FeatureCtx {
  rpc: RpcCall | null
  subscribe(fn: (snap: StreamSnapshot) => void): () => void
  /** 写后立刷（F0 §4）：特性写渠道数据后触发单份轮询立即刷新并广播。 */
  refresh(): Promise<void>
  meta: MetaStore
  slots: SlotsService
  get(name: string): unknown
  /** 原生目录选择（inject 声明 uiWorkspace 后由装配层注入；缺失时调用方回退内置浏览）。 */
  pickDirectory?: () => Promise<unknown>
}

export interface FeatureSlot {
  target: SlotTarget
  mount(ctx: FeatureCtx): () => void
}

export interface FeatureManifest {
  id: string
  name: string
  order: number
  slots: FeatureSlot[]
  installStyles?(): () => void
}
