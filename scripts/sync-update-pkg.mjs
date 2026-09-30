#!/usr/bin/env node
/**
 * sync-update-pkg.mjs —— 发布前把 `dsh-plugin-update` 顶到官方源 `latest`（#99）。
 *
 * 为什么要有这个脚本：更新包是**我们插件的运行期依赖**，用户装到的更新系统版本 = 我们发布那一版
 * 清单里 pin 的那个版本（包不会自更新，也没有"import 最新版"这种东西）。所以"用户永远用最新的
 * 更新系统"只能靠**发布侧**保证：发布前查一次官方源，落后就升上去再发。
 *
 * 用法：
 *   node scripts/sync-update-pkg.mjs            比对（默认，只读，不联网改盘）：一致 exit 0；落后 exit 1；查不到 exit 2
 *   node scripts/sync-update-pkg.mjs --apply    落后就装 latest（--save-exact）+ 重新生成派生常量
 *   npm run check:update-pkg / npm run sync:update-pkg
 *
 * 口径：
 *   · 只认**官方源** `https://registry.npmjs.org/`（本机默认 registry 常是镜像站，会落后）。
 *   · 本仓 pin 必须是**精确版本**（无 ^/~）：范围声明会让用户环境跑到我们没测过的版本（见 docs/features-contract.md）。
 *   · `--apply` 只动 `package.json` / `package-lock.json` / `node_modules` / `derived.ts`；提交与否由人决定。
 *   · 出口一律走 `process.exitCode`（不在 fetch 之后 `process.exit()`：Windows 上会撞 libuv 的 handle 断言）。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = 'dsh-plugin-update';
const REGISTRY = 'https://registry.npmjs.org/';
const REPO = fileURLToPath(new URL('..', import.meta.url));
const APPLY = process.argv.includes('--apply');
const EXACT = /^\d+\.\d+\.\d+$/;

/** 已装到 node_modules 的那份版本（pin 与实物不一致时，构建产物就不是我们以为的那份）。 */
function readVersion(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

/** 查官方源 latest。超时/网络/解析失败一律 exit 2（**不回退镜像站**：镜像滞后会让我们误以为已是最新）。 */
async function latestVersion() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(REGISTRY + PKG + '/latest', {
      signal: controller.signal,
      headers: { accept: 'application/json', connection: 'close' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const body = await res.json();
    if (typeof body?.version !== 'string' || !EXACT.test(body.version)) {
      throw new Error('latest 版本号异常：' + JSON.stringify(body?.version));
    }
    return body.version;
  } finally {
    clearTimeout(timer);
  }
}

function compare(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

async function main() {
  const manifest = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  const pinned = manifest?.dependencies?.[PKG];
  if (typeof pinned !== 'string' || !pinned) {
    console.error('sync-update-pkg: package.json 的 dependencies 里没有 ' + PKG + ' —— 更新系统不该是可选依赖。');
    return 2;
  }
  if (!EXACT.test(pinned)) {
    console.error('sync-update-pkg: 本仓 pin 不是精确版本（' + pinned + '）。请先改回 exact（无 ^/~）：'
      + '范围声明会让用户环境跑到没测过的版本，而客户端派生常量是构建期冻结的。');
    return 2;
  }
  const installed = readVersion(join(REPO, 'node_modules', PKG, 'package.json'));

  let latest;
  try {
    latest = await latestVersion();
  } catch (error) {
    console.error('sync-update-pkg: 查不到官方源 latest（' + String(error?.message ?? error) + '）。');
    console.error('  本仓 pin = ' + pinned + '；装着的 = ' + (installed ?? '（未安装）'));
    console.error('  发布必须联网，故这里按失败处理；确实要跳过，向导侧用 WIZARD_SKIP_UPDATE_PKG=1。');
    return 2;
  }

  console.log('sync-update-pkg: 官方源 latest = ' + latest + '；本仓 pin = ' + pinned + '；node_modules 实际 = ' + (installed ?? '（未安装）'));

  if (latest === pinned) {
    if (installed !== pinned) {
      console.error('sync-update-pkg: pin 已是最新，但 node_modules 里装着 ' + (installed ?? '（未安装）') + ' ⇒ 先 npm install 再构建/发布。');
      return 1;
    }
    console.log('sync-update-pkg: OK —— 发布出去的就是官方源最新那一版更新包。');
    return 0;
  }

  // 本仓 pin 比 latest 新（上游撤回 / 换了 dist-tag 之类）：不自动降级，交给人判断。
  const behind = compare(pinned, latest) < 0;
  if (!APPLY) {
    if (behind) {
      console.error('sync-update-pkg: 落后 —— 本仓 ' + pinned + ' < 官方源 ' + latest + '。');
      console.error('  修法：npm run sync:update-pkg（装 latest + 重新生成派生常量），跑完 npm run check，提交后再发布。');
    } else {
      console.error('sync-update-pkg: 本仓 ' + pinned + ' **比官方源 latest（' + latest + '）还新** —— 不自动降级，请人工确认（上游撤回？dist-tag 换了？）。');
    }
    return 1;
  }

  if (!behind) {
    console.error('sync-update-pkg: --apply 只处理"落后"这一种情形；本仓 ' + pinned + ' 比 latest ' + latest + ' 新，已停下等人判断。');
    return 1;
  }

  console.log('sync-update-pkg: 装 ' + PKG + '@' + latest + '（--save-exact，官方源）…');
  execFileSync('npm', ['install', PKG + '@' + latest, '--save-exact', '--registry=' + REGISTRY], { cwd: REPO, stdio: 'inherit' });
  console.log('sync-update-pkg: 重新生成派生常量…');
  execFileSync(process.execPath, [join(REPO, 'scripts', 'gen-update-constants.mjs'), '--write'], { cwd: REPO, stdio: 'inherit' });
  console.log('sync-update-pkg: 已升到 ' + latest + '。接下来：npm run check → 提交（package.json / package-lock.json / derived.ts）→ 再发布。');
  return 0;
}

process.exitCode = await main();
