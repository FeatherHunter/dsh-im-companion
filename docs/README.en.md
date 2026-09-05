<h1 align="center">dsh-im-companion
</h1>

<div align="center">

**English** · [中文](../README.md)

**Give every agent a home — IM Companion handles the rest.**  
A companion for [dsh-im](https://github.com/xmanrui/dsh-im): group Feishu/WeChat/QQ bots by Agent, with left badges, one-click filter, fleet overview and drag-to-move. Clean uninstall.

Your star means a lot.

</div>

## Install

Prerequisites: [DSH](https://www.npmjs.com/package/@deepseek-ai/dsh) + [dsh-im](https://github.com/xmanrui/dsh-im) in the same profile.

Replace `--profile desktop` with `--profile web` if you run self-hosted web.

```bash
npm install -g @deepseek-ai/dsh
dsh plugin --profile desktop add dsh-im
dsh plugin --profile desktop add dsh-im-companion@0.1.0 --registry https://registry.npmjs.org
```

Refresh the page (Ctrl+F5) or hot-reload the plugin. Restart is the last resort.

## What it does

- left-badges: online/offline badges on workspaces
- left-filter: All / With-agent / Unclaimed filter
- session-header: current Agent overlay with shortcuts
- detail-drawer: per-Agent detail cards
- fleet-radar: fleet matrix overview
- adopt: one-click adopt and drag-to-move between homes
- presence: breathing lights
- welcome-banner: friendly home banner

Upstream: [dsh-im](https://github.com/xmanrui/dsh-im). Issues: [here](https://github.com/xmanrui/dsh-im-companion/issues).

MIT © FeatherHunter
