/** 构建期注入的多语言词条（tsdown 的 imc-locales 虚拟模块）：
 * ns → 语言 → 平键 → 文本；来源＝src 下所有 locales.yaml（scripts/i18n-locales.mjs 汇总校验）。 */
declare module 'virtual:imc-locales' {
  const dicts: Record<string, Record<string, Record<string, string>>>
  export default dicts
}
