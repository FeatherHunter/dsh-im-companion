/** truth-flags 纯逻辑：六路结论冻结 + 红环断言（无 DOM、无 Node API、无时间拼接）。
 * 2026-09-07 水位退役（用户拍板：水位=AI 错误引入概念；已看判定=官方绿点自售自清）：
 * flags 只接收四个真相字段（open/kind/approval/titleHit），不做任何"看过没看过"判断——
 * 绿点必黄由 DOM 原生主路径（sessions.ts done→seen）负责，本模块只管真相路径（红/蓝/approval 黄）。 */
export type RowFlag = 'red' | 'blue' | 'yellow' | 'done' | 'none';

export type RedReason = 'approval' | 'aborted' | 'forbidden402' | 'unknown-default';
export type YellowSrc = 'approval-wait';
export type BlueSrc = 'running';
export type Diag = 'nosig' | 'nosig0' | null;

export interface SessFlag {
  key: string;
  flag: RowFlag;
  redReason?: RedReason;
  yellowSrc?: YellowSrc;
  blueSrc?: BlueSrc;
  diag?: Diag;
  tip: string;
}

export interface RowFlags {
  aggregate: RowFlag;
  peers: SessFlag[];
  diag: Diag;
}

export interface FlagsInput {
  open: boolean;
  kind: string;
  approval: boolean;
  titleHit: boolean;
}

import { classifyKind } from '../../client/data/session-kind';

/** 主函数：六路结论冻结（优先级即书写顺序）。tip 只写状态+原因中文，不拼任何时间。 */
export function flagsForSession(input: FlagsInput): SessFlag {
  var cls = classifyKind(input.kind);
  var is402 = cls.is402;
  var isAborted = cls.isAborted;
  var isDoneKind = cls.isDoneKind;
  /* isKnown/isUnknown 与旧语义逐字等价：'' | 402 | aborted | done 为已知（含 error 归未知红）。 */
  var isKnown = cls.isEmpty || is402 || isAborted || isDoneKind;
  var isUnknown = !isKnown;

  // 无标题默认无色，兜底以后再说。
  if (!input.titleHit) {
    return { key: '', flag: 'none', diag: null, tip: '无标题默认无色' };
  }

  // 红环：402 / aborted 优先于一切黄蓝。
  if (is402) {
    return { key: '', flag: 'red', redReason: 'forbidden402', diag: null, tip: '请求被拒需处理' };
  }
  if (isAborted) {
    return { key: '', flag: 'red', redReason: 'aborted', diag: null, tip: '已中止需处理' };
  }

  // 等待用户选择弹窗（黄）：P1 废止红线——approval-pending 永不产 red，只产黄。
  // 弹窗阻塞 turn（虽 open 但等你拍板），故排在 open（蓝）之前。
  // RedReason['approval'] 仅为类型冻结占位，运行期永不发出。
  if (input.approval) {
    return { key: '', flag: 'yellow', yellowSrc: 'approval-wait', diag: null, tip: '待确认 · 等你选择' };
  }

  // 执行中（蓝）：open 缺 closer 即执行中——写入是阵发性的，
  // 以"无进展"判静默会把正常思考中的任务闪灭（2026-09-07 真机复现）。
  // 崩溃残留 open 的鉴别交 E4（stale-open 样本到后建红候选规则），此处永不静默。
  if (input.open) {
    return { key: '', flag: 'blue', blueSrc: 'running', diag: null, tip: '执行中' };
  }

  // 收尾 completed 且已闭合：平静（绿点必黄由 DOM 主路径管；官方绿点灭=已看）。
  if (isDoneKind) {
    return { key: '', flag: 'none', diag: null, tip: '已完成' };
  }

  // 未知 kind（error/blocked/interrupted/max-tokens 等）：异常即处理，不看水位/新旧。
  if (isUnknown) {
    return { key: '', flag: 'red', redReason: 'unknown-default', diag: null, tip: '未知收尾需确认' };
  }

  // kind 空（解码无收尾/无信号）：诚实无色。
  return { key: '', flag: 'none', diag: 'nosig0', tip: '暂无信号无色' };
}
