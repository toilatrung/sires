#!/usr/bin/env bash
# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

# Dựng phần môi trường SIRes nằm trong WSL: chỉ Docker Engine. Node, pnpm, uv, Python chạy trên Windows
# (scripts/development/setup-windows.ps1 gọi file này). Chạy được riêng trong WSL hoặc trên Linux.
#
# Dùng: bash scripts/development/setup-wsl.sh [--check] [--yes] [--no-tcp]
#   --check   chỉ kiểm và báo, không đổi gì
#   --yes     không hỏi lại trước các bước cần sudo
#   --no-tcp  không mở Docker API cho Windows ở tcp://127.0.0.1:2375
#
# Các bước: WSL2 và systemd → Docker Engine từ kho apt chính thức của Docker → nhóm docker → (WSL) Docker API
# ở 127.0.0.1:2375 để test trên Windows (Testcontainers) gọi được qua DOCKER_HOST=tcp://localhost:2375.
# Cổng chỉ nghe trên localhost, không có xác thực: mọi tiến trình trên máy đều điều khiển được Docker.

set -euo pipefail

CHECK=0; YES=0; TCP=1
for a in "$@"; do
  case "$a" in
    --check) CHECK=1 ;;
    --yes) YES=1 ;;
    --no-tcp) TCP=0 ;;
    -h|--help) awk 'NR > 5 && /^#/ { sub(/^# ?/, ""); print; next } NR > 5 { exit }' "$0"; exit 0 ;;
    *) echo "Tham số lạ: $a" >&2; exit 2 ;;
  esac
done

TCP_ADDR="127.0.0.1:2375"
DROPIN=/etc/systemd/system/docker.service.d/sires-tcp.conf
NEED_RELOGIN=0
PENDING=0

ok()   { printf '  [ok]    %s\n' "$*"; }
todo() { printf '  [cần]   %s\n' "$*"; PENDING=1; }
warn() { printf '  [lưu ý] %s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
confirm() {
  [ "$YES" = 1 ] && return 0
  local ans; read -r -p "  $* [y/N] " ans || true
  [ "$ans" = y ] || [ "$ans" = Y ]
}

is_wsl() { grep -qi microsoft /proc/version 2>/dev/null; }

step "Hệ điều hành"
. /etc/os-release
ok "$PRETTY_NAME"
if is_wsl; then
  if [ -n "${WSL_INTEROP:-}" ] || grep -q WSL2 /proc/version 2>/dev/null || [ -d /run/WSL ]; then ok "đang chạy trong WSL2"; else warn "có vẻ là WSL1; SIRes cần WSL2 (wsl --set-version <distro> 2)"; fi
else
  warn "không phải WSL: bỏ qua bước mở cổng cho Windows"
  TCP=0
fi
[ "${ID:-}" = ubuntu ] || warn "script viết cho Ubuntu; distro khác có thể phải cài Docker thủ công"

step "systemd"
if [ "$(ps -p 1 -o comm= 2>/dev/null)" = systemd ]; then
  ok "systemd đang chạy"
else
  todo "bật systemd trong /etc/wsl.conf"
  if [ "$CHECK" = 0 ] && is_wsl && confirm "Ghi [boot] systemd=true vào /etc/wsl.conf (cần sudo)?"; then
    if sudo grep -q '^\[boot\]' /etc/wsl.conf 2>/dev/null; then
      sudo sed -i '/^\[boot\]/a systemd=true' /etc/wsl.conf
    else
      printf '\n[boot]\nsystemd=true\n' | sudo tee -a /etc/wsl.conf >/dev/null
    fi
    echo "  Đã ghi. Trên Windows chạy: wsl --shutdown, mở lại WSL rồi chạy lại script này."
    exit 3
  fi
fi

step "Docker Engine"
if command -v docker >/dev/null 2>&1 && dpkg -s docker-ce >/dev/null 2>&1; then
  ok "$(docker --version)"
elif command -v docker >/dev/null 2>&1; then
  warn "có lệnh docker nhưng không phải gói docker-ce của Docker ($(docker --version 2>/dev/null)); giữ nguyên"
else
  todo "cài Docker Engine (docker-ce, compose plugin) từ download.docker.com"
  if [ "$CHECK" = 0 ] && confirm "Cài Docker Engine theo hướng dẫn chính thức của Docker (cần sudo)?"; then
    conflicts=""
    for p in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
      dpkg -s "$p" >/dev/null 2>&1 && conflicts="$conflicts $p"
    done
    if [ -n "$conflicts" ]; then
      echo "  Gói xung đột theo hướng dẫn của Docker:$conflicts"
      confirm "Gỡ các gói trên?" && sudo apt-get remove -y $conflicts
    fi
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
      | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    ok "$(docker --version)"
  fi
fi

if command -v docker >/dev/null 2>&1; then
  if systemctl is-active --quiet docker 2>/dev/null; then
    ok "dịch vụ docker đang chạy"
  else
    todo "bật dịch vụ docker"
    if [ "$CHECK" = 0 ] && confirm "systemctl enable --now docker (cần sudo)?"; then sudo systemctl enable --now docker; fi
  fi
fi

step "Nhóm docker (dùng docker không cần sudo)"
if id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
  ok "$USER thuộc nhóm docker"
else
  todo "thêm $USER vào nhóm docker"
  if [ "$CHECK" = 0 ] && confirm "usermod -aG docker $USER (cần sudo)?"; then
    sudo usermod -aG docker "$USER"
    NEED_RELOGIN=1
  fi
fi

if [ "$TCP" = 1 ]; then
  step "Docker API cho Windows ($TCP_ADDR)"
  if ss -ltn 2>/dev/null | grep -q "$TCP_ADDR"; then
    ok "dockerd đang nghe $TCP_ADDR"
  else
    todo "cho dockerd nghe thêm tcp://$TCP_ADDR (drop-in $DROPIN)"
    if [ "$CHECK" = 0 ]; then
      running=$( (docker ps -q 2>/dev/null || sudo docker ps -q 2>/dev/null) | wc -l)
      [ "$running" -gt 0 ] && warn "khởi động lại docker sẽ dừng $running container đang chạy; container có restart policy tự chạy lại"
      warn "cổng không có xác thực, chỉ nghe localhost; mọi tiến trình trên máy này điều khiển được Docker"
      if confirm "Ghi drop-in và khởi động lại docker (cần sudo)?"; then
        exec_start=$(systemctl show docker -p ExecStart --value | sed -n 's/.*argv\[\]=\([^;]*\);.*/\1/p' | sed 's/ *$//')
        [ -n "$exec_start" ] || exec_start="/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock"
        exec_start=$(echo "$exec_start" | sed "s# -H tcp://[^ ]*##g")
        sudo mkdir -p "$(dirname "$DROPIN")"
        printf '# SIRes: Docker API cho Windows (scripts/development/setup-wsl.sh)\n[Service]\nExecStart=\nExecStart=%s -H tcp://%s\n' "$exec_start" "$TCP_ADDR" \
          | sudo tee "$DROPIN" >/dev/null
        sudo systemctl daemon-reload
        sudo systemctl restart docker
        sleep 2
        if curl -fsS "http://$TCP_ADDR/_ping" >/dev/null 2>&1; then ok "dockerd nghe $TCP_ADDR"; else warn "chưa gọi được http://$TCP_ADDR/_ping; xem: journalctl -u docker -n 50"; fi
      fi
    fi
  fi
fi

step "Kiểm tra"
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    ok "docker info chạy được không cần sudo"
  elif sudo -n docker info >/dev/null 2>&1 || [ "$NEED_RELOGIN" = 1 ]; then
    warn "docker cần đăng nhập lại để nhận nhóm docker: trên Windows chạy wsl --shutdown rồi mở lại"
  else
    warn "docker info chưa chạy được"
  fi
  if [ "$TCP" = 1 ]; then
    if curl -fsS "http://$TCP_ADDR/_ping" >/dev/null 2>&1; then ok "Docker API $TCP_ADDR trả _ping"; else warn "Docker API $TCP_ADDR chưa trả lời"; fi
  fi
fi

if [ "$CHECK" = 1 ] && [ "$PENDING" = 1 ]; then
  echo; echo "Còn bước cần làm (dòng [cần]); chạy lại không kèm --check để làm."
  exit 1
fi
echo; echo "Xong phần WSL."
