/** 助理两栏（简介 `description` / 人物设定 `persona`）的 **单点共享定义**（T8-1 票 #169 · 规格 #168）。
 *
 * 为什么单独一份模块：这两栏的「上限多少 / 按什么单位数 / 怎么归一 / 拒绝时说什么」必须**只有一处**——
 * 宿主写账本要校验（本票）、面板表单要提示（#171）、详情页要显示（#172）、人设注入要取文（#170）。
 * 各写一份的下场是 200 与 8000 三个地方各漂一次，而错误文案里没有字段定位时用户根本不知道是哪一栏。
 *
 * 口径（规格 #168 钉死，改之前先回票面）：
 * ① 长度按 **Unicode 码点**数（`[...s].length`），不是 UTF-16 的 `.length`——一个 emoji 是一个字；
 * ② 归一＝**CRLF / 裸 CR → LF**，再 **trim**（两端空白与换行都去）。写盘、读侧访问器、将来的注入共用这一份；
 * ③ **空与缺失等价**：读侧把缺失/坏类型读成 `''`；写侧只落非空值（`stripEmptyFields` 在唯一落盘口摘掉空键）；
 * ④ 只有**写**才校验：盘上已有的超长值照原样读回、不截断（读容忍是零迁移的前提，注入层 #170 自行跳过超长行）。
 *
 * 本模块**不碰 IO、不认识行类型**（只吃 `Record<string, unknown>`），宿主与客户端都可以直接 import。
 * 客户端引用：`../assistant-fields`（tsconfig.client.json）；宿主引用：`../assistant-fields.js`（tsconfig.json）。
 * 与 `src/log-events.ts` 同一条先例：仓库根 `src/` 下的共享模块，两侧构建各自能编译。 */

/** 两栏的键名（RPC 入参/账本行/客户端补丁共用；顺序即错误报出顺序）。 */
export const ASSISTANT_FIELDS = ['description', 'persona'] as const

export type AssistantField = (typeof ASSISTANT_FIELDS)[number]

export interface AssistantFieldSpec {
  /** 界面上的中文名（错误文案与表单标签共用，别在别处再写「简介」两个字）。 */
  label: string
  /** 上限（Unicode 码点数）。 */
  max: number
}

export const ASSISTANT_FIELD_SPECS: Record<AssistantField, AssistantFieldSpec> = {
  description: { label: '简介', max: 200 },
  persona: { label: '人物设定', max: 8000 },
}

/** 只带「提供了的键」的补丁（`''` = 显式清空；键缺失 = 不动）。 */
export type AssistantFieldsValue = { description?: string; persona?: string }

/** 按 Unicode 码点数长度：增补面字符（emoji 等）算 1，`'😀'.length` 那种 2 不算。 */
export function countCodePoints(text: string): number {
  return [...text].length
}

/** 统一归一：CRLF / 裸 CR → LF，再 trim。非字符串按空处理（读容忍；写侧的类型校验在 checkFieldValue）。 */
export function normalizeFieldText(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\r\n?/g, '\n').trim() : ''
}

/** 错误文案里的字段定位：`简介（description）`——中文名给人看，键名给日志/工单定位。 */
export function fieldLocator(field: AssistantField): string {
  return ASSISTANT_FIELD_SPECS[field].label + '（' + field + '）'
}

/** 校验失败的**唯一文案构造口**（宿主 RPC 把它原样回给面板；#171/#172 提示也用它）。 */
export function fieldErrorMessage(field: AssistantField, kind: 'type' | 'too-long', actual = 0): string {
  const spec = ASSISTANT_FIELD_SPECS[field]
  return kind === 'type'
    ? fieldLocator(field) + '必须是字符串'
    : fieldLocator(field) + '最多 ' + spec.max + ' 字，当前 ' + actual + ' 字'
}

export type FieldCheck =
  /** `value === undefined`＝未提供；`''`＝显式清空；其余为归一后的值。 */
  | { ok: true; value: string | undefined }
  | { ok: false; message: string }

/** 单字段校验 + 归一。`undefined` 未提供、`null` 清空、空白串清空、非字符串或超长拒绝。 */
export function checkFieldValue(field: AssistantField, raw: unknown): FieldCheck {
  if (raw === undefined) return { ok: true, value: undefined }
  if (raw === null) return { ok: true, value: '' }
  if (typeof raw !== 'string') return { ok: false, message: fieldErrorMessage(field, 'type') }
  const value = normalizeFieldText(raw)
  const actual = countCodePoints(value)
  if (actual > ASSISTANT_FIELD_SPECS[field].max) return { ok: false, message: fieldErrorMessage(field, 'too-long', actual) }
  return { ok: true, value }
}

export type ValidateFieldsResult =
  | { ok: true; value: AssistantFieldsValue }
  | { ok: false; code: 'bad-request'; message: string }

/** 两条 RPC 与两个行写入口共用的校验：只回「入参里出现过的键」，按 `ASSISTANT_FIELDS` 顺序报第一个错。 */
export function validateAssistantFields(input: Record<string, unknown> | null | undefined): ValidateFieldsResult {
  const src = input && typeof input === 'object' ? input : {}
  const value: AssistantFieldsValue = {}
  for (const field of ASSISTANT_FIELDS) {
    if (src[field] === undefined) continue
    const r = checkFieldValue(field, src[field])
    if (!r.ok) return { ok: false, code: 'bad-request', message: r.message }
    value[field] = r.value
  }
  return { ok: true, value }
}

/** 两栏的来源形状（宿主行 / 客户端行 / RPC 载荷都满足它）：值可能是盘上的任意东西，读侧一律容忍。 */
export interface AssistantFieldSource {
  description?: unknown
  persona?: unknown
}

/** 读侧访问器（**容忍**）：缺失或坏类型 ⇒ `''`；存着的值同样归一后返回，但**不截断**（盘上超长值原样可读）。 */
export function assistantFieldText(row: AssistantFieldSource | null | undefined, field: AssistantField): string {
  const raw = row && typeof row === 'object' ? row[field] : undefined
  return normalizeFieldText(raw)
}

/** 该行是否「真的设置了」这一栏（trim 后非空）。 */
export function hasAssistantField(row: AssistantFieldSource | null | undefined, field: AssistantField): boolean {
  return assistantFieldText(row, field) !== ''
}

/** 逐字段宽容取值（**种子/迁移路径**用）：归一后非空且合法的栏才回；坏值只丢那一栏，不拖垮整行。
 *  与 `validateAssistantFields` 的分工：那是**用户写入口**（错就拒），这里是**已有数据搬运**（错就略过）。 */
export function pickAssistantFields(row: AssistantFieldSource | null | undefined): AssistantFieldsValue {
  const out: AssistantFieldsValue = {}
  for (const field of ASSISTANT_FIELDS) {
    const r = checkFieldValue(field, row ? row[field] : undefined)
    if (r.ok && r.value) out[field] = r.value
  }
  return out
}

/** 唯一落盘口的最后一道：trim 后为空的键**整键摘掉**（空串与缺失在盘上同形 ⇒ 老账本读→写不 materialize 空键）。 */
export function stripEmptyFields<T extends AssistantFieldsValue>(row: T): T {
  const out: T = { ...row }
  for (const field of ASSISTANT_FIELDS) {
    const v = out[field]
    if (typeof v !== 'string' || v.trim() === '') delete out[field]
  }
  return out
}