# 显示规范 · 分隔靠结构不靠符号

> 状态：owner 2026-10-17 拍板（#139）；实现件 `src/client/components/home-meta.ts`；门禁 `tools/verify/separator-retired.ts`。
> 本文是这条纪律的**落点**（此前只写在代码注释里，见 `home-meta.ts` 头注释与 `home-row-tip.ts` 的批注），
> 与仓内既有批注同口径：**面板里一个中点都不许有**。

## 为什么退役的不是一个符号

`·` 的语法职责只有一种——**罗列同级同类项**。但在面板里它同时兼了四种非并列关系：

| 实际关系 | 曾经的写法 |
| --- | --- |
| 修饰 / 从属 | `助理 · dsh-log` |
| 计数 + 注解 | `9 个 · 每个家对应一个工作区` |
| 属性键值 | `飞书 · 在线` |
| 流程步骤 | `接入 · 扫码` |

留白还两套并存（`' · '` 与紧贴 `'·'`），而取值本身也可能含 `·` ⇒ 同一个字形每次都要重新猜。
**退役的是「用符号兼多义」这种做法，不是这一个字符。**

## 五条形式（关系 → 形式）

| 关系 | 形式 |
| --- | --- |
| 父 / 子、主 / 次 | 换行 + 字重 / 色阶 |
| 注解、补充 | 括号（同一行内）／换行小字（跨行） |
| 属性键值 | 图标或点 + 词，两个独立节点 + flex gap |
| 步骤、流程 | 合成词；**真**跨步骤才用 `→` |
| 同级并列 | 间距（gap ≥ 6px），节点分开 |

- **可见 DOM 零 `·`**（U+00B7）；不可见文案（`title` / `aria-label`）改用 `，` / `, `。
- 面包屑（owner 选 b）：`助理 · dsh-log` → 层级名次级色 + 对象名主色 + **6px 间距**，零符号、信息不丢。

## 实现件：元信息行原语

`src/client/components/home-meta.ts` 提供 `metaRow` / `metaText` / `asstSubMeta`：

- 元信息行 = **节点数组 + gap + 主次色阶**（`strong` / `weak` / `note` / `icon`）；
- 「分隔靠结构」由此成为**唯一实现**——三十处手改必然再长出 `·`，原语把这条纪律变成默认路径；
- 绿框命名空间内新文件，不碰共享层签名（契约 §4 Added-only）。

## 覆盖（绿框 16 处已归零）

- 页头副标 `src/client/components/home-stage.ts`
- 行副标 `src/client/components/home-rows.ts`
- 面包屑 `src/client/components/home-frame.ts`（`crumbLabel` 出两个 span：`hu-cr2lv` / `hu-cr2nm`）
- 详情 `src/client/components/home-detail.ts`
- 选项副标 `src/client/components/home-forms.ts` / `src/client/components/home-bind-forms.ts`

## 门禁

`node --test tools/verify/separator-retired.ts`（已进 `package.json` 的 `verify` 链）：

- 剥掉注释后，`src/` 全域零 U+00B7；豁免只有 `src/host/config-yaml.ts` 的注释头（YAML 注释是要给人读的，不在面板渲染路径上）；
- 另有 `tools/verify/features/home-steel.ts` 的逐层断言（元信息原语渲染出的节点里零分隔符）。

> 新增可见文案请走原语；确实需要「并列」时用 gap，不要补一个符号回来。
