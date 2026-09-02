/** 分段控件（iOS 风格滑块），标签可实时更新计数。 */
import { h } from '../dom'

export interface SegItem {
  id: string
  label: string
}

export interface SegHandle {
  el: HTMLElement
  setValue(id: string): void
  setLabel(id: string, label: string): void
  relayout(): void
}

function schedule(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn)
  else setTimeout(fn, 0)
}

export function makeSegmented(items: SegItem[], initial: string, onChange: (id: string) => void): SegHandle {
  const thumb = h('div', { className: 'af-seg-thumb' })
  const buttons: HTMLButtonElement[] = items.map((it) =>
    h('button', {
      className: 'af-seg-item',
      type: 'button',
      dataset: { id: it.id },
      onClick: () => {
        layout(it.id)
        onChange(it.id)
      },
    }, it.label),
  )
  const el = h('div', { className: 'af-seg', role: 'tablist' }, thumb, ...buttons)
  let active = initial

  function layout(id: string): void {
    active = id
    const target = buttons.find((b) => b.dataset.id === id)
    if (!target) return
    thumb.style.left = target.offsetLeft + 'px'
    thumb.style.width = target.offsetWidth + 'px'
    for (const b of buttons) b.classList.toggle('active', b.dataset.id === id)
  }

  const relayout = () => schedule(() => layout(active))

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(relayout)
    ro.observe(el)
  }

  return {
    el,
    setValue: (id) => layout(id),
    setLabel: (id, label) => {
      const btn = buttons.find((b) => b.dataset.id === id)
      if (!btn) return
      btn.textContent = label
      relayout()
    },
    relayout,
  }
}
