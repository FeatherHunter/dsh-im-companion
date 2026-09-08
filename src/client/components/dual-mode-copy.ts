/** 双模式文案（T2 定稿 8 键 · 中英双语；`first-view-copy` 的 `states.*` 与 #27 三态一字不动）。
 * 术语走 CONTEXT.md：接入 / 创建 / 绑定不混用，禁用“托管”；成功只留终态一条确认。
 * 扫码页既有 6 处中文硬编码不动代码、登记债务（T2 R4），本文件只新增，不回写旧页。 */
import { firstViewLang } from './first-view-copy'

export type DualLang = 'zh' | 'en'

export function dualLang(): DualLang {
  try {
    return firstViewLang() === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

export interface DualModeCopy {
  choiceTitle: string
  choiceSub: (name: string, label: string) => string
  choiceQr: string
  choiceManual: string
  manualTitle: (label: string) => string
  manualSubmit: string
  back: string
  fail: (message: string) => string
}

const ZH: DualModeCopy = {
  choiceTitle: '选择接入方式',
  choiceSub: (n, l) => '为「' + n + '」创建' + l + '机器人，请选择方式',
  choiceQr: '扫码创建',
  choiceManual: '手动填写',
  manualTitle: (l) => '手动填写' + l + '信息',
  manualSubmit: '提交并接入',
  back: '返回选择',
  fail: (m) => '接入失败：' + m,
}

const EN: DualModeCopy = {
  choiceTitle: 'Choose a connection method',
  choiceSub: (n, l) => 'To create a ' + l + ' bot for "' + n + '", choose how to proceed',
  choiceQr: 'Create by scanning',
  choiceManual: 'Enter manually',
  manualTitle: (l) => 'Enter ' + l + ' details manually',
  manualSubmit: 'Submit and connect',
  back: 'Back to options',
  fail: (m) => 'Connection failed: ' + m,
}

export function dualModeCopy(lang?: DualLang): DualModeCopy {
  return (lang ?? dualLang()) === 'en' ? EN : ZH
}

/** 前置 checklist 提示行（4 项只做提示、零硬门；失败靠服务端公开码兜底）。 */
export function manualHint(channel: string, lang?: DualLang): string | null {
  const en = (lang ?? dualLang()) === 'en'
  if (channel === 'slack') return en
    ? 'Import the Slack app manifest first (guidance only, not blocking).'
    : '请先导入 Slack 应用 Manifest（仅提示，不拦截）。'
  if (channel === 'discord') return en
    ? 'Enable the Discord bot intent switch first (guidance only, not blocking).'
    : '请先打开 Discord 机器人 Intent 开关（仅提示，不拦截）。'
  if (channel === 'telegram') return en
    ? 'A proxy may be required for Telegram (guidance only, not blocking).'
    : 'Telegram 可能需要代理（仅提示，不拦截）。'
  if (channel === 'wecom') return en
    ? 'The WeCom Bot ID is the remote bot identity (guidance only, not blocking).'
    : '企微 Bot ID 指远端机器人身份（仅提示，不拦截）。'
  return null
}

/** 字段输入占位（含脱敏占位；FORBIDDEN 零回显不落值，只给指示）。 */
export function secretPlaceholder(maskedPreview: string | null, lang?: DualLang): string {
  const en = (lang ?? dualLang()) === 'en'
  if (!maskedPreview) return en ? 'Enter secret' : '请输入密钥'
  if (maskedPreview === 'configured') return en ? 'Configured (hidden, re-enter)' : '已配置（密文不回显，需重填）'
  return maskedPreview
}

/** 非 FORBIDDEN 失败回显：掩码 + 后 4；短密钥（<8）统一全掩码。 */
export function maskPreview(value: string): string {
  const v = String(value ?? '')
  if (v.length < 8) return '••••'
  return '•••' + v.slice(-4)
}
