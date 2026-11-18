# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

<#
Dựng môi trường phát triển SIRes trên Windows.
Cách chia: công cụ không cần Docker (Git, Node, pnpm, uv, Python) cài trên Windows; Docker Engine cài trong WSL2
(scripts/development/setup-wsl.sh), test trên Windows gọi nó qua DOCKER_HOST=tcp://localhost:2375.

Dùng (PowerShell, từ gốc repo):
  powershell -ExecutionPolicy Bypass -File scripts\development\setup-windows.ps1 [-Check] [-Yes] [-Distro Ubuntu-24.04] [-SkipWsl] [-SkipDeps]
    -Check     chỉ kiểm và báo, không cài gì
    -Yes       không hỏi lại trước mỗi bước
    -Distro    distro WSL dùng cho Docker (mặc định Ubuntu-24.04)
    -SkipWsl   bỏ qua WSL và Docker
    -SkipDeps  không chạy pnpm install, uv sync

Bước cần quyền admin (bật WSL) mở hộp thoại UAC; bước cần sudo trong WSL hỏi mật khẩu Linux của bạn.
Phiên bản lấy từ repo: Node theo .nvmrc, pnpm theo packageManager trong package.json, Python theo .python-version.
#>
param(
  [switch]$Check,
  [switch]$Yes,
  [string]$Distro = 'Ubuntu-24.04',
  [switch]$SkipWsl,
  [switch]$SkipDeps
)

$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$env:WSL_UTF8 = '1'
$script:Pending = $false

function Step($t) { Write-Host ''; Write-Host "== $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  [ok]    $t" -ForegroundColor Green }
function Todo($t) { Write-Host "  [cần]   $t" -ForegroundColor Yellow; $script:Pending = $true }
function Warn($t) { Write-Host "  [lưu ý] $t" -ForegroundColor Yellow }
function Confirm-Step($q) {
  if ($Check) { return $false }
  if ($Yes) { return $true }
  $a = Read-Host "  $q [y/N]"
  return ($a -eq 'y' -or $a -eq 'Y')
}
function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Winget-Install($id) {
  if (-not (Has 'winget')) { throw "Không có winget; cài 'App Installer' từ Microsoft Store rồi chạy lại." }
  & winget install --id $id --exact --silent --accept-package-agreements --accept-source-agreements
  Refresh-Path
}

$nodeMajor = (Get-Content (Join-Path $Repo '.nvmrc') -Raw).Trim()
$pnpmVersion = ((Get-Content (Join-Path $Repo 'package.json') -Raw | ConvertFrom-Json).packageManager -split '@')[1]
$pyVersion = (Get-Content (Join-Path $Repo '.python-version') -Raw).Trim()
Write-Host "SIRes: Node $nodeMajor, pnpm $pnpmVersion, Python $pyVersion; Docker trong WSL ($Distro)."

# ---------------------------------------------------------------- WSL
if (-not $SkipWsl) {
  Step 'WSL2'
  & wsl.exe --status *> $null
  if ($LASTEXITCODE -ne 0) {
    Todo 'WSL chưa bật'
    if (Confirm-Step 'Bật WSL (wsl --install --no-distribution, cần quyền admin, sau đó phải khởi động lại máy)?') {
      Start-Process wsl.exe -ArgumentList '--install', '--no-distribution' -Verb RunAs -Wait
      Warn 'Khởi động lại Windows rồi chạy lại script này.'
      exit 3
    }
  } else {
    Ok ((& wsl.exe --version | Select-Object -First 1) -join '')
    $distros = @(& wsl.exe -l -q | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($distros -notcontains $Distro) {
      Todo "chưa có distro $Distro"
      if (Confirm-Step "Cài $Distro (wsl --install -d $Distro)? Lần mở đầu tiên bạn tạo tên và mật khẩu Linux.") {
        & wsl.exe --install -d $Distro
        Warn "Mở $Distro một lần để tạo tài khoản Linux, rồi chạy lại script này."
        exit 3
      }
    } else {
      $line = & wsl.exe -l -v | Where-Object { $_ -match [regex]::Escape($Distro) }
      if ($line -match '\s2\s*$') { Ok "$Distro chạy WSL2" } else { Todo "$Distro chưa ở WSL2: wsl --set-version $Distro 2" }
    }
  }
}

# ---------------------------------------------------------------- Công cụ Windows
Step 'Git'
if (Has 'git') { Ok (git --version) } else {
  Todo 'chưa có Git'
  if (Confirm-Step 'Cài Git (winget Git.Git)?') { Winget-Install 'Git.Git'; Ok (git --version) }
}

Step "Node $nodeMajor"
if (Has 'node') {
  $v = (node --version).TrimStart('v')
  if ($v.Split('.')[0] -eq $nodeMajor) { Ok "Node $v" } else { Warn "Node $v, repo cần $nodeMajor (.nvmrc); cài Node $nodeMajor từ nodejs.org hoặc winget OpenJS.NodeJS.LTS" }
} else {
  Todo "chưa có Node"
  if (Confirm-Step 'Cài Node LTS (winget OpenJS.NodeJS.LTS)?') { Winget-Install 'OpenJS.NodeJS.LTS'; Ok "Node $(node --version)" }
}

Step "pnpm $pnpmVersion"
$pv = $null
if (Has 'pnpm') { $pv = (& pnpm --version 2>$null) }
if ($pv -eq $pnpmVersion) { Ok "pnpm $pv" } else {
  Todo "pnpm $pnpmVersion (hiện: $(if ($pv) { $pv } else { 'không có' }))"
  if ((Has 'npm') -and (Confirm-Step "npm install -g pnpm@$pnpmVersion?")) { & npm install -g "pnpm@$pnpmVersion"; Refresh-Path; Ok "pnpm $(pnpm --version)" }
}

Step 'uv'
if (Has 'uv') { Ok (uv --version) } else {
  Todo 'chưa có uv'
  if (Confirm-Step 'Cài uv (winget astral-sh.uv)?') { Winget-Install 'astral-sh.uv'; Ok (uv --version) }
}

Step "Python $pyVersion (do uv quản lý)"
if (Has 'uv') {
  $found = & uv python find $pyVersion 2>$null
  if ($LASTEXITCODE -eq 0 -and $found) { Ok $found } else {
    Todo "chưa có Python $pyVersion"
    if (Confirm-Step "uv python install $pyVersion --no-bin?") { & uv python install $pyVersion --no-bin; Ok (& uv python find $pyVersion) }
  }
}

Step 'Smart App Control'
$sac = $null
try { $sac = (Get-MpComputerStatus -ErrorAction Stop).SmartAppControlState } catch { }
if ($sac -eq 'On') {
  Warn 'Smart App Control đang bật: Windows chặn file .exe do pip/uv sinh (pytest.exe, mypy.exe, shim python3.12.exe).'
  Warn 'Chạy công cụ Python bằng "uv run python -m <tool>" (target Nx của dự án Python đã viết theo cách này).'
} else { Ok "trạng thái: $(if ($sac) { $sac } else { 'không đọc được' })" }

# ---------------------------------------------------------------- Docker trong WSL
if (-not $SkipWsl) {
  Step "Docker Engine trong $Distro"
  $distrosNow = @(& wsl.exe -l -q 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($distrosNow -contains $Distro) {
    $wslScript = (& wsl.exe -d $Distro -e wslpath -a ((Join-Path $PSScriptRoot 'setup-wsl.sh') -replace '\\', '/')).Trim()
    $wslArgs = @()
    if ($Check) { $wslArgs += '--check' }
    if ($Yes) { $wslArgs += '--yes' }
    & wsl.exe -d $Distro -e bash $wslScript @wslArgs
    if ($LASTEXITCODE -ne 0) { $script:Pending = $true }
  } else { Warn "bỏ qua: chưa có $Distro" }

  Step 'DOCKER_HOST cho Windows'
  $dh = [Environment]::GetEnvironmentVariable('DOCKER_HOST', 'User')
  if ($dh -eq 'tcp://localhost:2375') { Ok "DOCKER_HOST=$dh" } else {
    Todo "đặt DOCKER_HOST=tcp://localhost:2375 cho user (hiện: $(if ($dh) { $dh } else { 'chưa đặt' }))"
    if (Confirm-Step 'Đặt biến môi trường user DOCKER_HOST=tcp://localhost:2375?') {
      [Environment]::SetEnvironmentVariable('DOCKER_HOST', 'tcp://localhost:2375', 'User')
      Ok 'đã đặt; cửa sổ terminal mới mới nhận biến này'
    }
  }
  $env:DOCKER_HOST = 'tcp://localhost:2375'
  try {
    $ping = Invoke-RestMethod -Uri 'http://localhost:2375/_ping' -TimeoutSec 5
    Ok "Windows gọi được Docker trong WSL (_ping: $ping)"
  } catch { Warn 'Windows chưa gọi được http://localhost:2375/_ping (WSL tắt, hoặc dockerd chưa mở cổng)' }
}

# ---------------------------------------------------------------- Phụ thuộc của repo
if (-not $SkipDeps) {
  Step 'Phụ thuộc của repo'
  Push-Location $Repo
  try {
    if ((Has 'pnpm') -and (Confirm-Step 'pnpm install?')) { & pnpm install; if ($LASTEXITCODE -ne 0) { throw 'pnpm install lỗi' }; Ok 'pnpm install' }
    elseif ($Check) { Todo 'pnpm install (chạy không kèm -Check)' }
    if ((Has 'uv') -and (Confirm-Step 'uv sync --all-packages?')) { & uv sync --all-packages; if ($LASTEXITCODE -ne 0) { throw 'uv sync lỗi' }; Ok 'uv sync --all-packages' }
    elseif ($Check) { Todo 'uv sync --all-packages (chạy không kèm -Check)' }
  } finally { Pop-Location }
}

Write-Host ''
if ($Check -and $script:Pending) { Write-Host 'Còn bước cần làm (dòng [cần]); chạy lại không kèm -Check để làm.'; exit 1 }
Write-Host 'Xong. Mở terminal mới để nhận PATH và DOCKER_HOST.'
