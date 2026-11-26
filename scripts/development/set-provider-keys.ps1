# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

<#
Nhập key và base URL của provider (Anthropic, OpenAI, Google Gemini) vào một file trên máy Dev, ngoài Git, để mọi
worktree và phiên làm việc nạp lại khi cần. Key của cổng trung gian (proxy) do PO tự cấp được dùng để test và phát
triển (PO, 26/11/2026). Mọi câu trả lời, kể cả base URL và y/N, gõ ẩn (Read-Host -AsSecureString): lỡ dán key vào
câu hỏi khác thì key cũng không hiện trên màn hình; không câu trả lời nào vào history.

Dùng (PowerShell, từ gốc repo hoặc một worktree):
  powershell -ExecutionPolicy Bypass -File scripts\development\set-provider-keys.ps1 [-Check] [-Path <file>]
    (không cờ) hỏi key, base URL từng provider rồi ghi file; Enter giữ giá trị đang có
    -Check     chỉ báo dạng key (độ dài, loại tiền tố), base URL đã che host và quyền đọc của file; không in giá trị
    -Path      file khác; mặc định $env:SIRES_PROVIDER_KEYS_FILE, nếu trống thì <checkout chính>\.sires\provider-keys.env

File dạng dotenv (UTF-8, LF), mỗi provider là một kết nối: key chỉ được gửi tới base URL của chính kết nối đó
(SCOPE-13, kiến trúc 8.2). Base URL trống nghĩa là endpoint chính thức.
  ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY            key của kết nối
  SIRES_BASE_URL_ANTHROPIC, SIRES_BASE_URL_OPENAI, SIRES_BASE_URL_GOOGLE   base URL (OpenAI gồm /v1)
  ANTHROPIC_API_KEY_OFFICIAL, OPENAI_API_KEY_OFFICIAL, GEMINI_API_KEY_OFFICIAL
                                                               key chính thức riêng, chỉ gửi tới endpoint chính thức
Thư mục .sires có .gitignore riêng (*) nên Git luôn bỏ qua; quyền đọc của thư mục và file chỉ còn user hiện tại.

Nạp vào phiên hiện tại (không cần chạy script):
  PowerShell: Get-Content -LiteralPath '<file>' | ForEach-Object { if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { Set-Item -LiteralPath "env:$($Matches[1])" -Value $Matches[2].Trim().Trim("'").Trim('"') } }
  Git Bash:   set -a; . '<file>'; set +a
Script của SPK-01 tự đọc file khi biến môi trường chưa có key (apps\agent-core\spikes\spk-01\common.py).
#>
param(
  [switch]$Check,
  [string]$Path
)

$ErrorActionPreference = 'Stop'

$Providers = @(
  @{ Id = 'anthropic'; Label = 'Anthropic'; Key = 'ANTHROPIC_API_KEY'; Url = 'SIRES_BASE_URL_ANTHROPIC'; Official = 'ANTHROPIC_API_KEY_OFFICIAL'; Legacy = 'SPK01_BASE_URL_ANTHROPIC'; Hint = 'không có /v1' },
  @{ Id = 'openai'; Label = 'OpenAI'; Key = 'OPENAI_API_KEY'; Url = 'SIRES_BASE_URL_OPENAI'; Official = 'OPENAI_API_KEY_OFFICIAL'; Legacy = 'SPK01_BASE_URL_OPENAI'; Hint = 'kết thúc bằng /v1' },
  @{ Id = 'google'; Label = 'Google Gemini'; Key = 'GEMINI_API_KEY'; Url = 'SIRES_BASE_URL_GOOGLE'; Official = 'GEMINI_API_KEY_OFFICIAL'; Legacy = 'SPK01_BASE_URL_GOOGLE'; Hint = 'không có /v1beta' }
)
$Names = @()
foreach ($p in $Providers) { $Names += $p.Key, $p.Url, $p.Official }

function Step($t) { Write-Host ''; Write-Host "== $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  [ok]    $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  [lưu ý] $t" -ForegroundColor Yellow }

function Get-MainCheckout {
  $common = & git -C $PSScriptRoot rev-parse --path-format=absolute --git-common-dir 2>$null
  if ($LASTEXITCODE -eq 0 -and $common) { return (Split-Path -Parent ([string]$common).Trim()) }
  return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

function Read-KeysFile($file) {
  $values = [ordered]@{}
  if (-not (Test-Path -LiteralPath $file)) { return $values }
  foreach ($line in [IO.File]::ReadAllLines($file)) {
    if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $values[$Matches[1]] = $Matches[2].Trim().Trim("'").Trim('"')
    }
  }
  return $values
}

function ConvertFrom-Secure($secure) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-Shape($key) {
  if (-not $key) { return 'chưa có' }
  $kind = 'không theo tiền tố của provider'
  if ($key.StartsWith('AIza')) { $kind = 'AIza… (dạng key Google)' }
  if ($key.StartsWith('sk-')) { $kind = 'sk-… (dạng key OpenAI hoặc key cổng trung gian)' }
  if ($key.StartsWith('sk-proj-')) { $kind = 'sk-proj-… (dạng key dự án OpenAI)' }
  if ($key.StartsWith('sk-ant-')) { $kind = 'sk-ant-… (dạng key Anthropic)' }
  return "$($key.Length) ký tự, $kind"
}

function Get-UrlShape($url) {
  if (-not $url) { return 'endpoint chính thức' }
  try {
    $u = [Uri]$url
    $path = $u.AbsolutePath.TrimEnd('/')
    return "$($u.Scheme)://[host]$path"
  } catch { return 'không phải URL hợp lệ' }
}

function Test-KeyValue($key) {
  if ($key.Length -lt 8) { return 'quá ngắn (dưới 8 ký tự)' }
  if ($key -match "[\s'`"\\`$]") { return 'chứa khoảng trắng, dấu nháy, \ hoặc $' }
  return $null
}

function Test-UrlValue($url, $p) {
  $u = $null
  if (-not [Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$u)) { return 'không phải URL tuyệt đối' }
  if ($url -match "[\s'`"\\`$]") { return 'chứa khoảng trắng, dấu nháy, \ hoặc $' }
  $loopback = @('localhost', '127.0.0.1', '[::1]') -contains $u.Host
  if ($u.Scheme -ne 'https' -and -not ($u.Scheme -eq 'http' -and $loopback)) { return 'phải là https:// (http:// chỉ cho localhost)' }
  if ($u.Query -or $u.Fragment) { return 'không được có ?query hoặc #fragment' }
  return $null
}

function Read-Secret($prompt, $hasValue) {
  $suffix = if ($hasValue) { ' (Enter = giữ key đang có)' } else { ' (Enter = bỏ trống)' }
  while ($true) {
    $plain = Read-Hidden "$prompt$suffix"
    if (-not $plain) { return $null }
    $problem = Test-KeyValue $plain
    if (-not $problem) { Write-Host "    -> $(Get-Shape $plain)"; return $plain }
    Warn "Key $problem; nhập lại."
  }
}

# Every answer is read hidden: a key pasted at the wrong prompt never shows on screen.
function Read-Hidden($prompt) {
  return (ConvertFrom-Secure (Read-Host -AsSecureString "  $prompt")).Trim()
}

function Read-Choice($prompt, $allowed) {
  while ($true) {
    $a = (Read-Hidden $prompt).ToLower()
    if (-not $a) { return '' }
    if ($allowed -contains $a) { Write-Host "    -> $a"; return $a }
    Warn "Gõ một trong: $($allowed -join ', ') (Enter = mặc định). Câu trả lời vừa rồi không hiện ra và không được lưu."
  }
}

function Read-BaseUrl($p, $current) {
  $state = if ($current) { "đang có $(Get-UrlShape $current)" } else { 'đang là endpoint chính thức' }
  while ($true) {
    $raw = Read-Hidden "Base URL $($p.Label) ($($p.Hint); $state; Enter = giữ, - = endpoint chính thức)"
    if (-not $raw) { return $current }
    if ($raw -eq '-') { return '' }
    if ($raw -notmatch '://') { Warn 'Đây không phải URL (có thể là key): không lưu, nhập lại base URL.'; continue }
    $url = $raw.TrimEnd('/')
    $problem = Test-UrlValue $url $p
    if ($problem) { Warn "Base URL $problem; nhập lại."; continue }
    if ($p.Id -eq 'openai' -and -not $url.EndsWith('/v1')) {
      $a = Read-Choice 'Base URL OpenAI thường kết thúc bằng /v1 (SDK nối /chat/completions vào sau). Vẫn dùng? [y/N]' @('y', 'n')
      if ($a -ne 'y') { continue }
    }
    Write-Host "    -> $(Get-UrlShape $url)"
    return $url
  }
}

function Protect-Path($target, [switch]$Directory) {
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $grant = if ($Directory) { "*${sid}:(OI)(CI)F" } else { "*${sid}:F" }
  $out = & icacls $target /inheritance:r /grant:r $grant 2>&1
  if ($LASTEXITCODE -ne 0) { throw "icacls không đặt được quyền cho ${target}: $out" }
}

function Show-Access($target) {
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $acl = Get-Acl -LiteralPath $target
  $others = @($acl.Access | Where-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $sid })
  if ($acl.AreAccessRulesProtected -and $others.Count -eq 0) { Ok "Quyền: chỉ user hiện tại ($env:USERNAME)" }
  else { Warn "Quyền: còn $($others.Count) mục ngoài user hiện tại hoặc còn kế thừa; chạy lại script (không cờ) để đặt lại" }
}

function Show-State($file, $values) {
  Step "File $file"
  if (-not (Test-Path -LiteralPath $file)) { Warn 'Chưa có file'; return }
  Show-Access $file
  foreach ($p in $Providers) {
    Write-Host "  $($p.Label):"
    Write-Host "    $($p.Key) = $(Get-Shape $values[$p.Key])"
    Write-Host "    $($p.Url) = $(Get-UrlShape $values[$p.Url])"
    if ($values[$p.Official]) { Write-Host "    $($p.Official) = $(Get-Shape $values[$p.Official])" }
  }
  $keys = @($Providers | ForEach-Object { $values[$_.Key] } | Where-Object { $_ })
  if ($keys.Count -gt 1 -and @($keys | Select-Object -Unique).Count -eq 1) { Write-Host '  Các provider dùng cùng một key.' }
  $user = @($Names + ($Providers | ForEach-Object { $_.Legacy }) + 'GOOGLE_API_KEY' | Where-Object { [Environment]::GetEnvironmentVariable($_, 'User') })
  if ($user.Count) {
    Warn "Biến cấp User đang có: $($user -join ', '). Script SPK-01 ưu tiên biến môi trường hơn file; khác file thì chạy lại script để ghi đè hoặc xóa."
  }
}

if (-not $Path) { $Path = $env:SIRES_PROVIDER_KEYS_FILE }
if (-not $Path) { $Path = Join-Path (Get-MainCheckout) '.sires\provider-keys.env' }
$Path = [IO.Path]::GetFullPath($Path)
$Dir = Split-Path -Parent $Path
$values = Read-KeysFile $Path

if ($Check) { Show-State $Path $values; exit 0 }

Step 'Nhập key và base URL'
Write-Host "  File: $Path"
Write-Host '  Mọi câu trả lời đều gõ ẩn, kể cả base URL và y/N (dán bằng chuột phải hoặc Ctrl+V); script in lại dạng đã'
Write-Host '  nhận (độ dài key, URL đã che host). Base URL trống = endpoint chính thức của provider.'
$shared = $null
$set = @($Providers | ForEach-Object { $values[$_.Key] } | Where-Object { $_ })
$haveShared = ($set.Count -eq $Providers.Count) -and (@($set | Select-Object -Unique).Count -eq 1)
$hint = if ($haveShared) { 'Enter = giữ key dùng chung đang có, - = nhập riêng từng provider' } else { 'Enter = nhập riêng từng provider' }
while ($true) {
  $k = Read-Hidden "Key dùng chung cho cả ba provider, ví dụ key của cổng trung gian ($hint)"
  if (-not $k) { if ($haveShared) { $shared = $set[0] }; break }
  if ($k -eq '-') { break }
  $problem = Test-KeyValue $k
  if (-not $problem) { $shared = $k; break }
  Warn "Key $problem; nhập lại."
}
if ($shared) { Write-Host "    -> key dùng chung: $(Get-Shape $shared)" }
foreach ($p in $Providers) {
  Write-Host ''
  Write-Host "  -- $($p.Label)" -ForegroundColor Cyan
  if ($null -ne $shared) { $values[$p.Key] = $shared }
  else {
    $k = Read-Secret "Key $($p.Label) ($($p.Key))" ([bool]$values[$p.Key])
    if ($k) { $values[$p.Key] = $k }
  }
  $values[$p.Url] = Read-BaseUrl $p $values[$p.Url]
}

Write-Host ''
$a = Read-Choice 'Có key chính thức riêng (gửi thẳng tới endpoint chính thức, không qua cổng) để so sánh không? [y/N]' @('y', 'n')
if ($a -eq 'y') {
  foreach ($p in $Providers) {
    $k = Read-Secret "Key chính thức $($p.Label) ($($p.Official))" ([bool]$values[$p.Official])
    if ($k) { $values[$p.Official] = $k }
  }
}

Step 'Ghi file'
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$utf8 = New-Object Text.UTF8Encoding $false
[IO.File]::WriteAllText((Join-Path $Dir '.gitignore'), "# Key provider của máy Dev (scripts/development/set-provider-keys.ps1): Git bỏ qua cả thư mục.`n*`n", $utf8)
Protect-Path $Dir -Directory
$lines = @(
  '# Key provider của máy Dev: scripts/development/set-provider-keys.ps1. Không commit, không chép vào log hay evidence.',
  '# Mỗi provider là một kết nối: key chỉ gửi tới base URL của chính nó; base URL trống = endpoint chính thức.'
)
foreach ($p in $Providers) {
  $lines += ''
  $lines += "# $($p.Label)"
  foreach ($n in @($p.Key, $p.Url, $p.Official)) { if ($values[$n]) { $lines += "$n='$($values[$n])'" } }
}
$tmp = "$Path.tmp"
[IO.File]::WriteAllText($tmp, (($lines -join "`n") + "`n"), $utf8)
Protect-Path $tmp
Move-Item -LiteralPath $tmp -Destination $Path -Force
Protect-Path $Path
Ok "Đã ghi $Path"

$user = @($Names + ($Providers | ForEach-Object { $_.Legacy }) + 'GOOGLE_API_KEY' | Where-Object { [Environment]::GetEnvironmentVariable($_, 'User') })
Write-Host ''
if ($user.Count) { Warn "Biến cấp User đang có: $($user -join ', '). Biến môi trường được ưu tiên hơn file." }
Write-Host '  Biến môi trường cấp User (mọi chương trình của bạn đều thấy, kể cả công cụ đọc ANTHROPIC_API_KEY):'
Write-Host '    [N] không đổi (mặc định)   [y] ghi theo file   [x] xóa các biến cấp User ở trên'
$a = Read-Choice 'Chọn [N/y/x]' @('n', 'y', 'x')
if ($a -eq 'y') {
  foreach ($p in $Providers) {
    foreach ($n in @($p.Key, $p.Url, $p.Official)) {
      $v = if ($values[$n]) { $values[$n] } else { $null }
      [Environment]::SetEnvironmentVariable($n, $v, 'User')
    }
    [Environment]::SetEnvironmentVariable($p.Legacy, $null, 'User')
  }
  [Environment]::SetEnvironmentVariable('GOOGLE_API_KEY', $null, 'User')
  Ok 'Đã ghi biến cấp User theo file, xóa tên cũ SPK01_BASE_URL_* và GOOGLE_API_KEY; mở terminal mới để thấy.'
} elseif ($a -eq 'x') {
  foreach ($n in $user) { [Environment]::SetEnvironmentVariable($n, $null, 'User') }
  Ok "Đã xóa $($user.Count) biến cấp User; từ nay script đọc key từ file."
}

Show-State $Path (Read-KeysFile $Path)
$loader = @'
Get-Content -LiteralPath 'FILE' | ForEach-Object { if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { Set-Item -LiteralPath "env:$($Matches[1])" -Value $Matches[2].Trim().Trim("'").Trim('"') } }
'@
$bash = $Path -replace '\\', '/'
if ($bash -match '^([A-Za-z]):(.*)$') { $bash = '/' + $Matches[1].ToLower() + $Matches[2] }
Write-Host ''
Write-Host '  Nạp vào PowerShell đang mở:' -ForegroundColor Cyan
Write-Host ('    ' + $loader.Trim().Replace('FILE', $Path.Replace("'", "''")))
Write-Host '  Nạp vào Git Bash:' -ForegroundColor Cyan
Write-Host "    set -a; . '$bash'; set +a"
