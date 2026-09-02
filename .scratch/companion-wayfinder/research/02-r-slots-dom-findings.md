# R2 — DSH Slots 与全页面 DOM 叠加安全点 研究

> Ticket: 02-r-slots-dom.md (wayfinder:research)
> Map: .scratch/companion-wayfinder/map.md
> Date: 2026-09-03
> Sources: D:\dsh-plugin\dsh-im-companion package.json dsh.client.inject + lib/client.js slots.inject + D:\dsh-plugin\dsh-im plugin-src/client 单测 + dsh-client-ui-slots 源码推断 + 真机 better-sidebar 共存验证

## 摘要回答

| 问题 | 结论 |
|---|---|
| IM机器人辅助挂载 | `slots.inject('settings.section', order 22)` 安全，已在 lib/client.js 16210B 预览中验证，desktop/web 双 profile 均通过 `bundles`+Junction 挂载 |
| 左侧工作区列表 | 无官方 Slot，需 `MutationObserver` 叠加：监听 `[data-workspace-list]` 或左侧容器，注入徽标/呼吸灯（已用 B1 “注入真实徽标” 按钮活体验证） |
| 对话区顶部 Header | 无 Slot，在 `<dsh_im_source>` 容器上方插入 80px 横幅最稳定（handoff §4 全页面拓展同技术） |
| better-sidebar 共存 | MutationObserver 叠加与 better-sidebar 的 DOM 改写不冲突，但需防同频写入：建议 `requestAnimationFrame + 单次 observer` |
| 稳定性 | desktop 需完全退出重开+Ctrl+F5；web 热重载可 `dev_reload_package`；15s 轮询更新徽标不触发 DSH 自身重绘 |

一句话决策: IM机器人辅助用 `settings.section`，左侧/顶部用 `MutationObserver` 全页面叠加，此为 handoff §4 已验证的“正道 3/3”之一，可稳定支撑 B1/B3/E4。

## 最小验证清单

```js
// 左侧徽标注入探针（client.js）
const mo = new MutationObserver(() => {
  document.querySelectorAll('[data-workspace-id]').forEach(el => {
    if(el.querySelector('.companion-badge')) return;
    el.appendChild(makeBadge(healthFor(el.dataset.workspaceId)));
  });
});
mo.observe(document.body, {childList:true, subtree:true});
```

## 阻塞解除

- P1(B1+B2) / P5(B3/E4) 的挂载点已明确，可进入原型。