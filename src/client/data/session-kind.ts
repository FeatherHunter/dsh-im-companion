/** 会话收尾 kind 分类（共享层 Added-only 新文件；map“T5 flags 收敛进共享层”决议）。
 * 与 truth-flags/flags.ts 同语义冻结：402 优先 > aborted > done(completed/transient) > 空 > error/其他未知。
 * V2 replay 用更细分支（error 单列），见 features/unread/replay.ts。 */
export interface KindClass {
  raw: string
  isEmpty: boolean
  is402: boolean
  isAborted: boolean
  isError: boolean
  isDoneKind: boolean
  /** 非空、非 402/aborted/error、非 done——PM 裁定（#52 未知 kind 问）：有候选兜底黄。 */
  isUnknownOther: boolean
}

function normKind(raw: unknown): string {
  try {
    return String(raw ?? '').trim().toLowerCase()
  } catch {
    return ''
  }
}

export function classifyKind(raw: unknown): KindClass {
  const kind = normKind(raw)
  const isEmpty = kind === ''
  const is402 = kind.indexOf('402') >= 0
  const isAborted = kind.indexOf('abort') >= 0
  const isError = kind.indexOf('error') >= 0
  const isDoneKind = kind === 'completed' || kind === 'transient'
  const isUnknownOther = !isEmpty && !is402 && !isAborted && !isError && !isDoneKind
  return { raw: kind, isEmpty, is402, isAborted, isError, isDoneKind, isUnknownOther }
}
