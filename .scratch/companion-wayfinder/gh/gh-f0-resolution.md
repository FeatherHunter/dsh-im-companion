## Resolution（F0 决议 2026-09-02 · 用户授权：第一性原理 + 架构师标准，符合即同意）

**契约文档**：`docs/features-contract.md`（权威实现依据，本票为裁判记录）。

1. **目录形态**：`src/features/<id>/manifest.ts`（FeatureManifest 协议：id/name/order/slots[]/installStyles）自包含；client/index.ts 只维护 FEATURES 列表（一功能一行）。
2. **共享层边界**：src/client/{theme,dom,icons,config,fleet-api,meta} + ui/* 只加导出/新文件，禁改既有签名行为；A1 私有组件禁被 feature 直接引用（触碰走单 PR）。
3. **数据流**：单份 15s 轮询（`data/connection-stream.ts` 订阅者模式，B1 首建）+ 每功能自取禁开新轮询；host meta 单实例。
4. **host 端点**：`im-companion.<feature>.<action>` 前缀隔离（D1=declarations.*、E3=routing.preview）；rpc.ts 只追加 case；既有 meta.* / fs.* 视为 core 域保留。
5. **红线**：≤300 行/源文件（含注释）；豁免 lib/tools/.scratch/docs；T0 实现 npm run guard 机械执行。
6. **并发布局**：确认 R5 四线（A=B1→B2∥E1；B=B3∥C1b∥E4∥E2；C=D1∥E3；D=C1a）；先合并点清单（connection-stream / bindings / installFeatureStyles / icons 追加 / rpc case 骨架）单 PR 先行入库。

第一性原理：模块间无隐式共享（契约唯一）；复杂度 O(N)（独立增删/验证/替换）；触碰面无交集（并行前提）。
