# Wayfinder Map — 本地镜像（存档）

> 权威追踪器：GitHub [FeatherHunter/dsh-im-companion#1](https://github.com/FeatherHunter/dsh-im-companion/issues/1)（wayfinder:map）。

## 地图状态（2026-09-02 · F0 已决议，地图完成）

| # | 票 | 状态 |
|---|----|------|
| 4 · R5 研究 | ✅ 关闭（→ research/05） |
| 3 · F0 解耦契约 | ✅ 关闭（→ docs/features-contract.md） |
| 5 · A1 红线收编（AFK） | **frontier** | 16 · T0 红线守卫（AFK） | **frontier** |
| 6 · B1 | **frontier** | 8 · B3 / 9 · C1a / 10 · C1b / 11 · D1 / 15 · E4 | **frontier** |
| 7 · B2 / 12 · E1 | blocked by B1 | 13 · E2 | blocked by D1 | 14 · E3 | blocked by C1a |

**并发布局**（R5 + F0 确认）：A 线 B1→(B2∥E1)；B 线 B3∥C1b∥E4∥E2；C 线 D1∥E3；D 线 C1a。
**先合并点**：connection-stream.ts / bindings.ts / installFeatureStyles / icons 追加 / rpc case 骨架。
