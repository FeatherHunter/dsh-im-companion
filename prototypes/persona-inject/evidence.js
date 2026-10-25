/**
 * T6 #166 原型证据落盘：一行一个 JSON 事件（JSONL），追加写、绝不抛。
 * 证据文件默认在本原型目录下（evidence.jsonl），由挂载配置可覆盖。
 */
import fs from 'node:fs'
import path from 'node:path'

export function createEvidence(file) {
  let seq = 0
  let broken = null
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
  } catch (error) {
    broken = error
  }

  function log(event, fields = {}) {
    const record = { t: new Date().toISOString(), seq: ++seq, event, ...fields }
    if (broken) return record
    try {
      fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8')
    } catch (error) {
      broken = error
    }
    return record
  }

  return {
    file,
    log,
    get error() {
      return broken
    },
  }
}
