/** T11 #128 头像图片：客户端**唯一图片通道**（渲染侧读缓存 ＋ 用户动作写端口）。
 *
 * 为什么用模块级端口（而不是把 rpc 顺着 ops 对象往下传）：本仓单文件 300 行红线，`home-ops.ts`(300) /
 * `panel-body.ts`(299) / `panel.ts`(298) 都已顶格——把 setAvatarImage/clearAvatarImage 加进 FormOps，
 * 必然要在那几个文件里各开几行，且每加一个入口就再撞一次线。本模块自持 rpc 与重渲染回调，
 * `panel.ts` **一行** bind 即接通（与事件制 emitFleetView / emitAdoptView 同款思路：谁开弹层谁派事件，
 * 弹层自身不拿面板内部结构）。
 *
 * 读缓存（渲染每帧纯读内存、零 IO）：
 *   行的 `avatar` 字段是唯一真相——只有 `img:` 标记才可能有图 ⇒ 预设色/默认行**一次 RPC 都不发**；
 *   同一渲染 tick 的多个 id 合并成一条 `avatar.get`（批量）；取回的 data URL 按「id ＋ 标记」缓存，
 *   标记一变（换图／清空／回落预设色）自动失效重取；要了没拿到 ⇒ 该标记记**负缓存**并 warn 一行
 *   （文件真没了时不许每帧重试刷屏；页面刷新即自愈）。
 * 写：`uploadAvatarImage` / `clearAvatarImage` 是唯一两个写口，成功即更新缓存；**不自己 onChange**——
 *   谁调谁负责重渲染（弹层那边是 closeHomePop ＋ onDone，与既有「恢复默认名」同一套先例）。
 * 日志：走既有 hLog/aLog（home.action / assistant.action，resident ⇒ 事后看磁盘日志就能判谁传了图）。
 */
import { logLine, logOn } from '../log'
import type { RpcCall } from '../data/fleet-api'
import { aLog, bridge, hLog, msgOf } from './home-ops'

/** 图片标记前缀：与宿主 `src/host/home-avatar.ts` 的 AVATAR_PREFIX 同字面量（跨端各持一份，形状对齐）。 */
const MARK = 'img:'
type Kind = 'home' | 'assistant'

interface Hit { marker: string; url: string }

const cache = new Map<string, Hit>()
const failed = new Set<string>()
const pending = new Map<string, string>()
/** 一次性「图到了叫我」回调（弹层是常驻 portal，不随面板重渲染 ⇒ 它得自己补图）。 */
const listeners = new Map<string, Set<(url: string) => void>>()
let scheduled = false
let getRpc: (() => RpcCall) | null = null
let onChange: (() => void) | null = null

/** 面板装配时接一次（panel.ts 一行）：取 rpc 的提供函数 ＋ 「图到了就重渲染」回调。 */
export function bindAvatarTransport(port: { getRpc: () => RpcCall; onChange: () => void }): void {
  getRpc = port.getRpc
  onChange = port.onChange
}

/** 订一次该 id 的图（命中即回调、随即清掉；没图时静默作废，不留常驻订阅）。 */
export function onAvatarImage(id: string, cb: (url: string) => void): void {
  const hit = cache.get(id)
  if (hit) {
    cb(hit.url)
    return
  }
  const set = listeners.get(id) ?? new Set<(url: string) => void>()
  set.add(cb)
  listeners.set(id, set)
}

/** 行里有图吗（渲染侧与 UI 侧共用这一条判定，别各写各的正则）。 */
export function hasImage(avatar: string | null | undefined): boolean {
  return typeof avatar === 'string' && avatar.startsWith(MARK) && avatar.length > MARK.length
}

/** 渲染侧纯读：命中回 data URL，未命中回 null（并顺手排一次批量取图）。 */
export function avatarSrc(id: string, avatar: string | null | undefined): string | null {
  if (!hasImage(avatar)) return null
  const marker = String(avatar)
  const hit = cache.get(id)
  if (hit) {
    if (hit.marker === marker) return hit.url
    cache.delete(id) /* 标记变了：旧图作废（下一次 flush 重新取） */
  }
  if (failed.has(marker) || pending.has(id)) return null
  pending.set(id, marker)
  if (!scheduled) {
    scheduled = true
    /* 合并同一 tick 的多次渲染：一次面板渲染里十几个头像只发一条 RPC。 */
    setTimeout(flush, 0)
  }
  return null
}

/** 批量取图（失败/缺图都记账，绝不抛——渲染路径上抛异常会连累整块面板）。 */
function flush(): void {
  scheduled = false
  const ask = Array.from(pending.entries())
  pending.clear()
  const rpc = getRpc?.()
  if (!ask.length || !rpc) return
  const markers = new Map(ask)
  void bridge<{ images?: Record<string, string> }>(rpc, 'avatar.get', { ids: ask.map(([id]) => id) })
    .then((v) => {
      const images = v?.images ?? {}
      let touched = false
      for (const [id] of ask) {
        const marker = markers.get(id) ?? ''
        const url = images[id]
        if (typeof url === 'string' && url.startsWith('data:image/')) {
          cache.set(id, { marker, url })
          touched = true
          const set = listeners.get(id)
          if (set) {
            listeners.delete(id)
            for (const cb of set) {
              try { cb(url) } catch { /* 订阅方自己坏掉不许连累取图 */ }
            }
          }
        } else {
          /* 行里有标记但盘上没图（手删过 / 半途失败）：记负缓存，回落预设色，别每帧重试。 */
          failed.add(marker)
          logLine('warn', 'bridge.call.fail', { method: 'avatar.get', message: '头像图片读不到，回落预设色：' + id })
        }
      }
      if (touched) onChange?.()
    })
    .catch((e) => {
      for (const marker of markers.values()) failed.add(marker)
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'avatar', action: 'get', ok: false, message: msgOf(e) })
    })
}

/** 存图（用户选完文件后调）：成功即把新图写进缓存，下一次渲染立刻可见。 */
export async function uploadAvatarImage(id: string, kind: Kind, dataUrl: string): Promise<void> {
  const log = kind === 'assistant' ? aLog : hLog
  const rpc = getRpc?.()
  if (!rpc) throw new Error('头像通道未接通（面板还没装配）')
  try {
    const v = await bridge<{ avatar?: string }>(rpc, 'avatar.set', { id, dataUrl, kind })
    /* kind 只给宿主日志映射判「家还是助理」用（宿主自己会查行）；这里顺手把新图缓存好。 */
    if (typeof v?.avatar === 'string' && hasImage(v.avatar)) cache.set(id, { marker: v.avatar, url: dataUrl })
    else cache.delete(id)
    log('set-avatar-image', id, true, '')
  } catch (e) {
    log('set-avatar-image', id, false, msgOf(e))
    throw e
  }
}

/** 清图（回落预设色＋首字母）：缓存与负缓存一起清干净，让下一帧重新按新标记取。 */
export async function clearAvatarImage(id: string, kind: Kind): Promise<void> {
  const log = kind === 'assistant' ? aLog : hLog
  const rpc = getRpc?.()
  if (!rpc) throw new Error('头像通道未接通（面板还没装配）')
  try {
    await bridge(rpc, 'avatar.clear', { id, kind })
    cache.delete(id)
    failed.clear()
    log('clear-avatar-image', id, true, '')
  } catch (e) {
    log('clear-avatar-image', id, false, msgOf(e))
    throw e
  }
}
