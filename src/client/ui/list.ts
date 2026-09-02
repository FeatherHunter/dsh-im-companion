/** 分组圆角列表容器 + 骨架屏行。 */
import { h, type ChildNode } from '../dom'
import { icon } from '../icons'

export function makeGroupedList(...children: ChildNode[]): HTMLDivElement {
  return h('div', { className: 'af-list' }, ...children)
}

export function makeRow(...children: ChildNode[]): HTMLDivElement {
  return h('div', { className: 'af-row' }, ...children)
}

export function makeSkeletonRows(count = 3): HTMLDivElement[] {
  const rows: HTMLDivElement[] = []
  for (let i = 0; i < count; i++) {
    rows.push(h('div', { className: 'af-skel' },
      h('div', { className: 'c' }),
      h('div', { className: 'lines' },
        h('div', { className: 'b', style: { width: '42%' } }),
        h('div', { className: 'b short' }),
      ),
    ))
  }
  return rows
}

export function makeLoadingRow(text = '正在加载…'): HTMLDivElement {
  return h('div', { className: 'af-loading-row' }, h('span', { className: 'af-spin' }), text)
}

export function makeErrorRow(message: string, onRetry?: () => void): HTMLDivElement {
  const retry = h('button', {
    className: 'af-btn ghost sm retry',
    type: 'button',
    onClick: onRetry,
  }, icon('refresh', 14), '重试')
  return h('div', { className: 'af-error' }, h('span', null, message), onRetry ? retry : null)
}
