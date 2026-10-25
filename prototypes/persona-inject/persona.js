/**
 * T6 #166 原型：人设文本归一化与模板拼接。
 * 依赖 T4 #164 resolution 的模板契约：
 *   textFinal = '## 助理身份：' + nameSan + '\n\n' + personaNorm + '\n\n始终以该身份回应'
 *   nameSan 去换行截 64（空回 '未命名助理'）；personaNorm 归一 CRLF + 两端 trim；trim 空即不注入；
 *   长度按 Array.from（码点）计，persona 上限 8000，超长不注入；description 不注入。
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'

export const MAX_NAME_CHARS = 64
export const MAX_PERSONA_CHARS = 8000
const EMPTY_NAME = '未命名助理'

export function loadPersonas(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'personas root must be a plain object' }
    return raw
  } catch (error) {
    return { error: String((error && error.message) || error) }
  }
}

export function sanitizeName(value) {
  const flat = String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').trim()
  const chars = Array.from(flat)
  if (chars.length === 0) return EMPTY_NAME
  return chars.length > MAX_NAME_CHARS ? chars.slice(0, MAX_NAME_CHARS).join('') : flat
}

export function normalizePersona(value) {
  return String(value == null ? '' : value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

export function pickPersona(personas, botId) {
  const table = personas && typeof personas === 'object' && !Array.isArray(personas) ? personas : {}
  const perBot = table.perBot && typeof table.perBot === 'object' && !Array.isArray(table.perBot) ? table.perBot : {}
  const byBot = botId ? perBot[botId] : null
  if (byBot && typeof byBot === 'object' && !Array.isArray(byBot)) return byBot
  if (table.default && typeof table.default === 'object' && !Array.isArray(table.default)) return table.default
  return {}
}

export function sha8(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 8)
}

export function renderPersona(def) {
  const name = sanitizeName(def && def.name)
  const personaText = normalizePersona(def && def.persona)
  const chars = Array.from(personaText)
  if (chars.length === 0) return { text: '', name, error: 'persona-empty' }
  if (chars.length > MAX_PERSONA_CHARS) return { text: '', name, error: 'persona-too-long', personaChars: chars.length }
  const text = '## 助理身份：' + name + '\n\n' + personaText + '\n\n始终以该身份回应'
  return { text, name, personaChars: chars.length, length: Array.from(text).length, sha8: sha8(text) }
}
