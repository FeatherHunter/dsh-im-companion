# T6 #166 原型挂载：把 dsh-persona-inject-proto 插进 desktop profile，走 HMR 热加载（不重启 DSH）。
# 顺序（重要）：备份 -> 改 profile package.json dependencies（加 link:）-> 建 node_modules Junction -> 追加 cordis.patch.yml 条目。
# 只有最后一步会触发 HMR reconcile；前三步只是静态文件改动。
# 卸载：unmount.ps1（恢复备份 + 删 Junction）。
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$nl = [Environment]::NewLine
$lf = [string][char]10

$ProtoDir = $PSScriptRoot
$ProfileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$ProfileManifest = Join-Path $ProfileDir 'package.json'
$PatchFile = Join-Path $ProfileDir 'cordis.patch.yml'
$Junction = Join-Path $ProfileDir 'node_modules\dsh-persona-inject-proto'
$EntryMarker = 'persona-inject-proto'
$EvidenceFile = Join-Path $ProtoDir 'evidence.jsonl'

foreach ($required in @($ProfileManifest, $PatchFile)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "缺少 profile 文件：$required" }
}
if (-not (Test-Path -LiteralPath (Join-Path $ProtoDir 'index.js'))) { throw "原型目录不完整：$ProtoDir" }

# ---- 0) 备份（原型目录 backup\ + D:\Temp 各一份）----
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $ProtoDir ('backup\' + $stamp)
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item -LiteralPath $ProfileManifest -Destination (Join-Path $backup 'package.json') -Force
Copy-Item -LiteralPath $PatchFile -Destination (Join-Path $backup 'cordis.patch.yml') -Force
$tempBackup = Join-Path 'D:\Temp' ('166-profile-backup-' + $stamp)
New-Item -ItemType Directory -Path $tempBackup -Force | Out-Null
Copy-Item -LiteralPath $ProfileManifest -Destination (Join-Path $tempBackup 'package.json') -Force
Copy-Item -LiteralPath $PatchFile -Destination (Join-Path $tempBackup 'cordis.patch.yml') -Force
@{
  stamp = $stamp
  profileDir = $ProfileDir
  packageJsonSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $ProfileManifest).Hash
  cordisPatchSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $PatchFile).Hash
  protoDir = $ProtoDir
  evidenceFile = $EvidenceFile
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backup 'backup-manifest.json') -Encoding utf8
Write-Host "BACKUP $backup"
Write-Host "BACKUP-TEMP $tempBackup"

# ---- 1) profile package.json：dependencies 加 link: ----
$manifest = Get-Content -LiteralPath $ProfileManifest -Raw | ConvertFrom-Json
if (-not $manifest.PSObject.Properties['dependencies']) {
  $manifest | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{})
}
$linkValue = 'link:' + $ProtoDir
$depProp = $manifest.dependencies.PSObject.Properties['dsh-persona-inject-proto']
if ($depProp -and $depProp.Value -eq $linkValue) {
  Write-Host 'DEP-OK already present'
} else {
  $manifest.dependencies | Add-Member -NotePropertyName 'dsh-persona-inject-proto' -NotePropertyValue $linkValue -Force
  $json = $manifest | ConvertTo-Json -Depth 100
  [IO.File]::WriteAllText($ProfileManifest, $json + $nl, $utf8)
  Write-Host "DEP-ADDED $linkValue"
}

# ---- 2) node_modules Junction：只删链接、绝不递归 ----
if (Test-Path -LiteralPath $Junction) {
  $item = Get-Item -LiteralPath $Junction -Force
  if ($item.LinkType -eq 'Junction') {
    $target = @($item.Target)[0]
    if ([IO.Path]::GetFullPath($target) -eq [IO.Path]::GetFullPath($ProtoDir)) {
      Write-Host 'JUNCTION-OK already present'
    } else {
      [IO.Directory]::Delete($Junction, $false)
      New-Item -ItemType Junction -Path $Junction -Target $ProtoDir | Out-Null
      Write-Host "JUNCTION-RETARGETED $target -> $ProtoDir"
    }
  } else {
    throw "目标已是普通目录（不是 Junction），拒绝递归删除：$Junction；请先人工确认后再移除。"
  }
} else {
  New-Item -ItemType Junction -Path $Junction -Target $ProtoDir | Out-Null
  Write-Host "JUNCTION-CREATED $Junction -> $ProtoDir"
}

# ---- 3) cordis.patch.yml：追加 insert 条目（唯一触发 HMR 的一步）----
$patchText = Get-Content -LiteralPath $PatchFile -Raw
if ($patchText -match [regex]::Escape($EntryMarker)) {
  Write-Host 'PATCH-OK entry already present'
} else {
  # 新增条目的正确形态是 insert 补丁：裸 - id/name 会被当成“修改已存在条目”，
  # 目标不存在就 warn 跳过（console 不可见），必须 - insert: [{...}] 才真正插入。
  $block = @(
    ''
    '- insert:'
    '    - id: persona-inject-proto'
    '      name: dsh-persona-inject-proto'
    '      config:'
    "        dshHome: '$env:USERPROFILE\.dsh'"
    "        evidenceFile: '$EvidenceFile'"
    '        refreshIntervalMs: 1000'
  ) -join $nl
  $separator = if ($patchText.EndsWith($lf) -or $patchText.EndsWith($nl)) { '' } else { $nl }
  [IO.File]::AppendAllText($PatchFile, $separator + $block + $nl, $utf8)
  Write-Host 'PATCH-APPENDED (HMR reconcile starts now)'
}

Write-Host ''
Write-Host 'MOUNT-OK'
Write-Host '  等 3-5 秒后检查证据文件是否出现 plugin.load 事件：'
Write-Host "  $EvidenceFile"
Write-Host "  Get-Content -LiteralPath '$EvidenceFile' -ErrorAction SilentlyContinue | Select-Object -First 3"
