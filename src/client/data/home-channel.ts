/** 渠道语义（#138 渠道诚实性）：**`status === 'unbound'` ⇔ 渠道无意义、不得展示。**
 *
 * 为什么不是「`botId === null` 就无效」：孤儿的 botId 同样是 null，但它的渠道是**真历史**
 * （`home-move.applyUnbind(a, orphan=true)` 故意保留 boundAt 供认领审计），照常显示「失联 飞书」才对。
 * 三分支：bound ⇒ 绑定时从机器人抄来的事实；orphan ⇒ 真实历史；unbound ⇒ 从没绑过 ⇒ 没有渠道。
 *
 * 旧版客户端在创建未绑定助理那一刻会**替用户编一个渠道**（有空闲机器人就抄第一个，没有就写死
 * `feishu`），所以磁盘上未绑定行的 channel 是猜测值。不洗文件——这里的判据本身就把它们挡在显示之外。
 *
 * 参数只取两个字段（结构类型）⇒ 不 import `Assistant`，与 `home-model` 不成环；
 * `home-model` 再把它转出去，既有调用点的 import 一行不用改。 */
export interface ChannelBearing {
  channel: string
  status: string
}

export function channelOf(a: ChannelBearing | null | undefined): string | null {
  if (!a || !a.channel) return null
  return a.status === 'unbound' ? null : a.channel
}

/** 按渠道分组的桶键：真渠道用渠道 id，未绑定归 `''`（界面上的「待接入」组）。 */
export function bucketOf(a: ChannelBearing | null | undefined): string {
  return channelOf(a) ?? ''
}
