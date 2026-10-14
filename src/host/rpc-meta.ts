/** `meta.*` 端点块（T12 #129 从 `rpc.ts` **原样搬出**：分发主体已被 300 行红线钉死，另起一文件腾行）。
 *
 *  搬家 ≠ 改行为：入参校验、失败信封（`bad-request`）、写操作全走 `AgentMetaStore` 的既有方法，
 *  逐条与搬家前等价（端点名与主 switch 不重叠，分发器只多一行「先问它、拿不到再回落主 switch」）。
 *  与 rpc.ts 只交换**类型**（`import type`，运行期不产生环）。 */
import type { AgentMetaStore } from './meta-store.js'
import { isUpdateIntervalHours } from './meta-store.js'
import type { RpcPayload, RpcResult } from './rpc.js'

const ok = (value: unknown): RpcResult => ({ ok: true, value })
const fail = (code: string, message: string): RpcResult => ({ ok: false, error: { code, message, details: {} } })

/** 命中 `meta.*` 回该结果；不是 `meta.*` 回 `null`（交主 switch 继续）。 */
export async function handleMetaCase(endpoint: string, p: RpcPayload, store: AgentMetaStore): Promise<RpcResult | null> {
  switch (endpoint) {
    case 'meta.get':
      return ok(store.snapshot())
    case 'meta.rename': {
      const key = String(p.key ?? '')
      const name = String(p.name ?? '')
      if (!key || !name) return fail('bad-request', 'key 与 name 必填')
      await store.rename(key, name)
      return ok({})
    }
    case 'meta.avatar.set': {
      const key = String(p.key ?? '')
      const dataUrl = String(p.dataUrl ?? '')
      if (!key || !dataUrl) return fail('bad-request', 'key 与 dataUrl 必填')
      await store.setAvatar(key, dataUrl)
      return ok({})
    }
    case 'meta.avatar.clear': {
      const key = String(p.key ?? '')
      if (!key) return fail('bad-request', 'key 必填')
      await store.clearAvatar(key)
      return ok({})
    }
    case 'meta.local.add': {
      const name = String(p.name ?? '')
      if (!name) return fail('bad-request', 'name 必填')
      await store.addLocal(name)
      return ok({})
    }
    case 'meta.local.remove': {
      const name = String(p.name ?? '')
      if (!name) return fail('bad-request', 'name 必填')
      await store.removeLocal(name)
      return ok({})
    }
    case 'meta.local.rename': {
      const from = String(p.from ?? '')
      const to = String(p.to ?? '')
      if (!from || !to) return fail('bad-request', 'from/to 必填')
      await store.renameLocal(from, to)
      return ok({})
    }
    case 'meta.local.workspace': {
      const name = String(p.name ?? '')
      const workspace = String(p.workspace ?? '')
      if (!name) return fail('bad-request', 'name 必填')
      await store.setLocalWorkspace(name, workspace)
      return ok({})
    }
    case 'meta.preset.set': {
      const key = String(p.key ?? '')
      const preset = String(p.preset ?? '')
      if (!key || !preset) return fail('bad-request', 'key 与 preset 必填')
      await store.setPreset(key, preset)
      return ok({})
    }
    case 'meta.ctx.set': {
      const key = String(p.key ?? '')
      if (!key || typeof p.enabled === 'undefined' || typeof p.level === 'undefined') {
        return fail('bad-request', 'key/enabled/level 必填')
      }
      await store.setCtx(key, { enabled: p.enabled, level: p.level })
      return ok({})
    }
    case 'meta.welcomed.set': {
      const workspace = String(p.workspace ?? '')
      if (!workspace || typeof p.seen === 'undefined') {
        return fail('bad-request', 'workspace/seen 必填')
      }
      await store.setWelcomed(workspace, p.seen === true)
      return ok({})
    }
    // ── T7 #90 追加 → T5 #110 M5 起只落盘保留（调度器已删，写后不再重排定时器）。
    // **读**走既有 `meta.get` 的全量快照 `store.snapshot()`，不新增读端点。
    // 校验与 `meta.rename` 同款：非法值回既有 `fail('bad-request', …)` 信封。
    case 'meta.update.set': {
      if (typeof p.autoCheckEnabled !== 'boolean' || !isUpdateIntervalHours(p.intervalHours)) {
        return fail('bad-request', 'autoCheckEnabled 必须布尔，intervalHours ∈ {6,12,24,168}')
      }
      await store.setUpdate({ autoCheckEnabled: p.autoCheckEnabled, intervalHours: p.intervalHours })
      return ok({})
    }
    // ── #98 追加：动效开关偏好写入（**读**走既有 `meta.get` 全量快照，不新增读端点；与 #90 同款）。
    case 'meta.motion.set': {
      if (typeof p.manualReduced !== 'boolean') return fail('bad-request', 'manualReduced 必须是布尔')
      await store.setMotion({ manualReduced: p.manualReduced })
      return ok({})
    }
    default:
      return null
  }
}
