# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

<#
Chạy một script của SPK-01 (PID-00021) trên Windows, từ gốc repo:

  powershell -ExecutionPolicy Bypass -File apps\agent-core\spikes\spk-01\run.ps1 capabilities.py [tham số của script]

Dùng Python gốc do uv cài (không dùng .venv của workspace) với PYTHONPATH trỏ thư mục gói của spike,
%LOCALAPPDATA%\sires\spikes\spk-01, cài bằng scripts\development\setup-windows.ps1 -Spikes. Script Python tự đọc key
từ biến môi trường, kể cả biến cấp User vừa đặt, nên không cần mở lại terminal.
Không dùng param(): PowerShell 5.1 hiểu nhầm tham số của script Python (--out, --variants) là tham số của file này.
#>

$ErrorActionPreference = 'Stop'
if ($args.Count -eq 0) { throw 'Thiếu tên script, ví dụ: run.ps1 capabilities.py' }
$Script = [string]$args[0]
$Rest = @($args | Select-Object -Skip 1 | ForEach-Object { [string]$_ })
$Here = $PSScriptRoot
$Repo = (Resolve-Path (Join-Path $Here '..\..\..\..')).Path

$deps = if ($env:SPK01_DEPS) { $env:SPK01_DEPS } else { Join-Path $env:LOCALAPPDATA 'sires\spikes\spk-01' }
if (-not (Test-Path (Join-Path $deps 'anthropic'))) {
  throw "Chưa có gói của spike ở $deps; chạy: powershell -ExecutionPolicy Bypass -File scripts\development\setup-windows.ps1 -Spikes -SkipDeps"
}
$pyVersion = (Get-Content (Join-Path $Repo '.python-version') -Raw).Trim()
$py = (& uv python find --system $pyVersion 2>$null)
if (-not $py) { throw "Không thấy Python $pyVersion do uv cài; chạy: uv python install $pyVersion --no-bin" }
$env:PYTHONPATH = $deps
$env:PYTHONUTF8 = '1'
$env:PYDANTIC_AI_NO_BANNER = '1'
Push-Location $Here
try { & $py (Join-Path $Here $Script) @Rest; exit $LASTEXITCODE } finally { Pop-Location }
