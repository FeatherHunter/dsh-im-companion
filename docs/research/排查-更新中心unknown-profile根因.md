# 排查 · 更新中心 `unknown-profile` 根因（只读取证）

- **取证时间**：2026-10-15 02:23–02:50（Asia/Shanghai）
- **性质**：只读取证。未改本仓任何源码 / 测试 / 其它文档（本文件除外）、未建改 issue、未提交 git、未写任何 profile 与 `~/.dsh` 数据。
- **基线（三条版本读数）**：本仓 `package.json:3` `"version": "0.2.8"`；`package.json:81` `"dsh-plugin-update": "0.13.0"`；出库产物 `C:\Users\辰辰洋洋\.dsh\profiles\desktop\node_modules\dsh-plugin-update\package.json` = **0.13.0**（与 pin 一致）；`C:\Users\辰辰洋洋\.dsh\profiles\web\node_modules\dsh-plugin-update\package.json` = 0.11.0（**该 profile 已不挂本插件**，不是本次路径）。
- **宿主进程**：`PID 35312` 命令行含 `C:\Users\辰辰洋洋\.dsh\profiles\desktop`（`"D:\DeepseekHarness\DeepSeek Harness.exe" --expose-internals …dsh-desktop-host\lib\index.js …\dsh C:\Users\辰辰洋洋\.dsh\profiles\desktop …`）⇒ **本次宿主实际使用的就是 desktop profile**。

---

## 结论（先给裁决）

1. **抛出点定位到行**：`C:\Users\辰辰洋洋\.dsh\profiles\desktop\node_modules\dsh-plugin-update\dist\host.js:245` —— `if (!inferred) throw unknownProfile();`；错误对象由 `dist\host.js:217-219` 的 `unknownProfile()` 构造（`Object.assign(new Error("unknown-profile"), { code: "unknown-profile" })`）。

2. **`errorHash` 把「哪条 throw」钉死（铁证）**：日志里的 `"errorHash":"ec4e4693"` **等于** `hash8("unknown-profile")`（实测复算相等）。`hash8` 原文在 `dist\host.js:189-198`，全包唯一调用点是 `dist\host.js:523`：
   `errorHash: hash8(String(error?.message || payload.error))`。
   ⇒ 被记录的异常 `message` 逐字是 `unknown-profile` ⇒ **只能**来自 `unknownProfile()`。`dist\reader.js:178/187/217` 那条路只把 `blockedReason` 写进快照，**不抛错、不产生 errorHash**，可排除。
   （本机 4 次失败全部是同一个 `ec4e4693`：日志 `2026-10-15.log:29 / 42 / 59 / 75`，本地时间 01:07:43 / 01:08:35 / 02:06:09 / 02:14:31，latencyMs 3 / 16 / 4 / 2。）

3. **本机为什么命中（判据原文见证据表 E5–E7）**：desktop profile 的 `node_modules\dsh-im-companion` 是 **Junction → `D:\dsh-plugin\dsh-im-companion`**（创建时间 **2026-10-11 17:12:36**）。Node 按 **realpath** 解析模块，于是包解析出的目标包目录是 `D:\dsh-plugin\dsh-im-companion`；而 `tryInferProfileDir()` 的判据是「路径里必须含 `\node_modules\<目标包名>`，切掉这一段剩下的才是使用范围」——本机 anchor 的 `lastIndexOf(marker)` = **-1**（实测），`at > 0` 不成立 ⇒ 返回 `null` ⇒ `:245` 抛。
   三个实测读数（用包自己的导出函数跑，只读）：`resolveTargetPackage('dsh-im-companion').directory = D:\dsh-plugin\dsh-im-companion`；`marker = "\\node_modules\\dsh-im-companion"`；`lastIndexOf = -1 → inferred = null`。

4. **不是 `:238` 那条**：`:238` 的判据是 `runningVersion` 算不出（`if (!runningVersion) throw unknownProfile()`）。本机 `resolveTargetPackage` 解析成功、仓库版本 `0.2.8` 过 `validReleaseVersion` ⇒ `runningVersion = "0.2.8"`，`:238` 不触发。（两条 throw 同码；判定依据见「未证实项 U3」。）

5. **真机普通用户不会命中**（判据 + 旁证，详见 §影响面）：
   - 反推判据对「真目录」形状成立：同一函数实测，真目录形状 `C:\…\profiles\desktop\node_modules\dsh-im-companion` 的 `lastIndexOf = 32/35 > 0` ⇒ 反推出 `C:\…\.dsh\profiles\desktop`。
   - **本机历史旁证**：`C:\Users\辰辰洋洋\.dsh\updates\dsh-im-companion\7ece3b35f7f84996bfa84dc8\before.json`（真安装备份，mtime **2026-10-11 16:47:32**）所在目录名 = `shortHash(profileDir)`（`dist\store.js:21,68` + `pathsForUpdate` 原文），而 `sha256("C:\Users\辰辰洋洋\.dsh\profiles\desktop").slice(0,24)` **实测等于** `7ece3b35f7f84996bfa84dc8` ⇒ 那次更新是在「能反推出 desktop 范围」的形态下完成的；Junction 是 **25 分钟后** 才挂上的。
   - 该 profile 的 `pnpm-workspace.yaml:4` 是 `nodeLinker: hoisted`，且同名兄弟插件（`dsh-plugin-update` / `dsh-prompt` / `dsh-calorie` / `dsh-mattpocock-skills-deck` / `dshmarket` …）**全部是 real-dir**（无 LinkType），`node_modules\.pnpm` 下**没有** `dsh-im-companion@*` / `dsh-plugin-update@*` 条目。

6. **性质与归属（裁决）**：这是**开发态挂载方式**与更新包「按版本号安装」模型的结构性冲突——本仓 0.2.0 起刻意**不传** `profileDir`（`AGENTS.md:40` 解耦基线），而 Junction 恰好是唯一让包**推不出** profileDir 的形态。**不是本仓代码缺陷，也不是面板/桥缺陷**；本仓该修的是**文档 + 开发态预检**（主责），跨仓向包作者提一条「判码更准确」的建议（次责），**不建议**在本仓降级或隐藏红字（违反桥诚实性，见候选修法 b）。

7. **这条行为已被本仓自己的测试钉成「预期」**：`tools/verify/features/update-host.ts:277-287`（T7-3 第三段）**已断言**「实装目录越出使用范围 ⇒ `unknown-profile`」，称之为「0.2.0 的诚实答复」，并顺手记下了口子 `readerOverrides: { profileDir }`（该断言实测会落 `source-install`）。⇒ 本次排查实质是**把一条「已知但未写进 AGENTS.md 的开发态副作用」重新发现了一遍**，这本身就是可开票的缺口（重复排查成本）。

---

## 证据表

> 约定：`P` = `C:\Users\辰辰洋洋\.dsh\profiles\desktop\node_modules\dsh-plugin-update`；`R` = `D:\dsh-plugin\dsh-im-companion`；`L` = `C:\Users\辰辰洋洋\.dsh\logs\dsh-im-companion\2026-10-15.log`。所有「实测」均为本次会话只读产生。

### A. 抛出点与判据（出库产物，非上游 .ts）

| # | 文件:行号 | 原文 / 读数 | 关系 |
|---|---|---|---|
| E1 | `P\dist\host.js:217-219` | `function unknownProfile() {`<br>`  return Object.assign(new Error("unknown-profile"), { code: "unknown-profile" });`<br>`}` | 全包唯一构造该 message + code 的地方 |
| E2 | `P\dist\host.js:245` | `if (!inferred) throw unknownProfile();` | **本机实际抛点** |
| E3 | `P\dist\host.js:238` | `if (!runningVersion) throw unknownProfile();` | 另一条同码抛点（本机不触发，见结论 4） |
| E4 | `P\dist\host.js:232-237` | `const overrideVersion = overrides.runningVersion;`<br>`let runningVersion = null;`<br>`if (overrideVersion !== void 0 && overrideVersion !== null) { runningVersion = overrideVersion; }`<br>`else if (validReleaseVersion(loadedVersion)) { runningVersion = String(loadedVersion); }` | 未注入时用 `resolveTargetPackage` 得到的版本（本机 = 0.2.8） |
| E5 | `P\dist\host.js:199-216`（全文） | `async function tryInferProfileDir(targetDir, targetPackageName) {`<br>`  const dir = String(targetDir || "");`<br>`  if (!dir) return null;`<br>`  const marker = `${sep}node_modules${sep}${String(targetPackageName || "").split("/").join(sep)}`;`<br>`  const at = dir.lastIndexOf(marker);`<br>`  if (at > 0) { const candidate = dir.slice(0, at); try { return await realpath(candidate); } catch { return candidate; } }`<br>`  return null; }` | **判据原文**：只认「`…<范围>\node_modules\<包名>`」这一种形状 |
| E6 | `P\dist\host.js:243-246` | `const anchorDir = (loaded && loaded.directory ? String(loaded.directory) : "") \|\| explicitTargetDir;`<br>`const inferred = anchorDir ? await tryInferProfileDir(anchorDir, targetPackageName) : null;`<br>`if (!inferred) throw unknownProfile();`<br>`profileDirInput = inferred;` | anchor 首选「解析出的目标包目录」（已被 realpath 过） |
| E7 | `P\dist\host.js:240-241` | `if (overrides.profileDir) { profileDirInput = String(overrides.profileDir); }` | 唯一能让反推短路的口子（本仓生产装配不传） |
| E8 | `P\dist\host.js:189-198` + `:523` | `function hash8(s) { … let h = 5381; for (…) h = (h << 5) + h + t.charCodeAt(i) >>> 0; return \`0000000${h.toString(16)}\`.slice(-8); }` / `errorHash: hash8(String(error?.message \|\| payload.error))` | 实测 `hash8("unknown-profile") === "ec4e4693"` ⇒ 钉死 throw 来源 |
| E9 | `P\dist\host.js:520-523, 579` | `} catch (error) { const payload = toUpdateErrorPayload(error); emit("warn", LOG_EVENT_CALL_FAIL, { method, kind, errorHash: …, pluginId }); …` / `return { ok: false, ...payload, … };` | 包把异常翻成 `{ok:false,error:"unknown-profile"}`，**不抛给宿主** |
| E10 | `P\dist\host.js:416-436` | `const known = ["check-failed","invalid-release","check-expired","update-busy","install-failed","unknown-profile","channel-mismatch","source-install","invalid-installation","installation-changed","pending-restart","incompatible-node","registry-conflict","recovery-required"];`<br>`if (known.includes(code)) return { error: code, errorKind: code };` | 0.13.0 的冻结码表共 **14 条**（比旧档案记的 13 条多 `channel-mismatch`） |
| E11 | `P\dist\log-events.js` | `const LOG_EVENT_CALL = "host.call"; const LOG_EVENT_CALL_FAIL = "host.call.fail"; const LOG_EVENT_INSTALL_EXEC = "update.install.exec";` | 与日志里 `host.call.fail` 逐字对上 |
| E12 | `L:28` 与 `L:29` | `{"level":"warn","event":"host.update.tap","fields":{"level":"warn","event":"host.call.fail","detail":"{\"method\":\"imc.updateStatus\",\"kind\":\"update-status\",\"errorHash\":\"ec4e4693\",\"pluginId\":\"dsh-im-companion\"}"}}`<br>`{"level":"error","event":"host.rpc.fail","fields":{"method":"imc.updateStatus","ok":false,"latencyMs":3,"code":"unknown-profile"}}` | 包的事件口 → 本仓 `host.update.tap`；失败码原样进 `host.rpc.fail` |
| E13 | `P\dist\host.js:686-690` | `async function readStatus(args) { const reader = await getSharedReader(pluginId, config, { ...readerOverrides, profileDir: args && args.profileDir ? String(args.profileDir) : readerOverrides.profileDir }); … }` | `imc.updateStatus` 每次调用都要先过反推（**不是**缓存后的快照） |
| E14 | `P\dist\host.js:382-412` | `sharedReader = Object.assign(createUpdateReader({ runningVersion, profileDir: profileDirInput, pluginId, profileName: overrides.profileName ?? void 0, homeDir: overrides.homeDir, … }), {…})` | 反推成功后才建读取器；失败者永远到不了这一步 |

### B. 「反推使用范围」的解析逻辑与输入

| # | 文件:行号 | 原文 / 读数 | 关系 |
|---|---|---|---|
| E15 | `P\dist\reader.js:49-90`（全文） | `async function resolveTargetPackage(targetName, opts = {}) {`<br>`  if (opts.targetPackageDir) return packageAtIfNamed(resolve(String(opts.targetPackageDir)), name);`<br>`  const base = import.meta.url; … req = createRequire(base);`<br>`  try { const pkg = await packageAtIfNamed(dirname(req.resolve(\`${name}/package.json\`)), name); if (pkg) return pkg; } catch {}`<br>`  try { const entry = req.resolve(name); const pkg = await containingPackage(entry, name); if (pkg) return pkg; } catch {}`<br>`  … 沿 dir 上溯 packageAtIfNamed(join(dir,"node_modules",name), name) … containingPackage(fileURLToPath(base), name) …`<br>`  return null; }` | **输入 = 包名**（`targetPackageName`），起点 = **更新包自己的 `import.meta.url`**，不是本仓、不是 `homeDir` |
| E16 | `P\dist\reader.js:23-26` | `async function packageAt(directory) { const contents = await readFile(join(directory,"package.json"),"utf8"); return { directory: await realpath(directory), manifest: JSON.parse(contents), contents }; }` | **`directory` 一律 realpath** ⇒ Junction 会在这一步被「化掉」 |
| E17 | `P\dist\reader.js:126-131` | `function defaultHomeDir(env, osHome) { let selected = env && env.DSH_HOME && env.DSH_HOME.trim() ? env.DSH_HOME : join(osHome, ".dsh"); … return resolve(selected); }` | `homeDir` 只影响落盘位置，**与范围反推无关** |
| E18 | `P\dist\host.js:248-249` | `const homeDirInput = overrides.homeDir ?? config.homeDir ?? homeDirDefault;`<br>`const environmentKind = overrides.environmentKind ?? detectEnvironmentKind(overrides.ctx, resolveProfileName(overrides.profileName, profileDirInput));` | 范围名由 `basename(profileDir)` 得到（`reader.js:91-93`） |
| E19 | `P\dist\reader.js:94-96` | `function profileNameValid(name) { return typeof name === "string" && name.length > 0 && Buffer.byteLength(name) <= 255 && !name.startsWith("-") && ![".","..","node_modules"].includes(name) && !/[\\/\x00-\x1f\x7f<>:"\|?*]/u.test(name); }` | `reader.js` 侧另一条 `unknown-profile` 判据（`:178`），本机路径不可达 |
| E20 | `P\dist\reader.js:162-226`（关键三行） | `:178 if (!profileNameValid(profileName)) { result.blockedReason = "unknown-profile"; return result; }`<br>`:187 } catch { result.blockedReason = "unknown-profile"; return result; }`<br>`:217 else if (loadedUnresolvable) result.blockedReason = "unknown-profile";` | 快照阻塞码通道（**不抛错**，与本次日志的 `host.rpc.fail` 无关） |
| E21 | `P\dist\reader.js:201-202, 219-223` | `const deps = profile.manifest.dependencies ?? {};`<br>`result.sourceInstall = !registrySpec(deps[targetPackageName]) \|\| !inside(join(profileDir,"node_modules"), installed.directory);` / `else if (!result.packageValid) result.blockedReason = "invalid-installation"; else if (result.sourceInstall) result.blockedReason = "source-install";` | 「源码安装」的判据 = 实装目录 realpath **越出** `<范围>/node_modules`；Junction 正是这种形态——**但它到不了这一步**（反推先抛） |
| E22 | `P\dist\reader.js:100-124` | `const entries = [main, exportsField?.["./client"], bundle?.patch]; … try { target = await realpath(filename); } catch { return false; } if (!inside(pkg.directory, target)) return false; …` | 完好性判定同样 realpath；本仓三入口（`lib/index.js`、`lib/client.js`、`cordis.patch.yml`）齐全 ⇒ **推断** `packageValid=true` |

### C. 宿主侧本仓传了什么（解耦基线复核）

| # | 文件:行号 | 原文 | 关系 |
|---|---|---|---|
| E23 | `R\src\host\update.ts:81-88` | `const packageHost = createHostUpdate({ ctx: options.ctx, logCtx: …, readerOverrides: { homeDir: options.dshHome, ...options.readerOverrides } }, { pluginId: UPDATE_PLUGIN_ID, prefix: UPDATE_PHONE_PREFIX, targetPackageName: TARGET_PACKAGE_NAME });` | 生产只传 `homeDir`（取值）；`runningVersion`/`profileDir`/`readInstalled` 一个不传 |
| E24 | `R\src\host\update.ts:29-35` | `export const UPDATE_PLUGIN_ID = 'dsh-im-companion'` / `UPDATE_PHONE_PREFIX = 'imc'` / `TARGET_PACKAGE_NAME = 'dsh-im-companion'` / `UPDATE_ENDPOINTS = ['imc.updateStatus', …]` | 目标包名 = 本插件自己 ⇒ 反推对象就是自己 |
| E25 | `R\src\index.ts:87-99` | `update = createUpdateHostBridge({ ctx, logger, dshHome, logCtx: { fire: (level, event, fields) => hostLog?.log(…, 'host.update.tap', { level, event, detail: JSON.stringify(fields ?? {}) }) } })` | 装配点确实没有解析类注入；事件口把包字段逐字落盘（日志 E12 的来源） |
| E26 | `R\src\host\rpc.ts:278-287` | `case 'imc.updateStatus': … { const surface = opts.update?.() ?? null; if (!surface) return fail('bad-request', …); const call = surface.handlers[endpoint]; …; return surface.reply(await call(p)) }` | 端点是纯直通，不认识包字段 |
| E27 | `R\src\host\update.ts:106-115` | `const token = typeof row?.error === 'string' && row.error ? row.error : 'internal'`<br>`return { ok: false, error: { code: token, message: token, details: { errorKind: row?.errorKind ?? null, update: row ?? null } } }` | 失败码**原样透传**（不自造第二套词表）⇒ 日志 `code:"unknown-profile"` 是包给的原文 |
| E28 | `R\src\features\update-center\view.ts:98-106` | `controller = mountUpdateEntry(host, { pluginId: PLUGIN_ID, prefix: PREFIX, call, variant: 'button', theme: 'default', autoCheck: 'mount', openOn: 'always' })` | 面板**挂载即自查**（与「每次挂载都失败」吻合） |
| E29 | `R\src\features\update-center\view.ts:45-62` | `export function toPackageReply(raw: unknown): unknown { … if (env.ok === false) { const pkg = err.details?.update; if (pkg && typeof pkg === 'object') return pkg; … } }` | 失败载荷被原样还原给包 ⇒ 包自己判 failed 态 |
| E30 | `R\AGENTS.md:40` | `**解耦基线（0.2.0）**：宿主侧**不传** `runningVersion` / `profileDir` / `readInstalled`——包自己按包名解析目标包并反推使用范围；只传 `homeDir`…**别再长回来**。` | 与 E23 一致；也是候选修法 (c′/d) 的契约红线 |
| E31 | `R\AGENTS.md:28` | `挂载：`desktop` + `web` 双 profile，**两侧都是「按版本号安装」的真目录**（2026-09-30 实测…均为 real-dir、均为 0.1.17…）（开发态临时挂 Junction 才即时生效）` | **已过时**：本机 desktop 现为 Junction（2026-10-11 17:12:36）、web 已完全不挂本插件（`profiles\web\package.json` 依赖表无 `dsh-im-companion`） |

### D. 客户端红字与包内文案

| # | 文件:行号 | 原文 | 关系 |
|---|---|---|---|
| E32 | `P\dist\bilingual.js:6` | `"entry.label.failed": { en: "Update failed — View details", zh: "更新失败，请查看详情", draft: true }` | 用户看到的那句红字（面板按钮文字） |
| E33 | `P\dist\entry.js:26-27, 41-42` | `if (state && state.error \|\| job && (job.state === "failed" \|\| job.state === "interrupted")) { return "failed"; }` / `case "failed": return "entry.label.failed";` | 失败态判据（`state.error` = 包自己的失败码） |
| E34 | `P\dist\entry.js:462` 与 `:305` | `if (autoCheck === "mount") void refresh();` / `const reply = await call(phoneNames.updateStatus, phoneArgs());` | **挂载 → updateStatus → 抛 unknown-profile → 按钮转红**（完整链） |
| E35 | `P\dist\panel.js:128` | `"unknown-profile": { title: "panel.blocked.unknown-profile.title", action: "panel.blocked.unknown-profile.action" },` | 展开详情的文案映射 |
| E36 | `P\dist\bilingual.js:18-19` | `"panel.blocked.unknown-profile.title": … zh: "无法识别使用范围或插件安装位置"` / `"…action": … zh: "重启宿主后重新查询；若持续，请提交版本号与诊断信息至插件作者；此场景不提供手工命令。"` | 包对用户的官方说法（与 README 一致） |
| E37 | `P\README.md:466`（另见 `:389`、`:387`、`:556`） | `\| \`unknown-profile\` \| 无法识别使用范围或插件安装位置 \| 重启宿主后重新查询；若持续，请提交版本号与诊断信息至插件作者；此场景不提供手工命令 \|`<br>`:389 \`targetPackageName\` 建议就是你自己的包名：使用范围目录按「装好的包住在 \`<范围>/node_modules/<目标包名>\`」反推。`<br>`:556 \`13. 报 \`unknown-profile\` 但使用范围名与目录都没问题：本包按包名找不到你的插件包。让集成方传 \`readerOverrides.targetPackageDir\`，或把包装成插件包的依赖（别装到别的 \`node_modules\` 树里）。\`` | 包侧文档：期望形状 + 官方排错药方（该药方**对 Junction 无效**，见 U1′/候选 c） |
| E38 | `P\CHANGELOG.md:233` 与 `:40` | `- 目标包按包名解析：普通依赖形态一键升级可用，显式 \`targetPackageDir\` 逃生口，定位不到诚实 \`unknown-profile\`。`<br>`- 预发布已装版误报 \`unknown-profile\`（#98）：…\`unknown-profile\` 只留真定位不到与版本非法。` | 设计意图：`unknown-profile` = 「真定位不到」；Junction 被算作「定位不到」 |

### E. 本机安装拓扑实测（只读）

| # | 命令 / 文件:行号 | 读数 | 关系 |
|---|---|---|---|
| E39 | `Get-Item …\profiles\desktop\node_modules\dsh-im-companion -Force` | `LinkType : Junction`，`Target : D:\dsh-plugin\dsh-im-companion`，`Attributes : Directory, ReparsePoint`，`CreationTime : 2026/10/11 17:12:36` | 根因载体 |
| E40 | `fsutil reparsepoint query <同上>` | `Reparse Tag Value : 0xa0000003` / `Substitute Name: \??\D:\dsh-plugin\dsh-im-companion` | 复核确实是 Junction（挂载点） |
| E41 | `node -e`：`createRequire('<profile>\node_modules\dsh-plugin-update\dist\reader.js').resolve('dsh-im-companion/package.json')` | `D:\dsh-plugin\dsh-im-companion\package.json`（`realpath(dirname) = D:\dsh-plugin\dsh-im-companion`） | **包会解析到本仓**，与 E6 的 anchor 完全一致 |
| E42 | `profiles\desktop\package.json:11` / `:38` | `"dsh-im-companion": "0.2.8",` / bundles 列表里的 `"dsh-im-companion",` | 清单声明是**按版本号**；bundles 决定它被装配 |
| E43 | `profiles\desktop\pnpm-lock.yaml:29-31, 815, 2342-2344` | `dsh-im-companion:` / `specifier: 0.2.8` / `version: 0.2.8` / `dsh-im-companion@0.2.8:` / `dependencies: dsh-plugin-update: 0.13.0` | 记录形状是**版本号**（不是 `link:`）；运行期依赖 pin 到 0.13.0（与 E-基线一致） |
| E44 | `profiles\desktop\pnpm-workspace.yaml:4` | `nodeLinker: hoisted` | 该 profile 的安装器不建 `.pnpm` 符号链接 ⇒ 真机形状 = real-dir |
| E45 | `Get-ChildItem …\node_modules\.pnpm`（筛 `*im-companion*` / `*plugin-update*`）+ 兄弟插件 `LinkType` | 无匹配条目；`dsh-plugin-update` / `dsh-prompt` / `dsh-calorie` / `dsh-life-pack` / `dshmarket` / `dsh-log` / `dsh-mattpocock-skills-deck` 的 `LinkType` 全为空（real-dir） | Junction 是**手工挂的例外**，不是安装器产物 |
| E46 | `P\dist\store.js:21, 68-71` + `pathsForUpdate` 原文 | `return createHash("sha256").update(String(text)).digest("hex").slice(0, 24);` / `function pathsForUpdate(homeDir, pluginId, profileDir) { … const directory = join(homeDir, LEGACY_SEGMENT, pluginId, shortHash(profileDir)); … }` | 状态目录名 = `hex24(profileDir)` ⇒ 可反推「当年那次用的是哪个范围」 |
| E47 | 实测：`sha256("C:\Users\辰辰洋洋\.dsh\profiles\desktop").slice(0,24)` | `7ece3b35f7f84996bfa84dc8`（**相等**）；对照 `sha256("D:\dsh-plugin\dsh-im-companion")…` = `27f327d282d2ac5b98f2aa07`（不等） | 历史那次更新用的是**真 profile 目录**，不是本仓 |
| E48 | `…\.dsh\updates\dsh-im-companion\7ece3b35f7f84996bfa84dc8\before.json` 头部 + mtime | `{"jobId":"ae8a53cd-…","previousVersion":null,"files":{"package.json":"{…\"dsh-im-companion\": \"0.2.6\"…}", …}}`；`LastWriteTime = 2026/10/11 16:47:32` | 真安装真跑过；当时 profile 声明 0.2.6 ⇒ 这次是升到 0.2.7/0.2.8 的那一步 |
| E49 | `R` git：`git show v0.2.0:src/index.ts` / `git show 3b702d2^:package.json` | `update = createUpdateHostBridge({ ctx, store, logger, dshHome })`（无 `readerOverrides`）/ `"dsh-plugin-update": "0.2.0"` | ⇒ 16:47 那次更新**不可能**靠注入，只能靠反推成功 ⇒ 「真目录可反推」在本机被实证 |

### F. 既有研究结论的时效性（逐条裁决）

| # | 文件:行号 | 原结论 | 对 0.13.0 / 现状是否成立 |
|---|---|---|---|
| E50 | `R\docs\research\审查-R3-风险报告核心结论证伪.md:13, 25, 52, 59` | 「传不进 `runningVersion` → 抛 `unknown-profile`（L1 坐实）」；「`host.js:83-85` ⇒ **`unknown-profile` 的唯一抛点**」；「(b) 切完并重启…所有电话回 `unknown-profile`」 | **机制仍成立，但归因与行号已被取代**：0.13.0 里 `:238`（版本）与 `:245`（范围反推）**是两条**；本机命中的是 `:245`，而 R3 描述的「walkup 找不到包 ⇒ 版本算不出」在本机**不成立**（junction 让包解析得到、版本也有）。行号全部漂移（0.1.1 → 0.13.0） |
| E51 | `R\docs\research\审查-R3-风险报告核心结论证伪.md:79, 92` | 「`readerOverrides.runningVersion` 消 `unknown-profile`（host.js:84 短路）；`readerOverrides` 是现成口子」 | **半失效**：本机 `runningVersion` 本来就有（无需注入）；真正需要的是 `profileDir`（E7）。且「口子是正解」与 `AGENTS.md:40` 的解耦基线正面冲突 ⇒ 不能作为本仓处置 |
| E52 | `R\docs\research\更新系统-0.2.0升级与发布侧自动跟随.md:12` | 「使用范围目录…从目标包实装路径反推（`dist/host.js:73-90` 的 `tryInferProfileDir`），**失败才 `unknown-profile`**（`:111`）」 | **仍成立**（这正是本机根因），但行号漂移：0.13.0 是 `host.js:199-216` 定义、`:245` 抛 |
| E53 | `R\docs\research\更新系统-0.2.0升级与发布侧自动跟随.md:11, 19` | 「0.2.0 起 `resolveTargetPackage` 四步解析；**0.2.0 把 `unknown-profile` 的根因原生接管**…不再需要集成方兜」 | **前半成立、后半已被本机证伪**：接管的是「按包名找目标包」；**「反推范围」在 Junction 下仍失败**，而且这次**没有集成方兜底的路**（解耦基线禁止注入） |
| E54 | `R\docs\research\更新系统-0.2.0升级与发布侧自动跟随.md:53` | 「夹具真伪…junction 会让包内 `import.meta.url` 落回本仓、包就解析不到假范围（实测复现 `unknown-profile`）」 | **成立且同机制**：当时只当成「夹具陷阱」，未识别为**开发态挂载的必然结果**（本次把它接到了 AGENTS.md 的 Junction 开发流上） |
| E55 | `R\docs\research\更新系统-更新包真身核查.md:112` | 「产物要求该包必须位于**目标插件包之内**：…实测平级安装（`<profile>/node_modules/dsh-plugin-update`）→ `unknown-profile`；嵌在 `<profile>/node_modules/dsh-im-companion/node_modules/` 内才正常」 | **已被 0.2.0+ 取代**（那是 0.1.1 的 `containingPackage` 行为）。0.13.0 平级安装**完全正常**（本机 `.pnpm` 无条目、平级 real-dir 也能反推） |
| E56 | `R\docs\research\更新系统-更新包真身核查.md:44, 167` | 错误码表：`unknown-profile` ⇒ `reader.js:120,129`；`host.js:85`（错误通道） | **行号失效 + 缺一条**：0.13.0 为 `reader.js:178/187/217`、`host.js:238/245`；码表 14 条（多了 `channel-mismatch`，E10） |
| E57 | `R\docs\research\更新系统-更新包真身核查.md:80` | 「`host.js:142-156` 白名单 13 个…不在表内折叠为 `check-failed`」 | 现为 `host.js:416-436`、**14 条**（0.13.0 多了 `channel-mismatch`）⇒ 数字需更新 |
| E58 | `R\docs\research\验证-V1-T7整改复现.md:46` | 「A `link:` + 目录 junction（= 本机真机形态）⇒ `sourceInstall=true` / `blockedReason='source-install'`」 | **已被 0.2.0+ 取代**：那是本仓自持 reader 的读数。0.13.0 下同一形态**先抛 `unknown-profile`**，只有在注入 `profileDir` 后才落回 `source-install`（本仓 T7-3 断言，E59） |
| E59 | `R\tools\verify\features\update-host.ts:85-99, 277-287` | `/** 造「实装目录越出使用范围」：范围里那条是指向范围外的 junction（realpath 落在外面）。 */` … `assert.equal(outside.error.code, 'unknown-profile', '失败码是包冻结词表里的 unknown-profile：' …)` / `// 集成方的口子：显式交 profileDir（本仓装配不传，只有这类越界布局才需要）⇒ 立刻变成可诊断的 source-install。` / `assert.equal(patched.value.snapshot.blockedReason, 'source-install', …)` | **当前有效，且是本机现状的等价夹具** ⇒ 该行为是「本仓已知/已固化」的，不是新缺陷（结论 7） |
| E60 | `R\tools\verify\features\update-host.ts:163-179` | `test('T7-0 0.9.0 原生解析：不喂 runningVersion/profileDir/readInstalled，仍认得出使用范围与版本' …)` / `assert.equal(st.value.snapshot.runningVersion, '1.2.3', '运行版本由包按包名解析目标包得到')` | 定义了「生产口径 = 零解析类 override」的验收线；夹具刻意用**真拷贝**（`:16-17` 注释）⇒ 与 Junction 形态正交，**不会**在 CI 里暴露本机问题 |

---

## 影响面：真机用户是否会命中

**裁决：按版本号安装的普通用户不会命中；命中面是「实装 realpath 越出 profile 的符号链接/Junction 形态」，本机是其中之一（开发态自找）。**

判据（全部来自 E5/E6/E7/E15/E16）：

1. 反推的**唯一**期望形状是 `<使用范围>\node_modules\<目标包名>`，成功条件是 `lastIndexOf('\node_modules\dsh-im-companion') > 0`。真目录安装（`nodeLinker: hoisted`，E44）在 realpath 前后同形 ⇒ 命中（实测真目录形状 `lastIndexOf = 32/35`）。
2. 失败条件是「按包名能解析到包，但 realpath 之后路径里没有这个 marker」——只有**链接/junction 指到 `<范围>/node_modules/<包名>` 之外**才会出现。本机 = Junction 指到 `D:\dsh-plugin\dsh-im-companion`（E39/E41）。
3. 本机实证旁证：真目录时期（2026-10-11 16:47:32 之前）更新真的装成功过并把状态落在 `hex24(desktop profileDir)` 目录（E47/E48/E49）——那一步**必须**先反推成功。
4. 反例（**推断，未证实**）：pnpm 默认 isolated 布局下 `node_modules\dsh-im-companion` 是指向 `node_modules\.pnpm\dsh-im-companion@x\node_modules\dsh-im-companion` 的链接，realpath 之后**仍含** marker（命中的是最后一段）⇒ 不会抛 `unknown-profile`，反而会把范围反推成 `…\.pnpm\dsh-im-companion@x`（随后大概率落 `source-install`/`invalid-installation`）。本机是 hoisted 且无该形态样本，**未做实证**（见 U1）。
5. 附带面（本仓自己的开发/验收流程）：只要 desktop 是 Junction，
   - 每次打开更新面板 → 挂载自查失败 → 按钮恒红「更新失败，请查看详情」（E32-E34）；
   - **一键更新能力恒为零**（连「已是最新」都读不出来），即**不能在 Junction 态做更新相关的真机验收**，否则会把环境问题误判成产品缺陷（本次即为此）；
   - 其它 9 个特性不受影响（失败只发生在 `imc.update*` 四通电话上，E13/E26）。
6. 严重度建议：**中（开发体验 / 文档正确性 / 验收前置条件）**，非线上 P0；但「开发态必红且无人知晓」会持续消耗排查成本（本次已复现一次）。

---

## 候选修法与归属

> 契约红线复核：`AGENTS.md:40`（宿主不传 `runningVersion`/`profileDir`/`readInstalled`）、`AGENTS.md:28`（生效门 = hash 一致 + 刷新，开发态允许临时 Junction）、`src/host/update.ts:7`（原因码原样透传、不自造第二套词表）、`验证-V3-T8桥诚实性与档位白名单.md:26/33/74`（「桥失败绝不被渲染成已是最新」；已知原因与未知失败必须分得开）。

| 方案 | 具体做法 | 证据 | 代价 / 冲突点 | 归属 |
|---|---|---|---|---|
| **(a) 不修（承认仅开发态）** | 什么都不改 | 结论 5/6：真机不命中；E59 已把该行为钉成预期 | **零代码代价，但必须落文档**：否则每个新 session 都会重演本次排查（AGENTS.md 只教人挂 Junction，E31） | 本仓（文档） |
| **(a′) 文档 + 开发态预检（推荐主体）** | ① `AGENTS.md:28` 旁补一句「Junction 态下更新中心必回 `unknown-profile`（E39/E5），要验更新先用真目录安装」；② 加一条**只读**开发态自检（`scripts/` 或 `tools/verify` 里一个脚本）：`Get-Item …\node_modules\dsh-im-companion` 的 `LinkType === 'Junction'` 时打印同句警告 | E39/E5/E41 | 低：不动产品代码、不动契约、可移除性零影响（纯开发产物，且按 §1⑧ 归自己的命名空间） | 本仓 |
| **(b) 本仓降级 / 隐藏红字** | 在 `toPackageReply`（`view.ts:45-62`）或桥层把 `unknown-profile` 换成别的码 / 吞掉错误 / 渲染成中性态 | E27/E29 | **违反桥诚实性**：`验证-V3` 的 P0 判据是「失败绝不被渲染成已是最新」，而 `unknown-profile` 是**包真实的判词**；吞掉它 = 让面板对真实阻断撒谎；改造第二词表又违 `src/host/update.ts:7`。**不建议** | 本仓（否决） |
| **(c) 包侧修（跨仓建议）** | 让包在「按包名解析成功、但反推不出范围」时给**更准确**的码：这形状语义上就是「源码/链接安装」⇒ 报 `source-install`（或新增专用码），并顺带修 `README:556` 的药方（`readerOverrides.targetPackageDir` **对 Junction 无效**，实测 E41：`packageAtIfNamed(resolve(dir))` 仍走 realpath） | E5/E7/E15/E16/E21/E37；实测：`resolveTargetPackage('dsh-im-companion',{targetPackageDir:'<profile>\node_modules\dsh-im-companion'}).directory` 仍是 `D:\dsh-plugin\dsh-im-companion` ⇒ marker 仍 -1 | 需要包侧改动 + 语义变更（会动「诚实失败」的既有口径与我们的 T7-3 断言 E59）；本仓无法自己改，只能开跨仓 issue。**注意**：这**不会**让 Junction 下更新可用，只是把红字换成一句更真、可行动的话（「源码安装实例，不支持版本更新」） | 上游包作者（本仓出 issue） |
| **(d) 改成真目录安装（放弃即时生效）** | 删掉 Junction，按版本号装进 profile | E39/E44/E48；先例：`docs/research/发布-T9-安装态切换-执行记录.md:66-67`（验收后重建 Junction）、`docs/research/审查-ADV1-收尾方案对抗.md:18`（「Junction 是这个仓的日常开发承重件」） | **唯一能让开发机上更新中心真实可用**的做法；代价 = 失去「改完刷新即生效」，与本仓「热更新优先、无必要绝不重启」的裁定（AGENTS.md:30）冲突；且每次装/卸都要停宿主（`验收-T10-真机验收记录.md:25` 的 `ERR_PNPM_EPERM`） | 本仓（流程/验收期临时） |
| **(e) 双轨（推荐落地形态）** | 日常开发保持 Junction + 接受更新中心红字（(a′) 文档化）；**只在更新相关验收/发布前体检时**切真目录（(d)），验收后切回 | E47/E48/E49（真目录期反推可用已实证）；先例 T9/T10 | 需要一条明确的「切真目录 → 验更新 → 切回」清单；成本是两次重装 + 重启 | 本仓 |

**建议的 issue 归属结论**：本仓开一张票（文档 + 开发态预检 + 验收前置条件，方案 a′+e）；另开一张**跨仓**建议票给 `dsh-plugin-update`（方案 c：越界实装报 `source-install` 而非 `unknown-profile`，并修 README 排错 13 的无效药方）。**不建议**任何「本仓单方面隐藏/降级红字」的改法。

---

## 未证实项与最小验证实验

| # | 未证实项 | 我的判断（标注推断） | 最小验证实验（只读 / 临时目录） |
|---|---|---|---|
| U1 | pnpm **isolated**（`.pnpm` 符号链接）布局的读数 | **推断**：不会抛 `unknown-profile`，而会反推出 `…\.pnpm\dsh-im-companion@<ver>`（marker 在 realpath 后仍命中末段），随后落 `source-install` 或 `invalid-installation` | 在 `%TEMP%` 造 `<T>/profiles/p/node_modules/.pnpm/dsh-im-companion@1.0.0/node_modules/dsh-im-companion` + 外层 `node_modules\dsh-im-companion` 链接，调 `reader.js` 的 `resolveTargetPackage` + 复算 marker（不改任何真机路径） |
| U2 | 「真机用户 100% 是 real-dir」 | **推断**（依据 E44 hoisted + E45 兄弟插件全 real-dir + E48 本机历史 + 文档 T9/T10 记录）；只抽查了本机一个 profile | 下一次用户日志出现同类报错时，读其 profile 的 `pnpm-workspace.yaml` 的 `nodeLinker` 与 `Get-Item … -Force` 的 `LinkType`（只读） |
| U3 | 本机抛的是 `:245` 而非 `:238` | **强推断**：`resolveTargetPackage` 实测成功（E41）+ 仓库版本 `0.2.8` 过 `validReleaseVersion`（`service.js` 原文：`if (dash < 0) return validVersion(v);`）⇒ `:238` 不触发。未在宿主进程内插桩（不允许） | 临时目录夹具里把 anchor 设成 `<范围>\node_modules\dsh-im-companion` 的真目录 → 应成功；再把外包改成指向范围外的 junction → 应复现同码（即 `update-host.ts:277-287` 的既有用例；跑 `node --test tools/verify/features/update-host.ts`） |
| U4 | 面板展开后的完整文案未截图 | 日志（E12）+ 包内文案映射（E32-E36）足以判定链路；按「诊断取证纪律」未让用户开控制台，也未取面板 DOM | 需要时由用户点击按钮截图（唯一允许的用户动作），或读 `<DSH_HOME>/logs/…` 中 `host.call.fail` 的 `errorHash` 是否仍为 `ec4e4693` |
| U5 | `before.json` 那次安装的**目标版本**未落盘（`targetVersion` 字段为空） | **推断**：时间为 2026-10-11 16:47:32、profile 当时声明 `0.2.6`、当日 16:27:46 的提交是 `release: 0.2.8`（`git log`）⇒ 目标大概率是 0.2.7/0.2.8 | 只读：`git log --date=iso --pretty='%h %ad %s' -3`（已取）+ 比对 npm 上的发布时间；无需动真机 |

---

## 复现与观测点

**A. 三步只读复现（不需要面板、不需要日志）**

```powershell
# ① 形态：是不是 Junction（根因载体）
Get-Item "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-im-companion" -Force |
  Select-Object FullName, LinkType, Target, CreationTime

# ② 包会解析到哪（Node 按 realpath）
node -e "const{createRequire}=require('node:module');const r=createRequire(process.env.USERPROFILE+'\\.dsh\\profiles\\desktop\\node_modules\\dsh-plugin-update\\dist\\reader.js');console.log(r.resolve('dsh-im-companion/package.json'))"

# ③ 反推判据（等于包内 tryInferProfileDir 的那一行）
#    marker = '\node_modules\dsh-im-companion'；②的输出里 lastIndexOf(marker) = -1 ⇒ 必抛 unknown-profile
```

**B. 日志观测点**（`<DSH_HOME>\logs\dsh-im-companion\YYYY-MM-DD.log`）

- 失败链（每次挂载 2 行，成对出现）：`host.update.tap` → 内层 `host.call.fail`（带 `errorHash":"ec4e4693"`、`kind":"update-status"`）+ `host.rpc.fail`（`code":"unknown-profile"`）。
- 判定口诀：`errorHash == ec4e4693` ⇔ 包内 `unknownProfile()` 抛出（E8）⇒ 与「范围反推失败」同类；若看到别的 hash 就要重新定位（`reader.js` 快照通道不走这里）。
- 健康对照：正常一次 `imc.updateStatus` 会落 `host.call`（`ok:true`）——该事件在**调试开关关着时不落盘**（`debug` 级），要看成功明细需把 `<DSH_HOME>\logs\log-switch-dsh-im-companion.json` 的 `enabled` 打开。

**C. 状态目录观测点（判断「上次更新是在什么形态下成功的」）**

- 目录：`<DSH_HOME>\updates\dsh-im-companion\<shortHash(profileDir)>`（E46）。算 `sha256(profileDir).slice(0,24)` 与目录名比对即知当时用的是哪个范围。
- 本机实例：`7ece3b35f7f84996bfa84dc8` ⇔ `C:\Users\辰辰洋洋\.dsh\profiles\desktop`（E47）；`before.json` mtime 16:47:32 早于 Junction 17:12:36 ⇒ 反推当时可用。

**D. 需要重现同一失败（临时目录夹具，不碰真机）**

`node --test tools/verify/features/update-host.ts` 的 T7-3 第三段（`installPluginOutside`，`update-host.ts:85-99`）就是等价夹具：范围外的 junction ⇒ `unknown-profile`；补 `readerOverrides:{profileDir}` ⇒ `source-install`。这条用例**只读本仓、只写 `%TEMP%`**。

---

## 复现/取证过程中未触碰的东西（自证只读）

- 本仓：只新增本文件；`src/`、`tools/`、`package.json`、`docs/research/INDEX.md` 等**一行未改**（`git status` 里的既有改动全部是本次会话之前就存在的）。
- 真机：未改 `~/.dsh` 任何文件、未装卸任何插件、未重启宿主；对出库产物的调用只用只读入口（`resolveTargetPackage` / `resolveProfileName` / marker 复算），未触发任何 `status()`/`check()`/`install()`（因此不会写锁、不会打网络、不会写 `updates/` 目录）。
- 唯一在本仓之外落盘的东西：`%TEMP%\imc-*.mjs`（两个只读探针脚本），可随时删除。

---

## 真目录实跑（#126，2026-10-15 · 补 U3 与真目录形态的实跑证据）

**判据不是一个固定数**：`marker = path.sep + 'node_modules' + path.sep + <目标包名>`，门是 `dir.lastIndexOf(marker) > 0`。
本文件第 25/137 行记的「32/35」与 #126 实测的「39」是同一条判据在**不同路径长度**下的读数，两个都 > 0 ⇒ 结论一致。**拿数字当验收门是错的，要拿「> 0 与否」当门。**

**实跑 A（真目录形态 ⇒ 反推成功）**：临时目录里造 `<T>/profiles/web/node_modules/dsh-im-companion`（插件真拷贝）＋ `<T>/node_modules/dsh-plugin-update`（更新包真拷贝，保证解析链完整），只读调用包根导出的 `resolveTargetPackage`：

```
directory = D:\temp\imc-realdir-1Nrgfs\profiles\web\node_modules\dsh-im-companion
marker    = \node_modules\dsh-im-companion
lastIndexOf(marker) = 39 > 0  ⇒ inferred = D:\temp\imc-realdir-1Nrgfs\profiles\web   （真安装：可用）
```

**实跑 B（本机 Junction ⇒ 反推失败）**：

```
directory = D:\dsh-plugin\dsh-im-companion          （realpath，链接目标）
lastIndexOf(marker) = -1 ⇒ inferred = null ⇒ 包在 dist/host.js:245 抛 unknown-profile
```

⇒ **U3 结案**：真机上 `resolveTargetPackage` **解析成功**（B 拿得到 directory）而反推失败 ⇒ 命中的是 `:245`，不是 `:238` 的 `runningVersion` 分支。
⇒ **真目录形态结案**：A 实测命中（判据 `> 0` 成立）。**U1 原样保留**（pnpm isolated 的 `.pnpm` 符号链接布局仍未实证）。

**自动化钉子（本仓）**：`tools/verify/features/update-host.ts` 的 `T7-3b` 用**包的真行为**双向钉住本仓判据——真安装夹具 ⇒ `precheckInstall` 回 `profile-install` 且 `dir === realpathSync(PLUGIN_DIR)`；越界夹具 ⇒ 包回 `unknown-profile`、本仓回 `dev-source` 且 `dir === realpathSync(OUTSIDE_DIR)`。包改 `tryInferProfileDir` 而本仓不跟 ⇒ 该用例当场红。

**探针**：`%TEMP%` 下的一次性只读脚本（同上一节口径：只调 `resolveTargetPackage`，不写锁、不打网络、不写 `updates/`）。
