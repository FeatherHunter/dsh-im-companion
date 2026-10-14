/** 日志事件清单（T9 #123）：宿主与客户端共用同一份。
 *
 * 规矩（写新日志前先看这里）：
 * ① 事件名是**稳定代码名**（`<区域>.<动作>`，可 grep / 计数 / 聚合），给人看的人话放 `message` 字段；
 * ② `kind:'resident'` ⇒ 调试开关关着也照样落盘（dsh-log 放行判定＝error/warn 恒放行 ∪ 常驻事件 ∪ 开关），
 *    这是「出问题时 agent 只看磁盘日志就能判定」的前提；逐请求/逐轮询的高频明细一律 `ondemand` + `debug`；
 * ③ `warn`/`error` 恒放行、用户关不掉 ⇒ **高频路径（轮询、每次渲染）只许 `debug`/`info`**，别写 warn；
 * ④ 失败事件必须带 `message`（错误原文）与定位字段（id / method / dir），否则事后判不出是谁坏在哪。
 *
 * 校验：tools/verify/log-pipeline.ts 用包的 lintEventFields 逐条核对，并扫 src 调用点防「埋了点没进清单」。
 * 调用面：宿主 `src/host/log.ts` 的 handle.log(...)；客户端 `src/client/log.ts` 的 logLine(...)。
 */
export const LOG_PLUGIN_ID = 'dsh-im-companion'

/** 单条事件声明（dsh-log 的 LogEventEntry 子集：我们只用 level/kind/fields）。 */
export interface LogEventSpec {
  level: 'error' | 'warn' | 'info' | 'debug'
  kind: 'resident' | 'ondemand' | 'selfmon'
  fields: string[]
}

/** 全部事件（一份清单，两侧共用；键＝事件名）。 */
export const LOG_EVENTS: Record<string, LogEventSpec> = {
  /* ── 宿主生命周期 ───────────────────────────────────────────── */
  'host.start': { level: 'info', kind: 'resident', fields: ['route', 'dshHome'] },
  'host.ready': { level: 'info', kind: 'resident', fields: ['route'] },
  /* 让位分支（路由已被别的实例注册）刻意不写日志：那个实例不许碰日志目录（单写者纪律），
   * 它只走宿主 logger；等它让位成功，日志归活跃实例所有。 */
  'host.log.init': { level: 'info', kind: 'resident', fields: ['dir', 'ok', 'reason'] },
  'host.rpc.call': { level: 'debug', kind: 'ondemand', fields: ['method', 'ok', 'latencyMs', 'code'] },
  'host.rpc.fail': { level: 'error', kind: 'resident', fields: ['method', 'code', 'message'] },
  'host.update.tap': { level: 'debug', kind: 'ondemand', fields: ['level', 'event', 'detail'] },

  /* ── 领域写操作（家的三级模型：家 → 助理 → 机器人）────────────── */
  'home.create': { level: 'info', kind: 'resident', fields: ['homeId', 'workspaceId', 'name', 'ok', 'message'] },
  'home.update': { level: 'info', kind: 'resident', fields: ['homeId', 'changed', 'ok', 'message'] },
  'home.seed': { level: 'info', kind: 'resident', fields: ['created', 'adopted', 'skipped', 'ok', 'message'] },
  'assistant.create': { level: 'info', kind: 'resident', fields: ['assistantId', 'homeId', 'botId', 'mode', 'ok', 'message'] },
  'assistant.bind': { level: 'info', kind: 'resident', fields: ['assistantId', 'homeId', 'botId', 'ok', 'message'] },
  'assistant.update': { level: 'info', kind: 'resident', fields: ['assistantId', 'changed', 'ok', 'message'] },
  'assistant.remove': { level: 'info', kind: 'resident', fields: ['assistantId', 'ok', 'message'] },
  'assistant.move': { level: 'info', kind: 'resident', fields: ['assistantId', 'fromHomeId', 'toHomeId', 'botFollowed', 'ok', 'message'] },
  'assistant.unbind': { level: 'info', kind: 'resident', fields: ['assistantId', 'botId', 'reason', 'ok', 'message'] },
  'meta.write': { level: 'debug', kind: 'ondemand', fields: ['op', 'key', 'ok', 'message'] },
  'fs.list': { level: 'debug', kind: 'ondemand', fields: ['dir', 'count', 'ok', 'message'] },

  /* ── 更新系统（四通电话）────────────────────────────────────── */
  'update.status': { level: 'debug', kind: 'ondemand', fields: ['ok', 'phase'] },
  'update.check': { level: 'info', kind: 'resident', fields: ['ok', 'current', 'latest', 'message'] },
  'update.install': { level: 'info', kind: 'resident', fields: ['ok', 'version', 'message'] },
  'update.changelog': { level: 'debug', kind: 'ondemand', fields: ['ok', 'version'] },
  /* #126 只读预检：开发态实装（Junction／越界目录）⇒ unknown-profile 是**预期**而非缺陷。
   * 每次装配至多一行；失败本身仍走 host.rpc.fail（不降级、不隐藏）。 */
  'update.precheck': { level: 'info', kind: 'resident', fields: ['mode', 'dir', 'profileDir', 'expected', 'message'] },

  /* ── 客户端装配与面板 ───────────────────────────────────────── */
  'client.start': { level: 'info', kind: 'resident', fields: ['features'] },
  'client.unload': { level: 'info', kind: 'resident', fields: [] },
  'client.log.init': { level: 'info', kind: 'resident', fields: ['ok', 'reason'] },
  'feature.mount.fail': { level: 'error', kind: 'resident', fields: ['feature', 'message'] },
  'panel.mount': { level: 'info', kind: 'resident', fields: ['ok'] },
  'panel.mount.fail': { level: 'error', kind: 'resident', fields: ['message'] },
  'panel.load': { level: 'info', kind: 'resident', fields: ['homes', 'assistants', 'bots', 'ok', 'latencyMs'] },
  'panel.load.fail': { level: 'error', kind: 'resident', fields: ['message'] },
  'bridge.call.fail': { level: 'warn', kind: 'resident', fields: ['method', 'message'] },
  'stream.poll': { level: 'debug', kind: 'ondemand', fields: ['ok', 'latencyMs', 'bots'] },
  'stream.fail': { level: 'warn', kind: 'resident', fields: ['message'] },

  /* ── 客户端用户动作 ─────────────────────────────────────────── */
  'dir.pick': { level: 'info', kind: 'resident', fields: ['picked', 'path', 'message'] },
  'dir.adopt': { level: 'info', kind: 'resident', fields: ['dir', 'workspaceId', 'created', 'ok', 'message'] },
  'home.action': { level: 'info', kind: 'resident', fields: ['action', 'homeId', 'ok', 'message'] },
  'assistant.action': { level: 'info', kind: 'resident', fields: ['action', 'assistantId', 'ok', 'message'] },
  'update.action': { level: 'info', kind: 'resident', fields: ['action', 'ok', 'message'] },
  'ui.action': { level: 'debug', kind: 'ondemand', fields: ['area', 'action', 'ok', 'message'] },
  'ui.render.fail': { level: 'error', kind: 'resident', fields: ['area', 'message'] },
}

/** 交给 dsh-log 的清单本体（包侧只认 `{version,pluginId,events}`；counts 由包自算，别手填）。 */
export const LOG_EVENT_LIST: Record<string, unknown> = {
  version: 1,
  pluginId: LOG_PLUGIN_ID,
  events: LOG_EVENTS,
}
