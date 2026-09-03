/** 特性注册表：新增功能 = 加一行 import + 一行数组项（client/index 只读此列表）。 */
import { feature as c1aDrawer } from './c1a/manifest'
import { feature as leftBadges } from './left-badges/manifest'
import type { FeatureManifest } from './protocol'

export const FEATURES: FeatureManifest[] = [c1aDrawer, leftBadges].sort((a, b) => a.order - b.order)

export type { FeatureCtx, FeatureManifest, FeatureSlot, SlotTarget, SlotsService } from './protocol'
