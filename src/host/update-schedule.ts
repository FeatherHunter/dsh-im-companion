/** 更新系统宿主侧（T7 #90）：自动检查调度器（受管定时器 + 可注入时钟）。
 *
 * 口径（T4 §D / §F，逐条落实）：
 * - 档位 `intervalHours ∈ {6,12,24,168}`，默认 24（默认值单点在 store 层 `meta-store.ts`）；
 * - 启动后 **60 s 首查**一次；
 * - **不做指数退避**：失败就等下一个档位周期自然重试；
 * - **唯一例外**：启动后 60 s 的首查失败 → **5 分钟后补一次**，补查仍失败则回归档位周期；
 * - 面板改档位 = 释放旧档位定时器 + 建新档位定时器，**不重跑启动首查**，也**不动**已排定的首查槽；
 * - 关开关 = **立即**释放全部定时器并清掉「待补首查」状态；
 * - 重新打开 = 按档位重排下一次，**不重跑**启动首查。
 *
 * 定时器纪律：一律走宿主受管定时器（生产 = `ctx.interval` / `ctx.timeout`，见 `update.ts` 的 `ctxTimerPort`），
 * **禁裸 `setInterval`/`setTimeout`**——裸定时器无 owner，热重载 / 重装配下会跨代叠加。
 * 周期用 `every`（= `ctx.interval`），两个一次性的（首查 / 补查）用 `once`（= `ctx.timeout`）：
 * 用 `ctx.interval` 排一次性会把检查变成每 60 s 一发，是缺陷不是风格。
 * 每个句柄都登记在 `period` / `first` 两个槽里，释放路径唯一（`releaseAll`），并在装配处再挂一道 `ctx.effect` 兜底。
 * 不变式：**任何覆盖 `period` / `first` 槽的路径都必须先释放旧句柄**（`start()` / `apply()` 均照此办）。
 */
import type { UpdatePrefs } from './meta-store.js'

/** 受管定时器端口：生产实现包 `ctx.interval`（周期）与 `ctx.timeout`（一次性），两者都返回释放函数。 */
export interface TimerPort {
  every(callback: () => void, delayMs: number): () => void
  once(callback: () => void, delayMs: number): () => void
}

export interface SchedulerPorts {
  timer: TimerPort
  /** 时钟（假时钟可测）：`nextCheckAt` 与各次尝试时间都由它产出。 */
  now: () => number
  /** 跑一次检查：true = 成功，false = 失败；抛错按失败处理（不让定时器回调把异常抛到事件循环）。 */
  check: () => Promise<boolean>
  firstDelayMs?: number
  retryDelayMs?: number
  hoursToMs?: (hours: number) => number
  onWarn?: (message: string) => void
}

export interface UpdateScheduler {
  /** 装配期：按当前偏好排定时器（含启动首查）。 */
  start(prefs: UpdatePrefs): void
  /** 运行期改偏好：改档位只换档位定时器；关开关立即全释放。都不重跑启动首查。 */
  apply(prefs: UpdatePrefs): void
  /** 释放全部在册定时器（卸载 / 关闭开关走它）。 */
  stop(): void
  /** 下次自动检查的预计时间；无在册定时器（开关关闭 / 已停止）为 null。 */
  nextCheckAt(): number | null
  /** 在册定时器数（verify 断言用：证明释放真的发生了）。 */
  armed(): number
}

export const STARTUP_FIRST_DELAY_MS = 60_000
export const FIRST_RETRY_DELAY_MS = 300_000
export const HOUR_MS = 3_600_000

interface Armed {
  dueAt: number
  dispose: () => void
}

export function createUpdateScheduler(ports: SchedulerPorts): UpdateScheduler {
  const firstDelayMs = ports.firstDelayMs ?? STARTUP_FIRST_DELAY_MS
  const retryDelayMs = ports.retryDelayMs ?? FIRST_RETRY_DELAY_MS
  const hoursToMs = ports.hoursToMs ?? ((hours: number) => hours * HOUR_MS)
  let period: Armed | null = null
  let first: Armed | null = null
  let enabled = false
  /** 启动首查是否已消费（跑过 或 被关开关清掉）。一经消费，本实例永不重排。 */
  let startupFirstUsed = false

  function releasePeriod(): void {
    const armed = period
    period = null
    try { armed?.dispose() } catch (error) { ports.onWarn?.('释放档位定时器失败：' + String(error)) }
  }
  function releaseFirst(): void {
    const armed = first
    first = null
    try { armed?.dispose() } catch (error) { ports.onWarn?.('释放首查定时器失败：' + String(error)) }
  }
  function releaseAll(): void {
    releasePeriod()
    releaseFirst()
  }

  /** 跑到点就调已注册的检查端口；周期槽每跑一次把预计时间滚到下一档。 */
  async function runAuto(isStartupFirst: boolean): Promise<void> {
    let ok = false
    try {
      ok = await ports.check()
    } catch (error) {
      ports.onWarn?.('自动检查抛错：' + String(error))
    }
    if (!isStartupFirst) return
    if (ok || !enabled) return
    // 唯一例外：首查失败 → 5 分钟后补一次；补查走同一个槽，结束后回归档位周期（不再补）。
    first = {
      dueAt: ports.now() + retryDelayMs,
      dispose: ports.timer.once(() => { first = null; void runAuto(false) }, retryDelayMs),
    }
  }

  function armPeriod(hours: number): void {
    const delayMs = hoursToMs(hours)
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      ports.onWarn?.('档位非法，不排档位定时器：' + String(hours))
      return
    }
    period = {
      dueAt: ports.now() + delayMs,
      dispose: ports.timer.every(() => {
        if (period) period.dueAt = ports.now() + delayMs
        void runAuto(false)
      }, delayMs),
    }
  }

  function armStartupFirst(): void {
    first = {
      dueAt: ports.now() + firstDelayMs,
      dispose: ports.timer.once(() => {
        first = null
        startupFirstUsed = true
        void runAuto(true)
      }, firstDelayMs),
    }
  }

  return {
    start(prefs: UpdatePrefs): void {
      enabled = prefs?.autoCheckEnabled === true
      // 必须先释放旧句柄：装配期读偏好是异步的（`update.ts` 的 `start()` 等 `store.load()` 落定），
      // 而面板可在落定前就写 `meta.update.set` → 那时 `sync()` 已经 `apply()` 过一次、档位槽里已有句柄。
      // 不先释放就直接覆盖 `period` 槽 = 旧句柄永远无人 dispose（ctx.interval 泄漏）+ 周期检查跑双份。
      // 装配期本方法只调一次，此处 `first` 槽尚不存在（只有本方法会排它），释放它是无副作用的兜底。
      releaseAll()
      if (!enabled) {
        // 关着启动：不排任何定时器，也不留「待补首查」——重新打开时只按档位重排。
        startupFirstUsed = true
        return
      }
      armPeriod(prefs.intervalHours)
      if (!startupFirstUsed) armStartupFirst()
    },
    apply(prefs: UpdatePrefs): void {
      if (prefs?.autoCheckEnabled !== true) {
        releaseAll()
        startupFirstUsed = true
        enabled = false
        return
      }
      enabled = true
      releasePeriod()
      armPeriod(prefs.intervalHours)
      // 首查槽不动：改档位既不重跑启动首查，也不取消已排定的那一次。
    },
    stop(): void {
      releaseAll()
      enabled = false
      startupFirstUsed = true
    },
    nextCheckAt(): number | null {
      const dues = [period, first].filter((armed): armed is Armed => armed !== null).map((armed) => armed.dueAt)
      return dues.length ? Math.min(...dues) : null
    },
    armed(): number {
      return (period ? 1 : 0) + (first ? 1 : 0)
    },
  }
}
