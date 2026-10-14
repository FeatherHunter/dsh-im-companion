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
  /* #130 构建身份：`build` = `<版本>@<产物写入时刻>`（src/build-id.ts，宿主/客户端同形）。
   * lib/ 是 gitignore 产物、版本号两次重打之间不变 ⇒ 没有它，事后只读日志答不出「这条出自哪一版」。 */
  'host.start': { level: 'info', kind: 'resident', fields: ['route', 'dshHome', 'build'] },
  'host.ready': { level: 'info', kind: 'resident', fields: ['route'] },
  /* 让位分支（路由已被别的实例注册）刻意不写日志：那个实例不许碰日志目录（单写者纪律），
   * 它只走宿主 logger；等它让位成功，日志归活跃实例所有。 */
  'host.log.init': { level: 'info', kind: 'resident', fields: ['dir', 'ok', 'reason'] },
  /* T9 #125 起两条都带 `traceId`（客户端会话链 id，随桥内层 payload 下来；无链则不加键）——
   * `host.rpc.fail` 是 resident ⇒ 调试开关关着也落盘，默认档位下「宿主行与客户端行同链」即成立。
   * 顺带补齐 `host.rpc.fail` 的历史漂移：调用点一直写 `ok` / `latencyMs`，声明里原先没有（字段白名单，
   * 运行期不裁剪、只做离线核对；它不写 `message`，可写不可缺）。 */
  'host.rpc.call': { level: 'debug', kind: 'ondemand', fields: ['method', 'ok', 'latencyMs', 'code', 'traceId'] },
  'host.rpc.fail': { level: 'error', kind: 'resident', fields: ['method', 'ok', 'latencyMs', 'code', 'message', 'traceId'] },
  'host.update.tap': { level: 'debug', kind: 'ondemand', fields: ['level', 'event', 'detail'] },
  /* T12 #129 配置迁移（homes/meta .json → .yaml，幂等）：**状态跃迁**——只在真迁移/异常时落盘，
   * `no-json`（本来就没旧文件）不留行，免得每次启动两条噪音。`message` 带 reason 与备份名。 */
  'config.migrate': { level: 'info', kind: 'resident', fields: ['dir', 'from', 'to', 'ok', 'message'] },

  /* ── 领域写操作（家的三级模型：家 → 助理 → 机器人）────────────── */
  /* 带 `traceId`（#125）：语义行由 `withRpcLog` 统一并链 id。理由见 `src/host/log.ts`——
   * 成功动作在默认档位下只有语义行落盘，链 id 只留在 rpc 明细行等于成功路径断链。 */
  'home.create': { level: 'info', kind: 'resident', fields: ['homeId', 'workspaceId', 'name', 'ok', 'message', 'traceId'] },
  'home.update': { level: 'info', kind: 'resident', fields: ['homeId', 'changed', 'ok', 'message', 'traceId'] },
  'home.seed': { level: 'info', kind: 'resident', fields: ['created', 'adopted', 'skipped', 'ok', 'message', 'traceId'] },
  'assistant.create': { level: 'info', kind: 'resident', fields: ['assistantId', 'homeId', 'botId', 'mode', 'ok', 'message', 'traceId'] },
  'assistant.bind': { level: 'info', kind: 'resident', fields: ['assistantId', 'homeId', 'botId', 'ok', 'message', 'traceId'] },
  'assistant.update': { level: 'info', kind: 'resident', fields: ['assistantId', 'changed', 'ok', 'message', 'traceId'] },
  'assistant.remove': { level: 'info', kind: 'resident', fields: ['assistantId', 'ok', 'message', 'traceId'] },
  'assistant.move': { level: 'info', kind: 'resident', fields: ['assistantId', 'fromHomeId', 'toHomeId', 'botFollowed', 'ok', 'message', 'traceId'] },
  'assistant.unbind': { level: 'info', kind: 'resident', fields: ['assistantId', 'botId', 'reason', 'ok', 'message', 'traceId'] },
  'meta.write': { level: 'debug', kind: 'ondemand', fields: ['op', 'key', 'ok', 'message', 'traceId'] },
  'fs.list': { level: 'debug', kind: 'ondemand', fields: ['dir', 'count', 'ok', 'message', 'traceId'] },

  /* ── 更新系统（四通电话）────────────────────────────────────── */
  'update.status': { level: 'debug', kind: 'ondemand', fields: ['ok', 'phase', 'traceId'] },
  'update.check': { level: 'info', kind: 'resident', fields: ['ok', 'current', 'latest', 'message', 'traceId'] },
  'update.install': { level: 'info', kind: 'resident', fields: ['ok', 'version', 'message', 'traceId'] },
  'update.changelog': { level: 'debug', kind: 'ondemand', fields: ['ok', 'version', 'traceId'] },
  /* #126 只读预检：开发态实装（Junction／越界目录）⇒ unknown-profile 是**预期**而非缺陷。
   * 每次装配至多一行；失败本身仍走 host.rpc.fail（不降级、不隐藏）。 */
  'update.precheck': { level: 'info', kind: 'resident', fields: ['mode', 'dir', 'profileDir', 'expected', 'message'] },

  /* ── 客户端装配与面板 ───────────────────────────────────────── */
  'client.start': { level: 'info', kind: 'resident', fields: ['features', 'build'] },
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
  /* T12 #129 配置入口的两条用户动作（复制路径 / 在文件浏览器打开）：**点击态**——用户做一次落一次，
   * 成功 info、失败 error（同事件两档，客户端调用点不查档位），`message` 带原文或走哪条复制路径。 */
  'config.action': { level: 'info', kind: 'resident', fields: ['action', 'dir', 'ok', 'message'] },
}

/** 交给 dsh-log 的清单本体（包侧只认 `{version,pluginId,events}`；counts 由包自算，别手填）。 */
export const LOG_EVENT_LIST: Record<string, unknown> = {
  version: 1,
  pluginId: LOG_PLUGIN_ID,
  events: LOG_EVENTS,
}
