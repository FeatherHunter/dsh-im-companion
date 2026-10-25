# T6 #166 原型卸载：恢复挂载前的 profile 备份，并删掉 node_modules Junction（只删链接，绝不递归）。
# 默认用本目录 backup\ 下最新一份备份；也可用 -BackupDir 指定。
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$ProtoDir = $PSScriptRoot
$ProfileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$ProfileManifest = Join-Path $ProfileDir 'package.json'
$PatchFile = Join-Path $ProfileDir 'cordis.patch.yml'
$Junction = Join-Path $ProfileDir 'node_modules\dsh-persona-inject-proto'

$backupRoot = Join-Path $ProtoDir 'backup'
$latest = Get-ChildItem -LiteralPath $backupRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $latest) { throw "找不到备份目录：$backupRoot" }
$manifestFile = Join-Path $latest.FullName 'backup-manifest.json'
if (-not (Test-Path -LiteralPath $manifestFile)) { throw "备份不完整（缺 backup-manifest.json）：$($latest.FullName)" }
$meta = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json

# ---- 1) 恢复 profile 文件（最后动 patch 文件，触发 HMR 热卸载）----
Copy-Item -LiteralPath (Join-Path $latest.FullName 'package.json') -Destination $ProfileManifest -Force
Copy-Item -LiteralPath (Join-Path $latest.FullName 'cordis.patch.yml') -Destination $PatchFile -Force

$manifestOk = (Get-FileHash -Algorithm SHA256 -LiteralPath $ProfileManifest).Hash -eq $meta.packageJsonSha256
$patchOk = (Get-FileHash -Algorithm SHA256 -LiteralPath $PatchFile).Hash -eq $meta.cordisPatchSha256
Write-Host ("RESTORE package.json " + $(if ($manifestOk) { 'HASH-OK' } else { 'HASH-MISMATCH' }))
Write-Host ("RESTORE cordis.patch.yml " + $(if ($patchOk) { 'HASH-OK' } else { 'HASH-MISMATCH' }))

# ---- 2) 删 Junction（只删链接）----
if (Test-Path -LiteralPath $Junction) {
  $item = Get-Item -LiteralPath $Junction -Force
  if ($item.LinkType -eq 'Junction') {
    [IO.Directory]::Delete($Junction, $false)
    Write-Host 'JUNCTION-REMOVED'
  } else {
    Write-Host "SKIP-JUNCTION 是普通目录，未删除：$Junction"
  }
} else {
  Write-Host 'JUNCTION-ABSENT'
}

Write-Host ''
Write-Host 'UNMOUNT-OK'
if (-not ($manifestOk -and $patchOk)) {
  Write-Host "  注意：恢复后 hash 与备份清单不一致，请核对 $($latest.FullName)"
  exit 2
}
