/** 组行状态竖条唯一出口（#45/#57 固化方向，原 TEMP 演示转正：在场状态唯一视觉口径）。 */
import { installFeatureStyles } from '../../client/theme';
import type { FeatureManifest } from '../protocol';
import { mountDesignPreview } from './demo';
import { CSS } from './styles';

export const feature: FeatureManifest = {
  id: 'design-preview',
  name: '组行状态竖条',
  order: 99,
  slots: [{ target: 'workspace-rail', mount: function (ctx) { return mountDesignPreview(ctx); } }],
  installStyles: function () { return installFeatureStyles('design-preview', CSS); },
};
