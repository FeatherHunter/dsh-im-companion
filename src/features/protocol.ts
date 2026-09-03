/** F0 特性协议：feature 只经 FeatureCtx 拿能力，不直连 host、面板、其他 feature。 */
import type { MetaStore } from '../client/data/meta'
import type { RpcCall } from '../client/data/fleet-api'
import type { StreamSnapshot } from '../client/data/connection-stream'

export type SlotTarget = 'settings.section' | 'workspace-rail' | 'session-header'

export interface SlotsService {
  inject(name: string, fn: () => unknown): unknown
}

export interface FeatureCtx {
  rpc: RpcCall | null
  subscribe(fn: (snap: StreamSnapshot) => void): () => void
  /** 写后立刷（F0 §4）：特性写渠道数据后触发单份轮询立即刷新并广播。 */
  refresh(): Promise<void>
  meta: MetaStore
  slots: SlotsService
  get(name: string): unknown
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
