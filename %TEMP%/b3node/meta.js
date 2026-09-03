export const EMPTY_META = { names: {}, avatars: {}, locals: [] };
/** 经 host 桥调用（channel 前缀 + 信封），由 host 侧持久化到 meta.json。 */
export class RpcMetaStore {
    channel;
    rpc;
    constructor(channel, rpc) {
        this.channel = channel;
        this.rpc = rpc;
    }
    async call(endpoint, payload = {}) {
        const raw = await this.rpc(this.channel, endpoint, payload, AbortSignal.timeout(5000));
        const res = raw;
        if (!res || res.ok !== true) {
            const msg = res?.error?.message ?? res?.error?.code ?? 'host 桥调用失败';
            throw new Error(msg);
        }
        return res.value;
    }
    loadMeta() {
        return this.call('meta.get');
    }
    async rename(key, name) {
        await this.call('meta.rename', { key, name });
    }
    async setAvatar(key, dataUrl) {
        await this.call('meta.avatar.set', { key, dataUrl });
    }
    async clearAvatar(key) {
        await this.call('meta.avatar.clear', { key });
    }
    async addLocal(name) {
        await this.call('meta.local.add', { name });
    }
    async removeLocal(name) {
        await this.call('meta.local.remove', { name });
    }
    async renameLocal(from, to) {
        await this.call('meta.local.rename', { from, to });
    }
}
/** localStorage 降级实现（兼容历史键名 af-fleet-names / af-fleet-avatars / af-fleet-agents）。 */
export class LocalMetaStore {
    storage;
    K_NAMES = 'af-fleet-names';
    K_AVATARS = 'af-fleet-avatars';
    K_LOCALS = 'af-fleet-agents';
    constructor(storage) {
        this.storage = storage;
    }
    readJson(key, fallback) {
        try {
            const raw = this.storage?.getItem(key);
            if (!raw)
                return fallback;
            return JSON.parse(raw);
        }
        catch {
            return fallback;
        }
    }
    writeJson(key, value) {
        try {
            this.storage?.setItem(key, JSON.stringify(value));
        }
        catch {
            /* 存储不可用时静默（内存态仍可用） */
        }
    }
    async loadMeta() {
        const names = this.readJson(this.K_NAMES, {});
        const avatars = this.readJson(this.K_AVATARS, {});
        const locals = this.readJson(this.K_LOCALS, []);
        return { names, avatars, locals };
    }
    async rename(key, name) {
        const doc = await this.loadMeta();
        doc.names[key] = name;
        this.writeJson(this.K_NAMES, doc.names);
    }
    async setAvatar(key, dataUrl) {
        const doc = await this.loadMeta();
        doc.avatars[key] = dataUrl;
        this.writeJson(this.K_AVATARS, doc.avatars);
    }
    async clearAvatar(key) {
        const doc = await this.loadMeta();
        delete doc.avatars[key];
        this.writeJson(this.K_AVATARS, doc.avatars);
    }
    async addLocal(name) {
        const doc = await this.loadMeta();
        if (!doc.locals.some((l) => l.name === name)) {
            doc.locals.push({ name, workspace: '' });
            this.writeJson(this.K_LOCALS, doc.locals);
        }
    }
    async removeLocal(name) {
        const doc = await this.loadMeta();
        doc.locals = doc.locals.filter((l) => l.name !== name);
        this.writeJson(this.K_LOCALS, doc.locals);
    }
    async renameLocal(from, to) {
        const doc = await this.loadMeta();
        for (const l of doc.locals)
            if (l.name === from)
                l.name = to;
        this.writeJson(this.K_LOCALS, doc.locals);
    }
}
export const HOST_CHANNEL = '/im-companion';
/** 探测 host 桥（ping）→ 选 RpcMetaStore；否则降级本地。 */
export async function createMetaStore(rpc) {
    if (rpc) {
        try {
            const raw = await rpc(HOST_CHANNEL, 'ping', {}, AbortSignal.timeout(1500));
            const res = raw;
            if (res?.ok === true)
                return new RpcMetaStore(HOST_CHANNEL, rpc);
        }
        catch {
            /* 桥不可用 → 降级 */
        }
    }
    let storage = null;
    try {
        storage = typeof window !== 'undefined' ? window.localStorage : null;
    }
    catch {
        storage = null;
    }
    return new LocalMetaStore(storage);
}
