# dsh-im-companion 交互式发布窗口（Windows）
# AI 调用此脚本在用户桌面弹起可见窗口，人只在窗口里按回车 + 浏览器扫码。
# 用法：powershell -ExecutionPolicy Bypass -File scripts/publish-interactive.ps1 [-Version 0.1.0]
param([string]$Version = "")
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $dir
Set-Location $root
if ($Version -ne "") { Write-Host ("release " + $Version) }
npm whoami --registry=https://registry.npmjs.org
if ($LASTEXITCODE -ne 0) { npm login --auth-type=web --registry=https://registry.npmjs.org }
npm publish --registry=https://registry.npmjs.org --auth-type=web
npm view dsh-im-companion version --registry=https://registry.npmjs.org --prefer-online
