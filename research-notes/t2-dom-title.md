# T2 · 左栏 DOM 与标题抢占深查（research, #74）

- 上游锚点：`v4.17.1` = `464c0a9`（`dsh-im-main` 内 `git show v4.17.1:<path>` 只读取证，未 checkout，工作树未动）。
- T0（#72）取证时仍 OPEN：`dsh-im-main` HEAD = `bda4be6`（4.13.0 系），`v4.17.1` tag 仅作只读取证源。
- 本仓基线：`master` = `1d41e4c`；本分支 `research/t2-dom-title` 唯一新增本文件。
- 引入提交：`986fc62`（全 `986fc621cb13cdcb6dfc53e6313813747730acb2`，2026-09-08，`feat(sessions): show IM channel logos while preserving title generation`），同时新建 logos / title-prefix / labels 三文件；`986fc62..v4.17.1` 三文件 **零 diff**（取证时 `git diff --stat` 为空）。
- 行数勘误（实测，ticket 正文 241/122 为旧数）：`plugin-src/client/session-channel-logos.js` = 233 行，`plugin-src/host/session-title-prefix.mjs` = 114 行（引入提交与 `v4.17.1` 下一致）。

## 1. 行选择器命中率：无上游证据显示失效

- 外挂选择器：`src/features/left-badges/view.ts:13` `ROW_SELECTORS = ['div[role="treeitem"][aria-expanded]']`；CSS 同系四规则 `src/features/left-badges/styles.ts:4-5`（`::after` 基线 + online）与 `:12-13`（warn/offline），均要求 `[data-lb-kind]` 属性存在。
- 上游不渲染左栏工作区分组行（DSH 本体 `dsh-client-ui-workspace` 渲染，见 `view.ts:10-12` 注释）；`v4.17.1` 下 `plugin-src/` 全 grep `treeitem` 仅命中 `session-channel-logos.js:22` 一处左栏相关，其余为自家设置页 aria（`collapsible-account.js:65`、`context-enhancement.js:348` 等，与左栏无关）。
- 反向证据（行体系仍在）：`986fc62` 定义 `const ROW = '[role="treeitem"][aria-selected]'`（`session-channel-logos.js:22`），证明 DSH 本体左栏行系 `role=treeitem`；会话行形态为 `DIV.sessionRow > SPAN.title`（`session-channel-logos.js:34-35`）或 `BUTTON.searchResultRow`（`session-channel-logos.js:36-38`）。分组行（`aria-expanded`）与会话行（`aria-selected`）是同一 treeitem 体系下的两种行，外挂与上游各取一种，天然互斥。
- 结论：上游代码层面**没有任何证据**显示分组行发生 `div→button` 或 `aria-expanded` 移除；选择器在 4.17.1 下命中率应不变。`collectRows() == 0` 即双失效（JS 零装饰 + CSS 失配）判据成立（`view.ts:33-54` 采集，`view.ts:88-128` paint Legion：零行则 `decorated=0` 且 `data-lb-kind` 从未写上，`styles.ts:4` 的 `::after` 永不触发）。
- 取证边界：DSH 本体源码不在取证范围，分组行真机 `outerHTML` 仍需 T3/验收时复核（若本体 4.17 改了分组行标签/属性，本票结论需修正）。

## 2. DOM/CSS 冲突位：直接冲突位 = 无，observer 共存单向收敛

| # | 资源 | 上游（会话题 SPAN） | 外挂（分组行 DIV） | 是否冲突 |
|---|------|-------------------|-------------------|---------|
| 1 | 装饰对象 | 会话行内 `SPAN.title`（`session-channel-logos.js:34-38`） | 分组行本体（`view.ts:93-111`） | 无（SPAN 永不是 treeitem） |
| 2 | 写属性 | `data-dsh-im-session-channel` + `data-dsh-im-session-text`（`session-channel-logos.js:138-139`），restore 只动自家两属性（`:113-121`） | `data-lb-kind` / `data-lb-label` / `title`（`view.ts:102-111`） | 无（属性名零重叠） |
| 3 | 伪元素 | 题 `::before` 16px logo（`:85-96`）+ 题 `::after` 显示 `attr(data-dsh-im-session-text)`（`:97-108`，`inset-inline-start:22px`） | 行 `::after` 显示 `attr(data-lb-label)`（`styles.ts:4-5/12-13`） | 无（不同元素上的伪元素） |
| 4 | Observer | `document.body` subtree，`childList+characterData+attributes[class/role/aria-selected/contenteditable]`（`session-channel-logos.js:189-192`），microtask 合批（`:141-157 queueMicrotask`） | `document.body` subtree `childList`（`view.ts:233-235`），rAF 合批（`view.ts:132-152`） | 共存，单向收敛（见下） |
| 5 | 图片门 | SVG ready 前不隐藏原文（`:194-205`，`ready` 集 + `Image.onload`） | 无（纯属性+CSS，无资源门） | 无 |

- 收敛方向：外挂 `setAttribute(data-lb-*)` 不在上游 `attributeFilter` 内 → 不触发上游重算；上游写自家属性会触发外挂 observer → 外挂 `schedulePaint` 重 paint（`view.ts:88-128` 幂等）→ paint 只写 `data-lb-*`，又不在上游 filter 内 → **单向一次收敛，无抖动环路**。
- 上游隐藏原文手段是 `-webkit-text-fill-color: transparent` + `::after` 覆盖（`:79-84` 基线规则），且明确保留 React 原文节点（`:136-137` 注释），故 DOM `textContent` 永远带前缀（见 §3）。

## 3. 标题改写对 `resolveWorkspace`：直接影响 = 无，失配链路真实但触发条件不在前缀

- 改写形态：`withSessionChannelPrefix(title, channel)`（`session-title-prefix.mjs:31-38`），中文取 `labels[0]`，格式 `` `${label} · ${title}` ``（`:37`），已带前缀则幂等返回（`:36`）；经 microtask 追加新 `session/title` 事件（`:77-79`，`structuredClone` 原事件），不改 provider/prompt（`:51-55` 注释）；触发面为 `session/title` 事件、匹配 `IM_RPC_ID` 的 `user/message`（`:99-101`）及 `session/created`（`:105`）。
- 改写前后对照（示例，channel=feishu）：改写前行文本 `我的工作区需求讨论` → 改写后 `飞书 · 我的工作区需求讨论`。前缀表 10 通道见 `session-channel-labels.mjs:2-11`（微信/飞书/钉钉/企业微信/QQ/Slack/Telegram/Discord/WhatsApp/AI Office，中英各一）；解析器只认行首精确前缀（`:15-25`）。
- `resolveWorkspace`（`view.ts:71-79`：workspace 全等 / basename / botName，大小写不敏感）匹配的是**分组行**文本，而改写对象是**会话行**标题，两行选择器互斥（`aria-expanded` vs `aria-selected`，`view.ts:13` vs `session-channel-logos.js:22`）→ **前缀不写组行，直接影响无**。
- 失配→unbound→清属性链路复核（链路真实）：`rowKey` miss（`view.ts:95-97`）→ `ws=key` → `badgeForWorkspace` 无 `bound`（`src/client/data/bindings.ts:50-59`）→ `kind='unbound'` → `removeAttribute` 三件套（`view.ts:102-106`）。但该链路的触发条件是**组行文本本身被污染**，前缀不写组行故不触发。
- 唯一间接风险（待真机裁决，转 T3 输入）：若 DSH 本体把会话行嵌套在分组行 DOM 内，则组行 `textContent`（`view.ts:56-63 rowKey` 读法）= 组名 + 后代会话标题（含前缀）concat → 全 miss → 整组 unbound。该假设在 4.13 下同样成立（会话标题一直存在，前缀只让 concat 更长），故前缀不是新变量；需真机组行 `outerHTML` 一锤定音（组行 `textContent` 是否纯净）。

## 4. wecomApp 与 CHANNEL_ORDER：徽标链路不受影响，缺口在别处

- 上游新增 `wecom-app` 频道 `ce6b656`（2026-09-07），host channel id `'wecom-app'`（`plugin-src/host/channels/wecom-app/index.mjs:13`，`v4.17.1` 下）；`plugin-src/client/channels/` 下 11 目录（含 `wecom-app`、`office`）。
- 但 `SESSION_CHANNEL_LABELS` 仍 10 项、无 `wecom-app`（`session-channel-labels.mjs:1-12`，`v4.17.1` 下）；`GLYPHS` 同样 10 项、无 `wecom-app`（`session-channel-logos.js:6-17`）。后果：`channelOf` 对 wecom-app 会话恒返 `null`（`IM_RPC_ID`/`LEGACY_SESSION_ID` 正则键源自 LABELS keys，`session-title-prefix.mjs:6-7`）→ 无前缀；logo 侧 `parseSessionChannelTitle` 永返 null → `restore`（`session-channel-logos.js:128-131`）→ 无 logo、原文保留。**wecom-app 会话在左栏无渠道 logo、无前缀——上游侧覆盖缺口**（报 upstream issue 性质，非本 map scope，本 map 只适配）。
- 本仓 `CHANNEL_ORDER` 9 项、无 `office`/`wecom-app`（`src/client/data/config.ts:3-5`）。后果限定：左栏徽标只按 workspace 过滤聚合（`bindings.ts:48-61`），不按 `CHANNEL_ORDER` 过滤 → wecom-app bot 的在线状态仍计入徽标（以 `fleet-api` 拉到该 bot 为前提）；9 序只约束 Fleet 矩阵列 / connect-flow 菜单（`src/client/data/fleet-api.ts:169-185`、`src/client/components/connect-flow.ts:45`、`src/features/fleet-radar/data.ts:151-160`）。**左栏徽标不受 9 序缺口影响**；Fleet 缺列是已知缺口，转 T5/新票，不 blocking T3 verdict。

## 5. 时序契约复核：三条均成立，上游未触及

- 首快照门：`hasSnap = snap.updatedAt > 0`，门前 `repaint` 直接 return（`view.ts:162-176`）。
- 15s 唯一轮询：`CONNECTION_POLL_MS = 15000`（`src/client/data/connection-stream.ts:6`），启动即 `void poll()`（`:74`），失败保留旧快照（`:55-68`）。
- subscribe 首拍：订阅即同步回放当前快照（`connection-stream.ts:77-83`），首次多为 `updatedAt=0` 空拍 → 被首快照门挡住，首轮网络 poll 后 `emit` 才开画。hover-card 同源复用同选择器（`view.ts:200-216`）。
- 上游侧 `ready` 图片门（`session-channel-logos.js:196-205`）与此外挂无耦合。结论：时序契约三条代码层面均成立，无上游变更触及。

## T3 输入（待真机/裁决）

1. 分组行真机 `outerHTML`：标签/`aria-expanded` 是否在、`textContent` 是否纯净（§1 §3 的共同前提）。
2. 若组行文本纯净 → 左栏 DOM/标题抢占嫌疑可排除，verdict 应倒向 T1（`503a24a` 管理 RPC 改道）。
3. 上游 wecom-app 无 logo/无前缀缺口：只报不跟（upstream 性质）。
