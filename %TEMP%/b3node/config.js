/** 渠道与健康状态等纯配置（无副作用）。 */
export const CHANNEL_ORDER = [
    'feishu', 'weixin', 'qq', 'slack', 'telegram', 'discord', 'whatsapp', 'dingtalk', 'wecom',
];
export const CHANNEL_LABELS = {
    feishu: '飞书', weixin: '微信', qq: 'QQ', slack: 'Slack',
    telegram: 'Telegram', discord: 'Discord', whatsapp: 'WhatsApp',
    dingtalk: '钉钉', wecom: '企业微信',
};
export const HEALTH_LABELS = {
    online: '在线', warn: '待确认', offline: '离线',
};
export function healthOf(status, connected, failed) {
    /* B1 verdict：轮询失败 = 未知 → 待确认，绝不谎报离线 */
    if (failed)
        return 'warn';
    const s = String(status ?? '').toLowerCase();
    if (s === 'healthy' || s === 'online' || s === 'connected' || s === 'ok')
        return 'online';
    if (s === 'degraded' || s === 'checking' || s === 'unknown')
        return 'warn';
    return connected ? 'online' : 'offline';
}
export const CHANNEL_COLORS = {
    feishu: '#3370ff', weixin: '#07c160', qq: '#12b7f5', slack: '#4a154b',
    telegram: '#2aabee', discord: '#5865f2', whatsapp: '#25d366',
    dingtalk: '#0091ff', wecom: '#2e7cf6',
};
export function channelLabel(id) {
    return CHANNEL_LABELS[id] ?? id;
}
export function stateColor(kind) {
    if (kind === 'online')
        return 'var(--af-success)';
    if (kind === 'warn')
        return 'var(--af-warn)';
    return 'color-mix(in srgb, var(--af-primary) 35%, transparent)';
}
export function channelColor(id) {
    return CHANNEL_COLORS[id] ?? 'var(--af-tertiary)';
}
