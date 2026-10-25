/** i18n 对外出口：只 re-export 纯逻辑 core（不含 install）。
 * 这样 feature 与 first-view-copy 只依赖纯查词层，verify 转译不会拖进 virtual:imc-locales；
 * 构建期注入与 DSH 语言服务订阅在 install.ts，只由 client 入口装配。 */
export * from './core'
