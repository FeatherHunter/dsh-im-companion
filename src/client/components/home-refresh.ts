/* 手动刷新（页头刷新钮 + 家表重试钮共用一条管道）。
 *
 * 第一性原理：手动动作必须**可确认**且**不可叠**。
 *   ① 一次刷新 = 两个真相源各读一遍（渠道/机器人快照 → 家表；顺序不能反：家表种子判定要读刚更新的 bot 名单）；
 *   ② 在途去重：连点两下不该叠成两轮（读是幂等的，但会放大 RPC，且与种子 sweep 交叠时更容易踩竞态）；
 *   ③ 忙态成对：onBusy(true) → onBusy(false) 必然一一对应，异常路径也不例外（否则按钮会永久禁用）。
 * 这里只做编排与状态机，不碰 DOM：按钮禁用/转圈、完成提示由调用方在回调里决定。 */

export interface RefreshDeps {
  /** 真相源一：渠道与机器人快照（共享 connection-stream 的一次 refresh）。 */
  load: () => Promise<void>
  /** 真相源二：家表（home.list，必要时补种子）。 */
  reloadHomes: () => Promise<void>
  onBusy?: (busy: boolean) => void
  onDone?: (ok: boolean) => void
}

export type Refresher = () => Promise<boolean>

export function createRefresher(deps: RefreshDeps): Refresher {
  let busy = false
  const fire = (fn: ((v: boolean) => void) | undefined, v: boolean): void => {
    try {
      fn?.(v)
    } catch {
      /* 忙态/完成回调自身的失败不能影响刷新结果 */
    }
  }
  return async () => {
    if (busy) return false
    busy = true
    fire(deps.onBusy, true)
    let ok = true
    try {
      await deps.load()
      await deps.reloadHomes()
    } catch {
      ok = false
    }
    busy = false
    fire(deps.onBusy, false)
    fire(deps.onDone, ok)
    return ok
  }
}
