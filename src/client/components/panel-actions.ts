/** FleetPanel 动作层：用户操作处理器（创建/改名/接入/选家/移除渠道机器人/头像），失败统一 toast。
 * 一行一操作：内部封装 store/RPC 编排，编排器只按手势名称调用。 */
import { channelLabel } from '../data/config'
import { showMenu } from '../ui/menu'
import { toast } from '../ui/toast'
import type { RpcCall } from '../data/fleet-api'
import type { AgentMetaDoc, MetaStore } from '../data/meta'
import type { AgentView } from '../data/model'
import { openConnectFlow } from './connect-flow'
import { firstViewCopy } from './first-view-copy'
import { WORKSPACE_PICKER_COPY, ctxNativePicker, openDirPicker } from '../ui/dir-picker'

export interface PanelActionsDeps {
  ctx: unknown
  rpc: RpcCall | null
  getStore(): MetaStore | null
  getMeta(): AgentMetaDoc
  /** 变更后静默刷新（load(true)）。 */
  refresh(): Promise<void>
  /** 重载元数据（本地变更后调用）。 */
  loadMeta(): Promise<void>
  /** 重渲染（loadMeta 完成后调用）。 */
  render(): void
}

export interface PanelActions {
  /** 创建即落家（#62：无工作区不允许创建出可接入助理）。 */
  create(name: string, workspace: string): Promise<boolean>
  rename(view: AgentView, next: string): Promise<void>
  connect(view: AgentView, anchor: HTMLElement): void
  pickWorkspace(view: AgentView): Promise<void>
  removeBot(view: AgentView, channel: string, botId: string): Promise<void>
  avatarMenu(view: AgentView, anchor: HTMLElement): void
  removeLocal(view: AgentView): Promise<void>
}

/** 有家才可接入（#62 源头预防：无家连扫码菜单都不进，绝不产生扫码后取消的孤儿）。 */
export function canConnect(view: Pick<AgentView, 'workspace'>): boolean {
  return !!view.workspace
}

export function createPanelActions(deps: PanelActionsDeps): PanelActions {
  /** 创建即落家（#62：无工作区不允许创建出可接入助理）。成败如实返回，供表单决定收不收。 */
  async function create(name: string, workspace: string): Promise<boolean> {
    const clean = name.trim()
    const home = workspace.trim()
    if (!clean) {
      toast('请输入 Agent 名称')
      return false
    }
    if (!home) {
      toast('创建「' + clean + '」需要先选择工作区')
      return false
    }
    if (deps.getMeta().locals.some((l) => l.name === clean)) {
      toast('「' + clean + '」已存在')
      return false
    }
    const store = deps.getStore()
    if (!store) {
      toast('连接服务不可用，无法创建')
      return false
    }
    try {
      await store.addLocal(clean)
      await store.setLocalWorkspace(clean, home)
      await store.rename(home, clean)
      await deps.loadMeta()
      toast('已创建「' + clean + '」', 'check')
      deps.render()
      return true
    } catch (e) {
      toast('创建失败：' + String((e as Error)?.message ?? e))
      return false
    }
  }

  async function rename(view: AgentView, next: string): Promise<void> {
    try {
      if (view.isLocal) await deps.getStore()?.renameLocal(view.name, next)
      else if (view.workspace || view.base) await deps.getStore()?.rename(view.workspace || view.base, next)
      else {
        toast('请先接入渠道指定工作区后再命名')
        return
      }
      await deps.loadMeta()
      toast('已改名', 'check')
      deps.render()
    } catch (e) {
      toast('改名失败：' + String((e as Error)?.message ?? e))
    }
  }

  function connect(view: AgentView, anchor: HTMLElement): void {
    if (!canConnect(view)) {
      /* 存量无家空壳：阻断扫码，直接引导去唯一真能落家的选家动作（该动作无 Bot 时只落家）。 */
      toast(firstViewCopy().needHomeForConnect(view.name))
      void pickWorkspace(view)
      return
    }
    openConnectFlow(deps.ctx, deps.rpc, anchor, { name: view.name, workspace: view.workspace }, () => void deps.refresh())
  }

  async function pickWorkspace(view: AgentView): Promise<void> {
    try {
      let picker: ReturnType<typeof openDirPicker>
      try {
        picker = openDirPicker(deps.rpc, view.workspace, ctxNativePicker(deps.ctx), WORKSPACE_PICKER_COPY)
      } catch (e) {
        toast('目录选择器打开失败：' + String((e as Error)?.message ?? e))
        return
      }
      const ws = await picker.promise
      if (!ws) return
      if (!deps.rpc) {
        toast('连接服务不可用，无法绑定工作区')
        return
      }
      const store = deps.getStore()
      if (!view.bots.length) {
        /* 无机器人只落家（#49：家是 Agent 属性，不以 bot 为前置；有家后接入直绑）。 */
        if (!view.name.trim()) {
          toast('该 Agent 暂无有效名称，无法落家')
          return
        }
        try {
          if (!store) throw new Error('连接服务不可用')
          await store.setLocalWorkspace(view.name, ws)
          await store.rename(ws, view.name)
        } catch (e) {
          toast('设置家失败：' + String((e as Error)?.message ?? e))
          return
        }
        await deps.refresh()
        toast('已为「' + view.name + '」选家，接入渠道后机器人会自动落进来', 'check')
        return
      }
      for (const b of view.bots) {
        await deps.rpc('/' + b.channel, 'bot.workspace.set', { botId: b.botId, workspace: ws }, AbortSignal.timeout(8000))
          .catch((e: unknown) => toast('渠道 ' + channelLabel(b.channel) + ' 绑定失败：' + String((e as Error)?.message ?? e)))
      }
      /* 名字跟人走（#49）：搬家后家即其名；旧工作区残留名无展示面（分组只看 bots，adopt 名单取自宿主快照），不清零。 */
      if (view.bots.length && view.name.trim() && ws !== view.workspace) {
        try {
          await deps.getStore()?.rename(ws, view.name)
          await deps.getStore()?.removeLocal(view.name)
        } catch (e) {
          toast('名称关联失败：' + String((e as Error)?.message ?? e) + '（绑定已生效）')
        }
      }
      await deps.refresh()
      toast('工作区已更新', 'check')
    } catch (e) {
      toast('选择工作区失败：' + String((e as Error)?.message ?? e))
    }
  }

  async function removeBot(view: AgentView, channel: string, botId: string): Promise<void> {
    void view
    try {
      await deps.rpc!('/' + channel, 'bot.delete', { botId, confirm: true }, AbortSignal.timeout(8000))
      await deps.refresh()
      toast('已移除渠道机器人', 'check')
    } catch (e) {
      toast('移除失败：' + String((e as Error)?.message ?? e))
    }
  }

  function avatarMenu(view: AgentView, anchor: HTMLElement): void {
    const key = view.isLocal ? localAvatarKey(view) : (view.workspace || view.base)
    const metaAvatars = deps.getMeta().avatars
    const hasCustom = !!key && (!!metaAvatars[key] || (!!view.base && !!metaAvatars[view.base]))
    const items: { label: string; iconName: 'camera' | 'trash'; danger?: boolean; onSelect: (() => void) | (() => Promise<void>) }[] = [
      { label: '上传图片', iconName: 'camera', onSelect: () => pickAvatar(view) },
    ]
    if (hasCustom) items.push({ label: '移除自定义头像', iconName: 'trash', onSelect: () => clearAvatar(view) })
    showMenu(anchor, items, 'bottom-right')
  }

  function pickAvatar(view: AgentView): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) void applyAvatar(view, file)
    }
    input.click()
  }

  async function applyAvatar(view: AgentView, file: File): Promise<void> {
    try {
      if (file.size > 4 * 1024 * 1024) {
        toast('图片不能超过 4MB')
        return
      }
      const dataUrl = await downscaleImage(file)
      const key = view.isLocal ? localAvatarKey(view) : (view.workspace || view.base)
      if (!key) {
        toast('该 Agent 暂不支持设置头像')
        return
      }
      await deps.getStore()?.setAvatar(key, dataUrl)
      await deps.loadMeta()
      toast('头像已更新', 'check')
      deps.render()
    } catch (e) {
      toast('头像设置失败：' + String((e as Error)?.message ?? e))
    }
  }

  async function clearAvatar(view: AgentView): Promise<void> {
    const key = view.isLocal ? localAvatarKey(view) : (view.workspace || view.base)
    if (!key) return
    await deps.getStore()?.clearAvatar(key)
    await deps.loadMeta()
    toast('已恢复默认头像', 'check')
    deps.render()
  }

  async function removeLocal(view: AgentView): Promise<void> {
    await deps.getStore()?.removeLocal(view.name)
    await deps.loadMeta()
    toast('已删除「' + view.name + '」')
    deps.render()
  }

  return { create, rename, connect, pickWorkspace, removeBot, avatarMenu, removeLocal }
}

function localAvatarKey(view: AgentView): string {
  return 'local:' + view.name
}

/** 压缩到头像尺寸（最长边 256px，JPEG 0.85）。 */
function downscaleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const MAX = 256
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx2d = canvas.getContext('2d')
        if (!ctx2d) throw new Error('canvas 不可用')
        ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      } catch (e) {
        URL.revokeObjectURL(url)
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片读取失败'))
    }
    img.src = url
  })
}
