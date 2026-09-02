// 浏览器预览 harness：假渠道/接入数据挂载 lib/client.js（调试用，非交付；纯 TS）
import * as React from 'react'
import * as ReactDOMClient from 'react-dom/client'

type AFRegister = { opts: unknown; Comp: React.ComponentType }

interface AFWindow {
  __ModuleLoader__?: { load(o: { id: string; factory: (r: (n: string) => unknown) => unknown }): void }
  __AF?: { apply(ctx: unknown): void }
  __AF_REG?: AFRegister
}

const A = window as unknown as AFWindow
const QR_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='200' height='200' rx='16' fill='#fff'/><g fill='#101012'><rect x='16' y='16' width='40' height='40'/><rect x='72' y='16' width='40' height='40'/><rect x='128' y='16' width='56' height='40'/><rect x='16' y='72' width='24' height='40'/><rect x='72' y='72' width='56' height='40'/><rect x='144' y='72' width='40' height='56'/><rect x='16' y='128' width='40' height='56'/><rect x='72' y='128' width='24' height='24'/><rect x='120' y='128' width='56' height='56'/></g></svg>"

function preseed(): void {
  localStorage.setItem('af-fleet-names', JSON.stringify({ xiaoshuai: '小帅', xinghuo: '星火' }))
  localStorage.setItem('af-fleet-agents', JSON.stringify([{ name: '新同事', workspace: '' }]))
  localStorage.setItem('af-fleet-avatars', JSON.stringify({}))
}

function fakeCtx(): unknown {
  const now = Date.now()
  type MockBot = { botId: string; ws: string; st: string; name?: string }
  const MOCK: Record<string, { color: string; bots: MockBot[] }> = {
    feishu: { color: '#3370ff', bots: [
      { botId: 'bf1', ws: 'D:\\3DeepSeekHarness\\agents\\xiaoshuai', st: 'healthy' },
      { botId: 'bf2', ws: 'D:\\3DeepSeekHarness\\agents\\xinghuo', st: 'offline' },
      { botId: 'bf3', ws: 'D:\\3DeepSeekHarness\\agents\\xiaoyan', st: 'degraded' },
      { botId: 'bf4', ws: 'D:\\3DeepSeekHarness\\agents\\shujucangkuguanliyuan', st: 'healthy' },
    ] },
    weixin: { color: '#07c160', bots: [
      { botId: 'bw1', ws: 'D:\\3DeepSeekHarness\\agents\\wechat', st: 'healthy' },
      { botId: 'bw2', ws: 'D:\\3DeepSeekHarness\\agents\\xiaoshuai', st: 'healthy' },
    ] },
    qq: { color: '#12b7f5', bots: [
      { botId: 'bq1', ws: '', st: 'offline', name: 'QQ机器人' },
      { botId: 'bq2', ws: 'D:\\3DeepSeekHarness\\agents\\xiaoshuai', st: 'healthy' },
    ] },
    slack: { color: '#4a154b', bots: [{ botId: 'bs1', ws: 'D:\\3DeepSeekHarness\\agents\\xinghuo', st: 'healthy' }] },
    telegram: { color: '#2aabee', bots: [{ botId: 'bt1', ws: 'D:\\3DeepSeekHarness\\agents\\xiaosun', st: 'offline' }] },
    discord: { color: '#5865f2', bots: [{ botId: 'bd1', ws: 'D:\\3DeepSeekHarness\\agents\\xiaowan', st: 'checking' }] },
    whatsapp: { color: '#25d366', bots: [{ botId: 'bwa1', ws: 'D:\\3DeepSeekHarness\\agents\\xiaoyan', st: 'healthy' }] },
    dingtalk: { color: '#0091ff', bots: [{ botId: 'bdd1', ws: 'D:\\3DeepSeekHarness\\agents\\xiaozhuo', st: 'healthy' }] },
    wecom: { color: '#2e7cf6', bots: [{ botId: 'bwc1', ws: 'D:\\3DeepSeekHarness\\agents\\xiaoshuai', st: 'healthy' }] },
  }
  const snap = (bots: MockBot[], color: string) => ({
    ok: true,
    value: {
      schemaVersion: 2,
      bots: bots.map((b) => ({
        botId: b.botId,
        workspace: b.ws,
        connected: b.st === 'healthy',
        health: { status: b.st, summary: '', lastCheckedAt: now },
        bot: { name: b.name ?? '飞书机器人', avatarUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' rx='32' fill='" + color + "'/></svg>") },
      })),
    },
  })
  return {
    logger: () => ({ info() {}, error() {} }),
    effect() {},
    emit() {},
    get(n: string) { return n === 'uiWorkspace' ? undefined : undefined },
    slots: {
      inject(_n: string, fn: () => unknown) { return fn() },
      register(opts: unknown, Comp: React.ComponentType) { (window as unknown as { __AF_REG?: AFRegister }).__AF_REG = { opts, Comp }; return () => {} },
    },
    connection: {
      rpc: {
        call: async (ch: string, endpoint: string, payload: Record<string, unknown> | undefined) => {
          if (ch === '/im-companion') {
            if (endpoint === 'fs.defaultRoot') return { ok: true, value: { path: 'C:\\' } }
            if (endpoint === 'fs.list') {
              const dir = String(payload?.path ?? '')
              const entries = dir === 'C:\\'
                ? [{ name: '3DeepSeekHarness', path: 'C:\\3DeepSeekHarness' }, { name: 'dsh-plugin', path: 'C:\\dsh-plugin' }, { name: 'Users', path: 'C:\\Users' }]
                : ['xiaoshuai', 'xinghuo', 'xiaoyan', 'wechat', 'xiaosun'].map((n: string) => ({ name: n, path: dir + '\\' + n }))
              return { ok: true, value: { path: dir, parent: dir === 'C:\\' ? null : 'C:\\', entries } }
            }
            return { ok: false, error: { code: 'CHANNEL_NOT_CONFIGURED', message: '未配置', details: {} } }
          }
          const key = ch.replace(/^\//, '')
          const entry = MOCK[key]
          if (entry) {
            if (endpoint === 'provision.begin') {
              return { ok: true, value: { attemptId: 'attempt-' + Date.now(), phase: 'qr', submitted: false, expiresAt: Date.now() + 300000, durationMs: 300000, qrCodeDataUrl: 'data:image/svg+xml;base64,' + btoa(QR_SVG), verificationUrl: '' } }
            }
            if (endpoint === 'provision.cancel' || endpoint === 'bot.workspace.set' || endpoint === 'bot.delete') return { ok: true, value: {} }
            return snap(entry.bots, entry.color)
          }
          return { ok: false, error: { code: 'CHANNEL_NOT_CONFIGURED', message: '未配置', details: {} } }
        },
      },
    },
  }
}

async function boot(): Promise<void> {
  preseed()
  A.__ModuleLoader__ = {
    load({ factory }) {
      A.__AF = factory((name: string) => {
        if (name === 'react') return React
        if (name === 'react-dom' || name === 'react-dom/client') return ReactDOMClient
        throw new Error('require ' + name)
      })
    },
  }
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = '/lib/client.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('lib/client.js 加载失败'))
    document.head.appendChild(s)
  })
  A.__AF!.apply(fakeCtx())
  const registered = A.__AF_REG
  if (!registered) throw new Error('slots.register 未触发')
  ReactDOMClient.createRoot(document.getElementById('app')!).render(React.createElement(registered.Comp))
  if (location.search.includes('light')) document.body.classList.add('light')
}

void boot().catch((e: unknown) => {
  const el = document.getElementById('app')
  if (el) el.textContent = 'harness error: ' + String((e as Error)?.message ?? e)
})
