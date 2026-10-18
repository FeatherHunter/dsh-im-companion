/** 绿框自有图标集（T6a）：路径逐字取自 T4 认可款原型 proto-studio.html 的 symbol 定义。
 * 不引共享 icons.ts（那里是 A1 图标名闭集，加名要动既有联合类型）——本模块自带 16x16 视图盒。
 * 颜色一律 currentColor，尺寸由调用方给（默认 15）。 */
export type HuIconName =
  | 'home' | 'person' | 'bot' | 'plus' | 'chev' | 'back' | 'more' | 'close'
  | 'pencil' | 'image' | 'camera' | 'reset' | 'move' | 'link' | 'unlink' | 'refresh'
  | 'trash' | 'check' | 'alert' | 'info' | 'search' | 'data' | 'flask'

const HU_PATHS: Record<HuIconName, string> = {
  home: '<path d="M2 7.6l6-4.8 6 4.8V14H9.6v-4H6.4v4H2V7.6z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  person: '<circle cx="8" cy="5.2" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2.8 13.6c.7-2.5 2.8-3.8 5.2-3.8s4.5 1.3 5.2 3.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  bot: '<rect x="3" y="5.2" width="10" height="7" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="6.3" cy="8.6" r="1" fill="currentColor"/><circle cx="9.7" cy="8.6" r="1" fill="currentColor"/><path d="M8 5.2V2.8M5.8 2.8h4.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  plus: '<path d="M8 3.4v9.2M3.4 8h9.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  chev: '<path d="M6.2 3.6L10.6 8l-4.4 4.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  back: '<path d="M9.8 3.6L5.4 8l4.4 4.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  more: '<circle cx="3.6" cy="8" r="1.35" fill="currentColor"/><circle cx="8" cy="8" r="1.35" fill="currentColor"/><circle cx="12.4" cy="8" r="1.35" fill="currentColor"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  pencil: '<path d="M11.2 2.4l2.4 2.4L6.2 12.2 3 13l.8-3.2 7.4-7.4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  image: '<rect x="2.5" y="3" width="11" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="6.6" r="1.2" fill="currentColor"/><path d="M3.4 11.6L6.8 8.6l2.2 2 1.6-1.4 1.9 1.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  camera: '<rect x="2" y="5.2" width="12" height="8" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="9.2" r="2.5" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="9.2" r="1" fill="currentColor"/><path d="M5.6 5.2L6.4 3.6h3.2l.8 1.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="11.9" cy="7.2" r=".8" fill="currentColor"/>',
  reset: '<path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7M13.2 1.8v3h-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  move: '<path d="M8 2.2v11.6M2.2 8h11.6M5.2 5L2.6 8l2.6 3M10.8 5l2.6 3-2.6 3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  link: '<path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.9.9M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.5 8.8a2.6 2.6 0 0 0 3.7 3.7l.9-.9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  unlink: '<path d="M6.8 9.2l2.4-2.4M5.4 4.4l.8-.8a2.6 2.6 0 0 1 3.7 3.7l-.5.5M10.6 11.6l-.8.8a2.6 2.6 0 0 1-3.7-3.7l.5-.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 3l10 10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".5"/>',
  refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  trash: '<path d="M3.4 4.6h9.2M6.6 4.6V3.2h2.8v1.4M4.8 4.6l.6 8.2h5.2l.6-8.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  check: '<path d="M3.4 8.4l3 3 6.2-6.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  alert: '<path d="M8 2.6l5.6 10H2.4l5.6-10z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6.6v3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.4" r=".9" fill="currentColor"/>',
  info: '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7.4v3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="5.3" r=".85" fill="currentColor"/>',
  search: '<circle cx="7.2" cy="7.2" r="4.4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.6 10.6L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  data: '<ellipse cx="8" cy="4" rx="5" ry="2.1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 4v8c0 1.2 2.2 2.1 5 2.1s5-.9 5-2.1V4M3 8c0 1.2 2.2 2.1 5 2.1s5-.9 5-2.1" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  flask: '<path d="M6 1.6h4v2.1l2.9 6.9c.5 1.2-.4 2.6-1.7 2.6H4.8c-1.3 0-2.2-1.4-1.7-2.6L6 3.7V1.6z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.6 9.2h4.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
}

export const HU_ICON_PATHS = HU_PATHS

/** 造一枚 16x16 视图盒图标（currentColor）。浏览器里 innerHTML 生效；DOM 桩里只留盒子。 */
export function huIcon(name: HuIconName, size = 15, cls = 'hu-i'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('class', cls)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('data-hu-icon', name)
  svg.innerHTML = HU_PATHS[name]
  return svg
}
