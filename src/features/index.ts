/** 特性注册表：新增功能 = 加一行 import + 一行数组项（client/index 只读此列表）。 */
import { feature as detailDrawer } from './detail-drawer/manifest'
import { feature as leftBadges } from './left-badges/manifest'
import { feature as leftFilter } from './left-filter/manifest'
import { feature as adopt } from './adopt/manifest'
import { feature as presence } from './presence/manifest'
import { feature as welcomeBanner } from './welcome-banner/manifest'
import { feature as fleetRadar } from './fleet-radar/manifest'
import { feature as sessionHeader } from './session-header/manifest'
import type { FeatureManifest } from './protocol'

export const FEATURES: FeatureManifest[] = [detailDrawer, leftBadges, leftFilter, adopt, presence, welcomeBanner, fleetRadar, sessionHeader].sort((a, b) => a.order - b.order)

export type { FeatureCtx, FeatureManifest, FeatureSlot, SlotTarget, SlotsService } from './protocol'
