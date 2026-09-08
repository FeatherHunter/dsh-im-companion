/** 手动表单（T2 决议独立新模块 · T4 新建）：各渠道 `bot.bind-credentials` 凭据绑定。
 * 约束：禁走 `provision.*`（扫码链专属）；提交中禁用 + 单飞（8s 超时复用扫码侧）；
 * 失败留表单可改可重试（FORBIDDEN 零回显，其余掩码）；内存 secret 关窗/切页即清，不落盘；
 * 成功经调用方 `commit` 复用绑定落定编排（含登记竞态重试）；前置 4 项只做提示行。 */
import { h, mount } from '../dom'
import { makeButton } from '../ui/button'
import { toast as toastFn } from '../ui/toast'
import type { RpcCall } from '../data/fleet-api'
import {
  isForbiddenKey, isTokenLengthOk, manualFieldsFor, normalizeFieldKey, resolveManualBotId,
} from '../data/dual-mode-capabilities'
import { dualLang, manualHint, maskPreview, secretPlaceholder, type DualModeCopy } from './dual-mode-copy'

export interface ManualCommit {
  (botId: string): Promise<unknown>
}

export interface ManualFormOpts {
  channel: string
  label: string
  rpc: RpcCall
  toast: typeof toastFn
  copy: DualModeCopy
  baseline: ReadonlySet<string>
  commit: ManualCommit
  onCancel: () => void
  onBack?: (() => void) | null
}

export function renderManualForm(body: HTMLElement, o: ManualFormOpts): () => void {
  const lang = dualLang()
  const specs = manualFieldsFor(o.channel)
  const hint = manualHint(o.channel, lang)
  const inputs = new Map<string, HTMLInputElement>()
  let aborted = false
  let submitting = false
  let inflight: AbortController | null = null
  const secrets: Record<string, string> = {}

  const clearSecrets = (): void => {
    for (const k of Object.keys(secrets)) secrets[k] = ''
    inflight?.abort()
    inflight = null
  }

  const errEl = h('div', { className: 'dm-error', style: 'display:none' })
  const rows = specs.map((s) => {
    const input = h('input', {
      className: 'dm-input', type: s.key.toLowerCase().includes('token') || s.key.toLowerCase().endsWith('secret') ? 'password' : 'text',
      placeholder: secretPlaceholder(null, lang), autocomplete: 'off', spellcheck: 'false',
      'aria-label': s.key, dataset: { field: s.key },
    }) as HTMLInputElement
    inputs.set(s.key, input)
    const note = s.patternHint ?? ('≤' + s.maxLen)
    return h('label', { className: 'dm-field' },
      h('span', { className: 'dm-key' }, s.key),
      input,
      h('span', { className: 'dm-note' }, note),
    )
  })

  const failInline = (msg: string): void => {
    errEl.textContent = msg
    errEl.style.display = 'block'
  }
  const clearErr = (): void => {
    errEl.textContent = ''
    errEl.style.display = 'none'
  }

  const submitBtn = makeButton({ kind: 'primary', label: o.copy.manualSubmit, onClick: () => void submit() })
  const cancelBtn = makeButton({ kind: 'ghost', label: lang === 'en' ? 'Cancel' : '取消', onClick: () => { clearSecrets(); o.onCancel() } })
  const backBtn = o.onBack
    ? makeButton({ kind: 'ghost', label: o.copy.back, onClick: () => { clearSecrets(); o.onBack?.() } })
    : null

  mount(body, [
    h('div', { className: 'dm-title' }, o.copy.manualTitle(o.label)),
    hint ? h('div', { className: 'dm-hint' }, hint) : null,
    h('div', { className: 'dm-form' }, ...rows),
    errEl,
    h('div', { className: 'af-modal-foot' }, backBtn, cancelBtn, submitBtn),
  ])

  async function submit(): Promise<void> {
    if (submitting) return
    clearErr()
    /* 归一 + exactKeys + 去空非空 + 长度格式双检（T1 表决精度）。 */
    const canon = new Map<string, string>()
    const seenNorm = new Map<string, string>()
    for (const [key, input] of inputs) {
      const norm = normalizeFieldKey(key)
      if (seenNorm.has(norm)) { const m = '重复字段：' + key; failInline(m); o.toast(o.copy.fail(m)); return }
      seenNorm.set(norm, key)
      canon.set(key, input.value)
    }
    const expected = new Set(specs.map((s) => normalizeFieldKey(s.key)))
    for (const norm of seenNorm.keys()) {
      if (!expected.has(norm)) { const m = '多余字段：' + (seenNorm.get(norm) ?? norm); failInline(m); o.toast(o.copy.fail(m)); return }
    }
    const payload: Record<string, string> = {}
    for (const s of specs) {
      const raw = canon.get(s.key) ?? ''
      const v = raw.trim()
      if (!v) { const m = s.key + ' 不能为空'; failInline(m); o.toast(o.copy.fail(m)); return }
      if (raw.length > s.maxLen || v.length > s.maxLen) { const m = s.key + ' 超长（≤' + s.maxLen + '）'; failInline(m); o.toast(o.copy.fail(m)); return }
      if (s.pattern && !s.pattern.test(v)) { const m = s.key + ' 格式不对（' + (s.patternHint ?? '格式错误') + '）'; failInline(m); o.toast(o.copy.fail(m)); return }
      if ((o.channel === 'telegram' || o.channel === 'discord') && !isTokenLengthOk(raw, s.maxLen)) {
        const m = s.key + ' 长度不对（去空后至少 20 位）'; failInline(m); o.toast(o.copy.fail(m)); return
      }
      payload[s.key] = v
      secrets[s.key] = v
    }
    submitting = true
    submitBtn.disabled = true
    inflight = new AbortController()
    const timer = AbortSignal.timeout(8000)
    const signal = typeof AbortSignal.any === 'function'
      ? AbortSignal.any([inflight.signal, timer])
      : timer
    try {
      const raw = await o.rpc('/' + o.channel, 'bot.bind-credentials', payload, signal)
      const res = raw as { ok?: boolean; value?: unknown; error?: { code?: string; message?: string } } | null
      if (aborted) return
      if (!res || res.ok !== true) {
        const code = res?.error?.code ?? ''
        const msg = res?.error?.message ?? '绑定失败'
        const shown = o.copy.fail((code ? '[' + code + '] ' : '') + msg)
        failInline(shown)
        o.toast(shown)
        maskAfterFailure()
        return
      }
      const botId = resolveManualBotId(res.value, o.baseline)
      for (const k of Object.keys(secrets)) secrets[k] = ''
      if (!botId) {
        o.toast('已接入但未识别新机器人：请在列表中为其选择工作区')
        o.onCancel()
        return
      }
      await o.commit(botId)
    } catch (e) {
      if (aborted) return
      const m = e instanceof Error && e.name === 'TimeoutError' ? '请求超时，请重试' : String((e as Error)?.message ?? e)
      const shown = o.copy.fail(m)
      failInline(shown)
      o.toast(shown)
      maskAfterFailure()
    } finally {
      submitting = false
      submitBtn.disabled = false
      inflight = null
    }
  }

  function maskAfterFailure(): void {
    for (const s of specs) {
      const input = inputs.get(s.key)
      if (!input) continue
      if (isForbiddenKey(s.key)) {
        input.value = ''
        input.placeholder = secretPlaceholder('configured', lang)
      } else if (input.value) {
        input.placeholder = secretPlaceholder(maskPreview(input.value), lang)
      }
    }
    for (const k of Object.keys(secrets)) secrets[k] = ''
  }

  return () => { aborted = true; clearSecrets() }
}
