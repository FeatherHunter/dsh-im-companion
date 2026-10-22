// 共用假 ctx（#79 / T8-2 #170）：复刻宿主的 cordis 声明守卫 + connection 服务面（fetch.register）
// + systemPrompt 服务面（section 注册/同名守卫/disposer 计数）+ 后置 ctx.inject 回调。
// host-entry.ts 与 features/persona-inject.ts 共用这一份，避免第二个 harness。
//
// 声明守卫星：没注入 timer 时读 ctx.interval / ctx.timeout 直接抛（2026-09-12 冷启动事故的复刻）；
// 没注入 connection / webServer 时读同名属性也抛（cordis 文案逐字同款）。
export type FetchRoute = { path: string; methods?: string[]; requestBody?: string; fetch: (req: any) => Promise<any> };
export type ScheduledTimer = { kind: 'interval' | 'timeout'; ms: number };

/** 交给 systemPrompt.section() 的段声明（只列本仓用到的键；多余键原样保留）。 */
export type PromptSectionSpec = {
  name: string;
  order: number;
  interpolate?: boolean;
  text: (assembly: unknown) => string;
  required?: boolean;
  complete?: boolean;
  [key: string]: unknown;
};

export type FakeCtx = {
  ctx: any;
  routes: FetchRoute[];
  warns: string[];
  timers: ScheduledTimer[];
  /** 每次 ctx.inject(list, cb) 的 list 快照（按调用顺序）。 */
  injected: string[][];
  /** 已注册（未 dispose）的 prompt section。 */
  sections: PromptSectionSpec[];
  /** section() 返回的 disposer 被调用次数（断言清理真的发生）。 */
  promptDisposals: number;
  /** ctx.effect(fn) 返回的清理函数（测试手动卸载时逐个调用）。 */
  effects: Array<() => void>;
  /** 同一个 systemPrompt 服务面（预置同名段 / 断言注册状态用）。 */
  prompt: { section(spec: PromptSectionSpec): () => void };
};

/** 建一个声明感知的假 ctx。withPrompt=false 模拟宿主没有 systemPrompt 服务（inject 回调不执行）。 */
export function makeCtx(
  declared: readonly string[],
  opts: { withFetch?: boolean; registerError?: string; withPrompt?: boolean } = {},
): FakeCtx {
  const { withFetch = true, registerError, withPrompt = true } = opts;
  const routes: FetchRoute[] = [];
  const warns: string[] = [];
  const timers: ScheduledTimer[] = [];
  const injected: string[][] = [];
  const sections: PromptSectionSpec[] = [];
  const effects: Array<() => void> = [];
  let promptDisposals = 0;

  const systemPrompt = {
    section(spec: PromptSectionSpec) {
      if (!spec || typeof spec.name !== 'string' || !spec.name) {
        throw new TypeError('prompt section name must be a non-empty string');
      }
      // 宿主原话：lib/index.js:245-256（order 必须是有限数）。
      if (!Number.isFinite(spec.order)) {
        throw new TypeError('prompt section "' + spec.name + '" order must be a finite number');
      }
      if (sections.some((s) => s.name === spec.name)) {
        // 宿主原话（同名再注册）：lib/index.js section()。
        throw new Error('prompt section "' + spec.name + '" is already registered (for a per-agent override, register through that agent\'s agent.ctx instead)');
      }
      sections.push(spec);
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        promptDisposals++;
        const i = sections.indexOf(spec);
        if (i >= 0) sections.splice(i, 1);
      };
    },
  };

  const raw: Record<string, unknown> = {
    logger: { info: () => {}, warn: (m?: unknown) => { warns.push(String(m)); } },
    effect: (fn: () => unknown, label?: string) => {
      const d = fn();
      const disposer = () => { if (typeof d === 'function') d(); };
      effects.push(disposer);
      void label;
      return disposer;
    },
    provide: () => {},
    inject: (list: string[], cb: (serviceCtx: unknown) => void) => {
      injected.push([...list]);
      // 真宿主在服务可用时回调；withPrompt=false ⇒ 服务缺席，回调永不执行（apply 也不许炸）。
      if (withPrompt) cb({ systemPrompt });
      return () => {};
    },
  };
  const ctx: any = new Proxy(raw, {
    get(target, prop, receiver) {
      if (prop === 'interval' || prop === 'timeout') {
        if (!declared.includes('timer')) {
          throw new Error('cannot get property "timer" without inject');
        }
        return (_cb: () => void, ms: number) => {
          timers.push({ kind: prop as ScheduledTimer['kind'], ms });
          return () => {};
        };
      }
      if (prop === 'webServer' || prop === 'connection') {
        if (!declared.includes(prop)) {
          throw new Error(`cannot get property "${prop}" without inject`);
        }
        if (prop === 'webServer') return { register: () => () => {} };
        const connection: Record<string, unknown> = {
          rpc: { handle: () => { throw new Error('rpc.handle must not be used anymore (#79)'); } },
        };
        if (withFetch) {
          connection.fetch = {
            register: (options: FetchRoute) => {
              if (registerError !== undefined) throw new Error(registerError);
              routes.push(options);
              return () => { const i = routes.indexOf(options); if (i >= 0) routes.splice(i, 1); };
            },
          };
        }
        return connection;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  const result = { ctx, routes, warns, timers, injected, sections, effects, prompt: systemPrompt } as FakeCtx;
  // 计数用 getter：disposer 调用发生在 makeCtx 返回之后，快照数字读不到。
  Object.defineProperty(result, 'promptDisposals', { get: () => promptDisposals, enumerable: true });
  return result;
}
