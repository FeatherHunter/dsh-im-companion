/** TEMP 设计演示唯一出口（定稿即删）：workspace-rail 竖条+角标 mock，不进生产。 */
import { installFeatureStyles } from '../../client/theme';
import type { FeatureManifest } from '../protocol';
import { mountDesignPreview } from './demo';
import { CSS } from './styles';

export const feature: FeatureManifest = {
  id: 'design-preview',
  name: '设计演示（临时定稿即删）',
  order: 99,
  slots: [{ target: 'workspace-rail', mount: function (ctx) { return mountDesignPreview(ctx); } }],
  installStyles: function () { return installFeatureStyles('design-preview', CSS); },
};
