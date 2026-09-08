/** 双模式能力矩阵（T1 v2 单点真源 · T4 只消费不重立）。
 * 上游 pin：xmanrui/dsh-im@1c7c2d7b（2026-09-07，只读锁定；本地复核 npm 4.13.0）· T1 resolution #66。
 * 4 双支持（feishu/dingtalk/qq/wecom）· 2 仅扫码（weixin/whatsapp）· 3 仅手动（slack/telegram/discord）；
 * office（AI Office Connector）非 IM，范围外，静态 grep 须排除。
 * 跟进策略（T1）：上游升级依赖时重跑端点表 + FORBIDDEN 表 grep diff；本票只做隔离（TODO），不执行升级。 */

export const DUAL_MODE_PIN = Object.freeze({
  commit: '1c7c2d7b',
  npm: '4.13.0',
  checkedAt: '2026-09-07',
  source: '#66 T1 resolution v2',
})

export type ChannelMode = 'dual' | 'qr-only' | 'manual-only'

const QR_SET: ReadonlySet<string> = new Set([
  'feishu', 'dingtalk', 'qq', 'wecom', 'weixin', 'whatsapp',
])

const MANUAL_SET: ReadonlySet<string> = new Set([
  'feishu', 'dingtalk', 'qq', 'wecom', 'slack', 'telegram', 'discord',
])

/** 范围外：非 IM 办公连接器（矩阵静态 grep 须排除，勿入双模式）。 */
export function isOutOfScopeChannel(channel: string): boolean {
  return channel === 'office'
}

export function supportsQr(channel: string): boolean {
  return QR_SET.has(channel)
}

export function supportsManual(channel: string): boolean {
  return MANUAL_SET.has(channel)
}

/** T2 隐藏规则：不支持的不渲染；单支持跳过二选一、一步直达。 */
export function getChannelMode(channel: string): ChannelMode {
  const qr = supportsQr(channel)
  const manual = supportsManual(channel)
  if (qr && manual) return 'dual'
  if (manual) return 'manual-only'
  return 'qr-only'
}

export interface ManualFieldSpec {
  key: string
  maxLen: number
  pattern?: RegExp
  patternHint?: string
}

/** T1 参数表（trim 非空 + exactKeys，多余键即 bad-request；长度/正则是表单级精度）。 */
export const MANUAL_FIELDS: Readonly<Record<string, readonly ManualFieldSpec[]>> = Object.freeze({
  feishu: Object.freeze([
    { key: 'appId', maxLen: 256 },
    { key: 'appSecret', maxLen: 1024 },
  ]),
  dingtalk: Object.freeze([
    { key: 'clientId', maxLen: 256 },
    { key: 'clientSecret', maxLen: 1024 },
  ]),
  qq: Object.freeze([
    { key: 'appId', maxLen: 256 },
    { key: 'appSecret', maxLen: 1024 },
  ]),
  wecom: Object.freeze([
    { key: 'botId', maxLen: 512 },
    { key: 'secret', maxLen: 1024 },
  ]),
  slack: Object.freeze([
    { key: 'botToken', maxLen: 4096, pattern: /^xoxb-[A-Za-z0-9-]{16,}$/, patternHint: 'xoxb- 开头' },
    { key: 'appToken', maxLen: 4096, pattern: /^xapp-[A-Za-z0-9-]{16,}$/, patternHint: 'xapp- 开头' },
  ]),
  telegram: Object.freeze([{ key: 'token', maxLen: 4096 }]),
  discord: Object.freeze([{ key: 'token', maxLen: 4096 }]),
})

export function manualFieldsFor(channel: string): readonly ManualFieldSpec[] {
  return MANUAL_FIELDS[channel] ?? Object.freeze([])
}

/** 最高敏类（FORBIDDEN）：零回显，只留 `configured:true` 指示；其余失败才掩码后几位。 */
const FORBIDDEN_SUFFIX: ReadonlySet<string> = new Set([
  'secret', 'token',
])

export function isForbiddenKey(key: string): boolean {
  const k = key.toLowerCase()
  for (const s of FORBIDDEN_SUFFIX) if (k.endsWith(s)) return true
  return false
}

/** 全半角归一 + trim + 小写（exactKeys 判定前先归一，再判多余键）。 */
export function normalizeFieldKey(raw: string): string {
  const t = String(raw ?? '').trim().replace(/　/g, ' ')
  let half = ''
  for (const ch of t) {
    const code = ch.charCodeAt(0)
    half += code >= 0xff01 && code <= 0xff5e ? String.fromCharCode(code - 0xfee0) : ch
  }
  return half.trim().toLowerCase()
}

/** TG/DC 对称规则：trim 后 ≥20 且原长 ≤4096。 */
export function isTokenLengthOk(raw: string, maxLen = 4096): boolean {
  const s = String(raw ?? '')
  if (s.length > maxLen) return false
  return s.trim().length >= 20
}

/** 手动绑定后认领新机器人：响应直带优先，单 fresh 差集兜底，多新/空则 undefined（绝不张冠李戴）。 */
export function resolveManualBotId(value: unknown, baseline: ReadonlySet<string> | null): string | undefined {
  const v = value as {
    bots?: { botId?: string }[]; snapshot?: { bots?: { botId?: string }[] };
    botId?: unknown; bot?: { botId?: unknown };
  } | null
  const bots: string[] = []
  if (v && typeof v === 'object') {
    if (typeof v.botId === 'string' && v.botId) bots.push(v.botId)
    else if (v.bot && typeof v.bot.botId === 'string' && v.bot.botId) bots.push(v.bot.botId)
    else if (Array.isArray(v.bots)) {
      for (const b of v.bots) if (b && typeof b.botId === 'string' && b.botId) bots.push(b.botId)
    } else if (v.snapshot && Array.isArray(v.snapshot.bots)) {
      for (const b of v.snapshot.bots) if (b && typeof b.botId === 'string' && b.botId) bots.push(b.botId)
    }
  }
  if (!bots.length) return undefined
  const hinted = typeof v?.botId === 'string' && v.botId
    ? v.botId : (v?.bot && typeof v.bot.botId === 'string' && v.bot.botId ? v.bot.botId : '')
  if (hinted && bots.includes(hinted)) return hinted
  if (bots.length === 1 && !baseline) return bots[0]
  if (!baseline) return undefined
  const fresh = bots.filter((id) => !baseline.has(id))
  if (fresh.length === 1) return fresh[0]
  if (!fresh.length && bots.length === 1) return bots[0]
  return undefined
}

// TODO(静态矩阵漂移债 · T2 R2)：上游升级 @xmanrui/dsh-im 时重跑
// `bot.bind-credentials` 端点表 + FORBIDDEN 表 grep diff，刷新本文件 + DUAL_MODE_PIN。
