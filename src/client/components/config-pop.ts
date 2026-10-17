/** 配置入口（T12 #129）：面板页头「配置」按钮 + 锚定弹层——配置目录绝对路径 / 复制路径 / 在文件浏览器打开。
 *
 *  客户端只说意图：**平台配方**（win32 explorer / darwin open / linux xdg-open）全在宿主的 `config.openDir`，
 *  本文件不认 OS、不拼命令（三系统共用同一份代码）。端点：`config.path`（目录 + 目录内文件）、`config.openDir`。
 *  两条动作都落 resident 日志 `config.action`：事后只看磁盘日志即可判「点没点上、成没成、原文是什么」。
 *  锚点一律传解析器——面板重建后捕获的元素会游离（home-pop 第一性原则）。 */
import { h } from '../dom'
import type { RpcCall } from '../data/fleet-api'
import { icon } from '../icons'
import { logLine } from '../log'
import { makeIconButton } from '../ui/button'
import { installConfigPopStyles } from './config-pop-styles'
import { bridge, msgOf } from './home-ops'
import { openHomePop, type AnchorRef } from './home-pop'

const HINT = 'homes.yaml 记家与助理，meta.yaml 记名字/头像/预设/开关，都在下面这个目录里。'
const NOTE = '注释块由插件强制写回：结构字段可以手改（改完刷新面板生效），手改的注释会在下次写回时被恢复。'

/** 兼容复制：Clipboard API 缺失/被拒时退到 execCommand——两条都失败才算失败，绝不假报「已复制」。 */
function legacyCopy(text: string): boolean {
  try {
    const ta = h('textarea', { className: 'cfg-copy-src', readOnly: true, 'aria-hidden': 'true' })
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

async function copyText(text: string): Promise<string> {
  const clip = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).navigator?.clipboard
  if (typeof clip?.writeText === 'function') {
    try {
      await clip.writeText(text)
      return 'clipboard'
    } catch {
      /* 被拒/非安全上下文：落到兼容路径，别就此报失败 */
    }
  }
  if (legacyCopy(text)) return 'execCommand'
  throw new Error('这个环境不让写剪贴板，请手动选中上面那行路径复制')
}

/** 页头「配置」按钮（面板装配处只调这一个函数）。 */
export function createConfigButton(rpc: RpcCall | null): HTMLElement {
  installConfigPopStyles()
  const btn = makeIconButton({ iconName: 'folder', label: '配置', title: '配置：复制路径 / 在文件浏览器打开' })
  btn.addEventListener('click', () => openConfigPop(() => (btn.isConnected ? btn : null), rpc))
  return btn
}

function openConfigPop(anchor: AnchorRef, rpc: RpcCall | null): void {
  const pathText = h('div', { className: 'cfg-path' }, '读取中…')
  const filesText = h('p', { className: 'cfg-files' }, '')
  const status = h('p', { className: 'cfg-status' }, '')
  let dir = ''
  const say = (msg: string): void => { status.textContent = msg }
  const did = (action: string, ok: boolean, message: string): void =>
    logLine(ok ? 'info' : 'error', 'config.action', { action, dir, ok, message })

  async function load(): Promise<void> {
    if (!rpc) {
      pathText.textContent = '宿主桥不可用（面板没拿到 rpc）'
      return
    }
    try {
      const v = await bridge<{ dir?: string; files?: string[] }>(rpc, 'config.path', {})
      dir = String(v.dir ?? '')
      pathText.textContent = dir || '宿主没有回目录'
      const files = Array.isArray(v.files) ? v.files : []
      /* 目录内文件是同级并列项：各成一个节点、由 flex gap 分隔（分隔靠结构不靠符号）。 */
      filesText.textContent = ''
      if (files.length) {
        filesText.setAttribute('style', 'display:flex;flex-wrap:wrap;gap:6px')
        filesText.replaceChildren(h('span', null, '目录内：'), ...files.map((f) => h('span', null, f)))
      }
    } catch (e) {
      pathText.textContent = '读取失败'
      say('读配置目录失败：' + msgOf(e))
      did('path', false, msgOf(e))
    }
  }

  async function doCopy(): Promise<void> {
    if (!dir) {
      say('还没读到目录，稍等一下再点')
      return
    }
    try {
      const via = await copyText(dir)
      say(via === 'clipboard' ? '已复制到剪贴板' : '已复制（兼容方式）')
      did('copy', true, via)
    } catch (e) {
      say('复制失败：' + msgOf(e))
      did('copy', false, msgOf(e))
    }
  }

  async function doOpen(): Promise<void> {
    if (!rpc) {
      say('宿主桥不可用，打不开')
      return
    }
    try {
      const v = await bridge<{ opener?: string }>(rpc, 'config.openDir', {})
      const via = String(v.opener ?? '')
      say('已交给系统打开' + (via ? '（' + via + '）' : ''))
      did('open', true, via)
    } catch (e) {
      say('打开失败：' + msgOf(e))
      did('open', false, msgOf(e))
    }
  }

  const copyBtn = h('button', { className: 'hu-pbtn-s', type: 'button' }, '复制路径')
  copyBtn.addEventListener('click', () => void doCopy())
  const openBtn = h('button', { className: 'hu-pbtn-s go', type: 'button' }, '在文件浏览器打开')
  openBtn.addEventListener('click', () => void doOpen())

  openHomePop(anchor, {
    width: 340,
    label: '配置',
    title: h('div', { className: 'hu-ptitle' }, icon('folder', 15), '配置'),
    body: [
      h('p', { className: 'hu-fhint' }, HINT),
      pathText,
      filesText,
      h('p', { className: 'hu-fhint' }, NOTE),
      status,
    ],
    foot: [copyBtn, openBtn],
  })
  void load()
}
