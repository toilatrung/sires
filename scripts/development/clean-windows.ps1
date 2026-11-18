# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

<#
Dọn môi trường thừa trên Windows cho SIRes. SIRes dùng Node (theo .nvmrc), pnpm, uv và Python do uv cài;
Docker chạy trong WSL. Mặc định chỉ liệt kê, không xóa gì.

Dùng (PowerShell, từ gốc repo):
  powershell -ExecutionPolicy Bypass -File scripts\development\clean-windows.ps1 [-Apply] [-Yes] [-Caches]
    -Apply   xóa các mục đã liệt kê (hỏi từng mục, trừ khi có -Yes)
    -Yes     không hỏi lại từng mục
    -Caches  thêm cache npm, pnpm, uv, pip (tải lại được; lần cài sau chậm hơn)

Không đụng: Node đang dùng, uv và Python do uv cài, Git, gói npm toàn cục, Docker Desktop (chỉ báo nếu có).
Gỡ chương trình đã cài (Python từ python.org, Anaconda…) dùng winget uninstall.
#>
param(
  [switch]$Apply,
  [switch]$Yes,
  [switch]$Caches
)

$ErrorActionPreference = 'Stop'
$items = New-Object System.Collections.Generic.List[object]

function Add-Item($name, $desc, [scriptblock]$action) { $items.Add([pscustomobject]@{ Name = $name; Desc = $desc; Action = $action }) }
function Size-Of($path) {
  if (-not (Test-Path -LiteralPath $path)) { return '0 MB' }
  $s = (Get-ChildItem -LiteralPath $path -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
  if (-not $s) { $s = (Get-Item -LiteralPath $path -Force).Length }
  return ('{0:N0} MB' -f ($s / 1MB))
}
function Installed($pattern) {
  $keys = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
          'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
          'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match $pattern }
}

# --- Shim Python do uv tạo trong ~/.local/bin: Smart App Control chặn; uv vẫn gọi Python thật.
$localBin = Join-Path $env:USERPROFILE '.local\bin'
Get-ChildItem -LiteralPath $localBin -Filter 'python*.exe' -ErrorAction SilentlyContinue | ForEach-Object {
  $f = $_.FullName
  Add-Item "shim $($_.Name)" "Shim Python của uv ($f); không cần, Smart App Control thường chặn" { Remove-Item -LiteralPath $f -Force }.GetNewClosure()
}

# --- Alias python của Microsoft Store: chỉ mở Store, làm công cụ gọi nhầm.
$apps = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps'
foreach ($n in 'python.exe', 'python3.exe') {
  $f = Join-Path $apps $n
  if (Test-Path -LiteralPath $f) {
    Add-Item "alias $n" "Alias App execution của Microsoft Store ($f), tương đương tắt ở Settings > Apps > Advanced app settings > App execution aliases" { Remove-Item -LiteralPath $f -Force }.GetNewClosure()
  }
}

# --- Python cài ngoài uv: SIRes dùng Python do uv cài.
Installed '^(Python \d|Python Launcher)' | ForEach-Object {
  $dn = $_.DisplayName
  Add-Item "app $dn" "Python cài ngoài uv; gỡ bằng winget" { & winget uninstall --name $dn --exact --silent }.GetNewClosure()
}
Installed '^(Anaconda|Miniconda|Miniforge|Mambaforge)' | ForEach-Object {
  $dn = $_.DisplayName
  Add-Item "app $dn" "Bản phân phối conda; gỡ bằng winget" { & winget uninstall --name $dn --exact --silent }.GetNewClosure()
}
foreach ($d in (Join-Path $env:USERPROFILE '.pyenv'), (Join-Path $env:USERPROFILE '.conda'), (Join-Path $env:USERPROFILE 'miniconda3'), (Join-Path $env:USERPROFILE 'anaconda3')) {
  if (Test-Path -LiteralPath $d) {
    $p = $d
    Add-Item $d "Python ngoài uv ($(Size-Of $d))" { Remove-Item -LiteralPath $p -Recurse -Force }.GetNewClosure()
  }
}

# --- Trình quản lý Node khác: dễ đè Node đang dùng.
Installed '^NVM for Windows' | ForEach-Object {
  $dn = $_.DisplayName
  Add-Item "app $dn" "nvm-windows; SIRes dùng một bản Node theo .nvmrc" { & winget uninstall --name $dn --exact --silent }.GetNewClosure()
}

# --- Cache (chỉ khi -Caches).
if ($Caches) {
  if (Get-Command npm -ErrorAction SilentlyContinue) {
    $npmCache = (& npm config get cache).Trim()
    if (Test-Path -LiteralPath $npmCache) { Add-Item 'cache npm' "$npmCache ($(Size-Of $npmCache))" { & npm cache clean --force }.GetNewClosure() }
  }
  if (Get-Command uv -ErrorAction SilentlyContinue) {
    $uvCache = (& uv cache dir).Trim()
    if (Test-Path -LiteralPath $uvCache) { Add-Item 'cache uv' "$uvCache ($(Size-Of $uvCache))" { & uv cache clean }.GetNewClosure() }
  }
  foreach ($d in (Join-Path $env:LOCALAPPDATA 'pnpm-cache'), (Join-Path $env:LOCALAPPDATA 'pip\Cache')) {
    if (Test-Path -LiteralPath $d) {
      $p = $d
      Add-Item "cache $(Split-Path $d -Leaf)" "$d ($(Size-Of $d))" { Remove-Item -LiteralPath $p -Recurse -Force }.GetNewClosure()
    }
  }
}

if (Installed '^Docker Desktop') { Write-Host '! Có Docker Desktop: SIRes dùng Docker Engine trong WSL; nếu không dùng Docker Desktop cho việc khác thì tự gỡ để tránh tranh DOCKER_HOST.' }
Write-Host 'Giữ nguyên: Node đang dùng, uv và Python do uv cài, Git, gói npm toàn cục.'
Write-Host ''
if ($items.Count -eq 0) { Write-Host 'Không có gì cần dọn.'; exit 0 }
$i = 0
foreach ($it in $items) { $i++; Write-Host ('{0,2}. {1,-34} {2}' -f $i, $it.Name, $it.Desc) }
if (-not $Apply) { Write-Host ''; Write-Host 'Chỉ liệt kê. Chạy lại với -Apply để xóa (hỏi từng mục).'; exit 0 }

Write-Host ''
$failed = $false
foreach ($it in $items) {
  Write-Host "- $($it.Name)"
  $go = $Yes
  if (-not $go) { $a = Read-Host '  Xóa? [y/N]'; $go = ($a -eq 'y' -or $a -eq 'Y') }
  if (-not $go) { Write-Host '  bỏ qua'; continue }
  try { & $it.Action | Out-Null; Write-Host '  đã xóa' } catch { Write-Host "  LỖI: $_"; $failed = $true }
}
if ($failed) { exit 1 }
