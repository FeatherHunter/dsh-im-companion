# Features 契约（F0 决议 · v2）

> 权威依据：Wayfinder 地图 [FeatherHunter/dsh-im-companion#1](https://github.com/FeatherHunter/dsh-im-companion/issues/1) · F0 票决议（#3）。
> 第一性原理：**模块间无隐式共享**——共享只走契约；**复杂度 O(N)**——功能可独立增删/验证/替换；**触碰面无交集**——并行 session 开发的前提；**开发产物同样解耦**（用户 2026-09-02 裁定）——验证/原型/模拟数据按功能命名空间，杜绝"共享文件追加再追加"。

## 1. 目录形态（功能即模块）

```
src/
  client/            # 共享层（A1 起点，只增导出/追加，禁改既有行为）
    theme.ts dom.ts icons.ts config.ts fleet-api.ts meta.ts model.ts
    ui/              # 原语（button/field/segmented/menu/avatar/list/empty/toast/modal）
    data/
      connection-stream.ts   # NEW：单份 15s 轮询 + 多消费者订阅（B1 首建，A1 迁入）
      bindings.ts            # NEW：workspaceId↔BotSnap 绑定 + 健康聚合（B1 首建）
  features/
    <feature-id>/    # 每个功能一张票、自包含目录
      manifest.ts    # export const feature: FeatureManifest（唯一对外入口）
      view.ts data.ts styles.ts   # 按需拆分，每文件 ≤300 行
  host/
    rpc.ts           # 端点追加（只允许新增 case，禁止改既有行为）
```

## 2. FeatureManifest 协议

```ts
export interface FeatureManifest {
  id: string                     // kebab-case，如 'left-badges'
  name: string                   // 展示名
  order: number                  // 挂载顺序
  slots: { target: SlotTarget; mount(ctx: FeatureCtx): () => void }[]
  installStyles?(): () => void   // installFeatureStyles(id, css) 封装
}
```

- `FeatureCtx`（特性上下文，唯一入口）：{ rpc: RpcCall; subscribe(fn): () => void; meta: MetaStore; slots: SlotsService; get(name): unknown }
- 注册：client/index.ts 只做「导入 FEATURES 列表 → 循环 register」；新增功能 = 加一行 import + 一行数组项。
- 卸载即净：mount 返回 dispose；容器卸载时统一回收（同现有 ctx.effect 纪律）。

## 3. 共享层边界（触碰面规则）

| 文件 | 允许操作 |
|---|---|
| theme.ts / dom.ts / icons.ts / config.ts / fleet-api.ts / meta.ts | **只加导出**（新增函数/CSS 类/图标），禁止改既有签名与行为 |
| ui/* | 只加新原语文件；改既有原语需 F0 评审（单 PR） |
| data/connection-stream.ts / bindings.ts | B1 首建；其余功能只读其导出 |
| host/rpc.ts | 只追加 case；端点命名 `im-companion.<feature>.<action>` |
| client/index.ts | 只改 FEATURES 列表（每功能一行） |
| A1 私有（components/panel.ts、connect-flow.ts、row-actions.ts 等） | 禁止被 feature 直接引用；触碰走单 PR（C1a/E2 入口按 R5 建议由 B3 胶囊承载或单 PR 改） |

**先合并点（并行开工前单 PR 先行入库）**：① connection-stream.ts ② bindings.ts ③ theme.ts 增 installFeatureStyles(id, css) ④ icons 追加 ⑤ rpc.ts 骨架 case。

## 4. 数据流（单写多读）

- **单份轮询**：connection-stream 是唯一轮询源（15s + 手动刷新广播），feature 经 `subscribe(fn)` 读快照；不新开第二份轮询。
- **host 元数据**：RpcMetaStore 单实例（host meta.json 权威），feature 只经 FeatureCtx.meta。
- **写路径**：一律 dsh-im 渠道 RPC 或 host 桥端点；写后立刷（触发 stream.refresh()）。

## 5. 红线口径（300 行/文件）

- 计数：src/**/*.ts 全部行（含注释）。
- 豁免（仅这些目录）：lib/**（构建产物）、tools/**、.scratch/**、docs/**、features 内 json/md 资源。
- 机械执行：T0 票实现 `npm run guard`（扫描 → 超限清单 + exit 1）；CI/预提交可选。

## 6. 验证与验收

- 每功能自验证：`tools/verify/features/<id>.ts` 或分区断言；共享层改动跑既有 17 项 + 功能断言。
- 真机验收：功能票按地图 Notes 逐卡验收（重启 → 截图 → 用户确认）。

## 7. 并发布局（R5 输入，F0 确认）

A 线：B1（bindings/overlay 奠基）→ B2 ∥ E1；B 线：B3 ∥ C1b ∥ E4 ∥ E2；C 线：D1 ∥ E3；D 线：C1a（承接 E3 UI seat）。
四线文件域正交；每线开工前先合入 §3 先合并点。

## 8. 开发产物解耦（新增 · 用户裁定）

- 每功能自验证：`tools/verify/features/<id>.ts`（或现有验证器按功能分区）；共享验证器（render-client 等）只允许新增注册点/分区，禁止改他人分区。
- 原型资产：`prototypes/<id>/`（禁止根目录散放 prototype-*.html，既有 B1/B3 原型迁入）。
- 预览 harness：mock 数据按功能模块注册（`src/dev/features/<id>-mock.ts`），preview-host 只做装配。
- 守卫脚本：按功能归属（guard/boundaries 为契约层工具，功能自检脚本放 `<feature>/tools/`）。
- 依赖检查：feature 开发产物之间同样禁止 import 耦合。

## 9. 合并协议（并发正确性）

- 先合并点单 PR 先行入库（connection-stream / bindings / installFeatureStyles / icons 追加 / rpc case 骨架）。
- 追加共享文件前 `git pull`（以最新为基线再追加）。
- merge 冲突一律以"双方追加都保留"为准重做；删改他人追加 = 违约。
- 契约变更先行：改共享协议前先更新本契约并在地图 Decisions 记录，再改码。
