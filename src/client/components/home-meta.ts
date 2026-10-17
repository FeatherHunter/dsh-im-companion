/** 元信息行原语（#139）：**分隔靠结构不靠符号**。
 *
 * 面板可见文案里一个中点都不许有（owner 2026-10-17；仓内既有同口径批注见
 * `home-row-tip.ts`「分隔靠结构不靠符号，不许拼 · 也不许紧贴成一片」）。
 * 老写法用 `·` 兼了四种关系——修饰/从属、计数＋注解、属性键值、流程步骤——
 * 同一个字形每次都得重新猜，所以退役的不是这一个符号，而是「用符号兼多义」这种做法。
 *
 * 关系 → 形式（本文件是唯一实现，各写各的必然再长出分隔符）：
 *   主/次    → 色阶（strong / weak）
 *   注解     → 括号（`note: true` 自动套）
 *   属性键值 → 前置图标节点（`icon`）或各自独立节点
 *   并列     → 间距（`.hu-meta` 的 gap）
 */
import { h } from '../dom'
import { channelLabel } from '../data/config'

export type MetaTone = 'strong' | 'weak' | 'mono' | 'accent'

export interface MetaPart {
  text: string
  tone?: MetaTone
  /** 前置图标节点（品牌 logo / 状态点 / 小图标）：键值关系靠它立语义，替代任何符号。 */
  icon?: Node | null
  /** 注解关系：自动套中文括号，一行内读完。 */
  note?: boolean
}

/** 一行元信息：节点数组 + flex gap。节点为空/空文本的项自动跳过，不留空档。 */
export function metaRow(parts: MetaPart[]): HTMLElement {
  const row = h('span', { className: 'hu-mrow' })
  for (const p of parts) {
    if (!p || !p.text) continue
    row.appendChild(h('span', { className: `hu-mi ${p.tone ?? 'weak'}${p.note ? ' note' : ''}` },
      p.icon ?? null, p.note ? `（${p.text}）` : p.text))
  }
  return row
}

/** 没有节点容器可用时的退化形式（`title` 属性、纯字符串契约）：注解仍用括号，绝不拼分隔符。 */
export function metaText(main: string, note?: string): string {
  return note ? `${main}（${note}）` : main
}

/** 助理行副标（#139）：渠道强（**未绑定＝「待接入」**，#138 渠道诚实性）＋工作区路径等宽弱化。
 *  两段靠 `.hu-mrow` 的 gap 分开，文案里零符号——故它必须走原语，不许在调用处手拼字符串。 */
export function asstSubMeta(ch: string | null | undefined, path: string): HTMLElement {
  return metaRow([
    ch ? { text: channelLabel(ch), tone: 'strong' } : { text: '待接入', tone: 'accent' },
    { text: `工作区 ${path}`, tone: 'mono' },
  ])
}
