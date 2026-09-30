#!/usr/bin/env node
/**
 * gen-update-constants.mjs —— 构建期派生：把 update-center 要用的取值**从已安装的 dsh-plugin-update 算出来**（#99）。
 *
 * 为什么要有这个脚本：面板侧不能运行期 import 更新包（tsdown 会把包整个内联进单文件浏览器产物，
 * 见 tools/verify/features/update-center.ts 的 T8-12 黑名单断言），上游 README §3 给的方案是
 * 「构建期派生一个小文件」。先前那版是把五个值**手抄冻结**（T8 的权宜），缺点是升级依赖时靠人记得改。
 * 现在改成：pin 一动 → 跑一次本脚本 → `src/features/update-center/derived.ts` 跟着变；落盘前有 --check 兜底。
 *
 * 取值来源（都是上游 README §8 写明的公开面）：
 *   · 电话名：包根（唯一导出入口）的 `buildPhoneNames(prefix)`；再用 `dist/client.js` 的
 *     `buildClientPhoneNames(prefix)` 交叉核对——两侧不一致直接报错，绝不"挑一个信"。
 *   · 轮询间隔：`dist/client.js` 的 `CLIENT_POLL.defaultMs` / `CLIENT_POLL.minMs`。
 *     `dist/client.js` 不被 `exports` 暴露（上游只开 `.` 与 `./package.json`），故按**文件 URL** 载入——
 *     这正是上游文档说的"客户端入口（构建期打包用）"。上游的 derive-client-values.mjs 用 esbuild 打包同一入口，
 *     本脚本直接 import 同一份产物，取值等价且不需要新增 esbuild 开发依赖。
 *
 * 用法：
 *   node scripts/gen-update-constants.mjs           比对（默认，不写盘）：不一致 → 打印差异并 exit 1
 *   node scripts/gen-update-constants.mjs --write   写盘（升级依赖后跑这条）
 *   npm run gen:update-constants / npm run build（build 走比对模式，改了 pin 忘重生成 = 构建直接红）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** 电话名前缀：与 `src/host/update.ts` 的 `UPDATE_PHONE_PREFIX` 同值，两处不一致面板就调不通（本脚本只读不写宿主侧）。 */
export const PREFIX = 'imc';
/** 生成目标（仓库根相对路径）。 */
export const OUT_REL = 'src/features/update-center/derived.ts';

const REPO = fileURLToPath(new URL('..', import.meta.url));

/** 已安装的更新包目录：`node_modules/dsh-plugin-update`（靠包的 `./package.json` 导出定位，不拼字符串）。 */
export function packageDir() {
  const require = createRequire(import.meta.url);
  return dirname(require.resolve('dsh-plugin-update/package.json'));
}

/** 真身取值：返回五个常量 + 出处版本。任何一处取不到就抛（不静默降级成"沿用旧值"）。 */
export async function deriveValues() {
  const dir = packageDir();
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const client = await import(pathToFileURL(join(dir, 'dist', 'client.js')).href);
  const host = await import('dsh-plugin-update'); // 裸名：与宿主产物解析到同一份真身
  if (typeof client.buildClientPhoneNames !== 'function' || typeof host.buildPhoneNames !== 'function') {
    throw new Error('[gen-update-constants] 更新包缺少 buildClientPhoneNames/buildPhoneNames，无法派生');
  }
  const fromClient = client.buildClientPhoneNames(PREFIX);
  const fromHost = host.buildPhoneNames(PREFIX);
  for (const key of ['updateStatus', 'updateCheck', 'updateInstall']) {
    if (fromClient?.[key] !== fromHost?.[key]) {
      throw new Error('[gen-update-constants] 宿主侧与客户端侧电话名不一致（' + key + '）：' + fromHost?.[key] + ' vs ' + fromClient?.[key]);
    }
  }
  const poll = client.CLIENT_POLL;
  if (!poll || typeof poll.defaultMs !== 'number' || typeof poll.minMs !== 'number') {
    throw new Error('[gen-update-constants] 更新包 dist/client.js 没有 CLIENT_POLL.defaultMs/minMs');
  }
  return {
    version: String(manifest.version ?? '0.0.0'),
    status: fromHost.updateStatus,
    check: fromHost.updateCheck,
    install: fromHost.updateInstall,
    poll: poll.defaultMs,
    pollMin: poll.minMs,
  };
}

/** 生成文件正文（确定性的：只依赖包版本与五个值，不含路径/时间戳 ⇒ 同一依赖在任何机器上逐字节相同）。 */
export function renderDerived(v) {
  return [
    '/** 本文件由 scripts/gen-update-constants.mjs 生成，**人手不改**（要改请改生成器或更新包）。',
    ' *',
    ' * 来源：dsh-plugin-update@' + v.version + ' 的 buildPhoneNames(' + PREFIX + ') 与 dist/client.js 的 CLIENT_POLL',
    ' * （宿主侧与客户端侧的电话名已交叉核对一致）。重新生成：npm run gen:update-constants',
    ' *',
    ' * 为什么是生成而不是运行期取值：客户端源码一旦 import 更新包，会被 tsdown 整个内联进单文件浏览器产物',
    ' * （tsdown.config.ts 的 alwaysBundle 白名单之外一律内联）。',
    ' */',
    "export const UPD_STATUS = '" + v.status + "'",
    "export const UPD_CHECK = '" + v.check + "'",
    "export const UPD_INSTALL = '" + v.install + "'",
    'export const UPD_POLL = ' + v.poll,
    'export const UPD_POLL_MIN = ' + v.pollMin,
    '',
  ].join('\n');
}

const target = join(REPO, OUT_REL);
const values = await deriveValues();
const text = renderDerived(values);
const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
const rel = relative(REPO, target).replace(/\\/g, '/');

if (process.argv.includes('--write')) {
  if (current === text) {
    console.log('gen-update-constants: ' + rel + ' 已是最新（dsh-plugin-update@' + values.version + '）');
  } else {
    writeFileSync(target, text);
    console.log('gen-update-constants: 已按 dsh-plugin-update@' + values.version + ' 重写 ' + rel);
  }
} else if (current === text) {
  console.log('gen-update-constants: OK —— ' + rel + ' 与已安装的 dsh-plugin-update@' + values.version + ' 一致');
} else {
  console.error('gen-update-constants: ' + rel + ' 与已安装的 dsh-plugin-update@' + values.version + ' **不一致**。');
  console.error('  期望（重新派生）：');
  for (const line of text.split('\n')) if (line.startsWith('export')) console.error('    ' + line);
  console.error('  实际（盘上）：');
  for (const line of current.split('\n')) if (line.startsWith('export')) console.error('    ' + line);
  console.error('  修法：npm run gen:update-constants');
  process.exit(1);
}
