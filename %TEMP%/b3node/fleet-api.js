/** 渠道数据采集：并发 connection.status（9 渠道），RPC 信封解包，统一成 BotSnap。 */
import { CHANNEL_ORDER, healthOf } from './config';
const RPC_TIMEOUT_MS = 5000;
function unwrap(raw) {
    const r = raw;
    if (r && r.ok === true && r.value !== undefined)
        return r.value;
    return raw;
}
function extractBots(value) {
    const r = value;
    if (!r)
        return [];
    if (Array.isArray(r))
        return r;
    if (Array.isArray(r.bots))
        return r.bots;
    if (r.snapshot && Array.isArray(r.snapshot.bots))
        return r.snapshot.bots;
    if (r.data && Array.isArray(r.data.bots))
        return r.data.bots;
    return [];
}
/** 单渠道状态（接入流程轮询用）：返回该渠道 bots + 顶层 provisioning。 */
export async function fetchChannelStatus(rpc, channel) {
    const raw = await rpc('/' + channel, 'connection.status', {}, AbortSignal.timeout(RPC_TIMEOUT_MS));
    const value = unwrap(raw);
    const botsRaw = value?.bots ?? value?.snapshot?.bots ?? [];
    const bots = botsRaw.map((b) => {
        const hs = b.health?.status ?? b.status ?? null;
        return {
            channel,
            botId: b.botId ?? '',
            workspace: b.workspace ?? b.workspacePath ?? '',
            connected: b.connected === true,
            healthStatus: hs,
            healthKind: healthOf(hs, b.connected),
            botName: b.bot?.name ?? '',
            avatarUrl: b.bot?.avatarUrl ?? '',
            healthSummary: b.health?.summary ?? '',
            lastCheckedAt: typeof b.health?.lastCheckedAt === 'number' ? b.health.lastCheckedAt : null,
            stale: false,
        };
    });
    const provisioning = value?.provisioning ?? value?.snapshot?.provisioning ?? null;
    return { bots, provisioning: provisioning && typeof provisioning === 'object' ? provisioning : null };
}
/** 并发拉取全部渠道连接状态；失败渠道记入 failed。
 * B1 verdict：传输失败的渠道保留上一轮快照并标 stale（时间冻结、按未知展示），
 * 而不是丢弃谎报离线；ok:false（渠道未配置）是权威空，不保留。 */
export async function fetchBots(rpc, prev = []) {
    const results = await Promise.allSettled(CHANNEL_ORDER.map(async (ch) => {
        const raw = await rpc('/' + ch, 'connection.status', {}, AbortSignal.timeout(RPC_TIMEOUT_MS));
        const value = unwrap(raw);
        const doc = value;
        if (doc && doc.ok === false)
            return [];
        return extractBots(value).map((b) => {
            const hs = b.health?.status ?? b.status ?? null;
            return {
                channel: ch,
                botId: b.botId ?? '',
                workspace: b.workspace ?? b.workspacePath ?? '',
                connected: b.connected === true,
                healthStatus: hs,
                healthKind: healthOf(hs, b.connected),
                botName: b.bot?.name ?? '',
                avatarUrl: b.bot?.avatarUrl ?? '',
                healthSummary: b.health?.summary ?? '',
                lastCheckedAt: typeof b.health?.lastCheckedAt === 'number' ? b.health.lastCheckedAt : null,
                stale: false,
            };
        });
    }));
    const bots = [];
    const failed = [];
    results.forEach((res, i) => {
        if (res.status === 'fulfilled') {
            bots.push(...res.value);
        }
        else {
            const ch = CHANNEL_ORDER[i];
            failed.push(ch);
            for (const p of prev) {
                if (p.channel === ch)
                    bots.push({ ...p, stale: true, healthKind: 'warn' });
            }
        }
    });
    return { bots, failed };
}
