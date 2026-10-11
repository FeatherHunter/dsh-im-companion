## 已改（待目视验收）

**改动面（2 文件）**
- `src/client/components/panel.ts`：`#imc-update-center` 容器改建在页头右上组里，`af-hd-right` 顺序改为 `verBox → updateCenterHost → starLink → feedbackLink`；`root` 序列删掉原位置（回归 `hd → toolbar → compose → body → promo`）。249 → 251 行（红线 300）。id / 类名 / `emitUpdateCenterHost` 派发一律未动（契约 §4 事件制 + R8 P0-b 认领把手不变，A1 对特性仍零感知）。
- `tools/verify/features/update-center.ts`：补 T5-7 位置断言（右上组含挂载点、且在 starLink 左侧、容器先建后挂、root 里不再出现、id/类名/派发三项未变）。

## 证据

- `npm run check` 全绿（exit 0，guard 105 文件 / max 300 行 PASS）。
- **真 DOM 顺序取证**（`.local/diag/verify-header-order.mjs`：vm 载入 `lib/client.js` + dom-shim 真渲染设置面板）：
  `1.af-verbox → 2.#imc-update-center → 3.a.af-star(star) → 4.a.af-star(feedback)`，判定「挂载点在 star 左侧 = true」「root 里不再有旧位置 = true」。
- 实装已同步：`~/.dsh/profiles/desktop/node_modules/dsh-im-companion/lib` 与本仓 hash 一致（client.js `5636AA39…` / index.js `E5581EC8…`）。

## 目视注意（宽度）

按钮文案随状态变：`检查更新` / `有新版 0.2.6` / `已是最新 0.2.6` / `正在查新版…` / `更新失败，点此查看`。页头右组是 `flex:none`，最长的「更新失败，点此查看」在 548px 内容宽下可能偏挤；若嫌宽，一行开关即可收窄（`upToDateDisplay:'tooltip'` ⇒ 常态恒显「检查更新」，或 `label` 覆写短文案）。
