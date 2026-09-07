/** truth-flags 纯逻辑：六路结论冻结 + 红环断言（无 DOM、无 Node API、无时间拼接）。 */
export type RowFlag = 'red' | 'blue' | 'yellow' | 'done' | 'none';

export type RedReason = 'approval' | 'aborted' | 'forbidden402' | 'unknown-default';
export type YellowSrc = 'system-amber' | 'native-dot' | 'water-level' | 'approval-wait';
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
  amber: boolean;
  green: boolean;
  isNew: boolean;
  justFinished: boolean;
  titleHit: boolean;
  /** 本页是否此前已见过该会话 running：首见（false）信任 open 染蓝，防种子水位误杀；
   * 持续无进展（true）才判静默。缺省按 true（保守）。 */
  observedBefore?: boolean;
}

/** 静默残留判定（纯函数，供断言）：open 真但水位无进展、非刚收尾、无审批、且此前已见过。 */
export function isStaleOpen(open: boolean, isNew: boolean, justFinished: boolean, approval: boolean, observedBefore: boolean): boolean {
  return open && !isNew && !justFinished && !approval && observedBefore;
}

function normKind(raw: string): string {
  return String(raw ?? '').trim().toLowerCase();
}

/** 主函数：六路结论冻结（优先级即书写顺序）。tip 只写状态+原因中文，不拼任何时间。 */
export function flagsForSession(input: FlagsInput): SessFlag {
  var kind = normKind(input.kind);
  var is402 = kind.indexOf('402') >= 0;
  var isAborted = kind.indexOf('abort') >= 0;
  var isDoneKind = kind === 'completed' || kind === 'transient';
  var isKnown = kind === '' || is402 || isAborted || isDoneKind;
  var isUnknown = !isKnown;

  // 无标题默认无色，兜底以后再说。
  if (!input.titleHit) {
    return { key: '', flag: 'none', diag: null, tip: '无标题默认无色' };
  }

  if (input.justFinished) {
    return { key: '', flag: 'done', diag: null, tip: '已收尾完成' };
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

  // 黄源内部优先级：amber > green（“amber 优先”仅指黄源内部排序，红优先于黄）。
  if (input.amber) {
    return { key: '', flag: 'yellow', yellowSrc: 'system-amber', diag: null, tip: '系统警告待看' };
  }
  if (input.green) {
    return { key: '', flag: 'yellow', yellowSrc: 'native-dot', diag: null, tip: '原生圆点待看' };
  }

  // 沉默 open：此前已见过仍无进展、非刚收尾、无审批 => none（崩溃残留 open 不得永久蓝）。
  // 首见（observedBefore===false）信任 open 走下蓝分支，防种子水位（首刷 mark==mtime）误杀真执行中。
  if (isStaleOpen(input.open, input.isNew, input.justFinished, input.approval, input.observedBefore !== false)) {
    return { key: '', flag: 'none', diag: 'nosig', tip: '静默会话无色' };
  }

  // 执行中（蓝）：重试中的 transient 也落这里（open 优先于收尾 kind）。
  if (input.open) {
    return { key: '', flag: 'blue', blueSrc: 'running', diag: null, tip: '执行中' };
  }

  // 收尾 completed 且已闭合：非新非刚收尾即平静，不染蓝。
  if (isDoneKind) {
    return { key: '', flag: 'none', diag: null, tip: '已完成' };
  }

  // 未知 kind 默认：仅 isNew 时产 red（已终止的异常等你处理），否则无色。
  if (isUnknown) {
    if (input.isNew) {
      return { key: '', flag: 'red', redReason: 'unknown-default', diag: null, tip: '未知收尾需确认' };
    }
    return { key: '', flag: 'none', diag: 'nosig0', tip: '未知收尾暂无色' };
  }

  // 等待用户查看（黄）：水位未看。
  if (input.isNew) {
    return { key: '', flag: 'yellow', yellowSrc: 'water-level', diag: null, tip: '待看' };
  }

  return { key: '', flag: 'none', diag: 'nosig0', tip: '暂无信号无色' };
}
