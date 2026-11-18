#!/usr/bin/env bash
# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

# Dọn môi trường thừa trong WSL cho SIRes. Với SIRes, WSL chỉ cần Docker Engine; Node, pnpm, uv, Python chạy
# trên Windows. Mặc định chỉ liệt kê, không xóa gì.
#
# Dùng: bash scripts/development/clean-wsl.sh [--apply] [--yes] [--docker-other] [--docker-unlabeled-volumes]
#   --apply                     xóa các mục đã liệt kê (hỏi từng mục, trừ khi có --yes)
#   --yes                       không hỏi lại từng mục
#   --docker-other              thêm: container, volume có nhãn dự án và image của mọi dự án Docker khác
#                               ngoài sires-local. Dữ liệu trong volume mất vĩnh viễn.
#   --docker-unlabeled-volumes  thêm: volume không gắn với container nào và không có nhãn dự án.
#                               Không biết volume chứa gì, xóa là mất vĩnh viễn.
#
# Không bao giờ xóa: Python 3 hệ thống (/usr/bin/python3, apt cần nó), Docker Engine, dữ liệu của sires-local,
# thư mục dự án của bạn trong ~ (script không biết thư mục nào là dự án; tự xóa nếu cần).

set -uo pipefail

APPLY=0; YES=0; DOCKER_OTHER=0; DOCKER_UNLABELED=0
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    --yes) YES=1 ;;
    --docker-other) DOCKER_OTHER=1 ;;
    --docker-unlabeled-volumes) DOCKER_UNLABELED=1 ;;
    -h|--help) awk 'NR > 5 && /^#/ { sub(/^# ?/, ""); print; next } NR > 5 { exit }' "$0"; exit 0 ;;
    *) echo "Tham số lạ: $a" >&2; exit 2 ;;
  esac
done

KEEP_PROJECT=sires-local
names=(); descs=(); cmds=()
add() { names+=("$1"); descs+=("$2"); cmds+=("$3"); }
size() { du -sh "$@" 2>/dev/null | awk '{print $1}' | paste -sd+ -; }
confirm() {
  [ "$YES" = 1 ] && return 0
  local ans; read -r -p "  Xóa? [y/N] " ans || true
  [ "$ans" = y ] || [ "$ans" = Y ]
}
has_docker() { command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; }

# --- Python ngoài hệ thống: SIRes dùng Python do uv cài trên Windows.
for d in ~/.venvs ~/.virtualenvs ~/.pyenv ~/miniconda3 ~/anaconda3 ~/miniforge3 ~/mambaforge ~/.conda ~/.local/pipx ~/.cache/pip; do
  [ -e "$d" ] && add "$d" "Python ngoài hệ thống ($(size "$d"))" "rm -rf -- '$d'"
done
for d in ~/.local/lib/python3*; do
  [ -e "$d" ] && add "$d" "Gói pip --user ($(size "$d"))" "rm -rf -- '$d'"
done

# --- uv trong WSL: SIRes dùng uv trên Windows.
uv_paths=()
for p in ~/.local/bin/uv ~/.local/bin/uvx ~/.local/share/uv ~/.cache/uv; do [ -e "$p" ] && uv_paths+=("$p"); done
if [ "${#uv_paths[@]}" -gt 0 ]; then
  add "uv" "uv, Python do uv cài và cache ($(size "${uv_paths[@]}")): ${uv_paths[*]}" "rm -rf -- $(printf "'%s' " "${uv_paths[@]}")"
fi

# --- Node trong WSL: SIRes dùng Node, pnpm trên Windows.
for d in ~/.nvm ~/.npm ~/.pnpm-store ~/.local/share/pnpm ~/.cache/node-gyp ~/.node-gyp; do
  [ -e "$d" ] && add "$d" "Node, npm, pnpm trong WSL ($(size "$d"))" "rm -rf -- '$d'"
done
if dpkg -s nodejs >/dev/null 2>&1; then
  add "apt: nodejs" "Gói nodejs cài bằng apt (cần sudo)" "sudo apt-get remove -y nodejs && sudo apt-get autoremove -y"
fi

# --- Docker: chỉ phần không dùng, trừ khi bật cờ.
if has_docker; then
  dangling=$(docker images -qf dangling=true | wc -l)
  [ "$dangling" -gt 0 ] && add "docker: image treo" "$dangling image không tag, không container nào dùng" "docker image prune -f"
  bc=$(docker system df --format '{{if eq .Type "Build Cache"}}{{.Size}}{{end}}' | tr -d '\n')
  [ -n "$bc" ] && [ "$bc" != 0B ] && add "docker: build cache" "Build cache ($bc)" "docker builder prune -af"

  if [ "$DOCKER_OTHER" = 1 ]; then
    others=$(docker ps -a --format '{{.ID}} {{.Label "com.docker.compose.project"}}' | awk -v k="$KEEP_PROJECT" '$2 != k {print $1}' | tr '\n' ' ')
    if [ -n "${others// /}" ]; then
      list=$(docker ps -a --format '{{.Names}} ({{.Label "com.docker.compose.project"}})' | grep -v "($KEEP_PROJECT)" | tr '\n' ' ')
      add "docker: container dự án khác" "$(echo "$others" | wc -w) container: $list" "docker rm -f $others"
    fi
    vols=$(docker volume ls --format '{{.Name}} {{.Label "com.docker.compose.project"}}' | awk -v k="$KEEP_PROJECT" 'NF == 2 && $2 != k {print $1}' | tr '\n' ' ')
    if [ -n "${vols// /}" ]; then
      projects=$(docker volume ls --format '{{.Label "com.docker.compose.project"}}' | grep -v -x -e '' -e "$KEEP_PROJECT" | sort -u | tr '\n' ' ')
      add "docker: volume dự án khác" "$(echo "$vols" | wc -w) volume của: $projects— MẤT DỮ LIỆU VĨNH VIỄN" "docker volume rm $vols"
    fi
    add "docker: image không dùng" "Mọi image không container nào dùng (sau khi xóa container ở trên)" "docker image prune -af"
  fi

  if [ "$DOCKER_UNLABELED" = 1 ]; then
    add "docker: volume không nhãn" "Volume không có nhãn dự án, không container nào dùng — MẤT DỮ LIỆU VĨNH VIỄN" \
      "docker volume ls -f dangling=true --format '{{.Name}} {{.Label \"com.docker.compose.project\"}}' | awk 'NF == 1 {print \$1}' | xargs -r docker volume rm"
  fi
else
  echo "! Không gọi được docker (chưa cài, chưa chạy hoặc chưa thuộc nhóm docker): bỏ qua phần Docker."
fi

echo "Giữ nguyên: Python 3 hệ thống ($(command -v python3 || echo không có)), Docker Engine, dữ liệu $KEEP_PROJECT, thư mục dự án trong ~."
echo
if [ "${#names[@]}" -eq 0 ]; then echo "Không có gì cần dọn."; exit 0; fi

for i in "${!names[@]}"; do
  printf '%2d. %-30s %s\n' "$((i + 1))" "${names[$i]}" "${descs[$i]}"
done

if [ "$APPLY" = 0 ]; then
  echo; echo "Chỉ liệt kê. Chạy lại với --apply để xóa (hỏi từng mục)."
  exit 0
fi

echo
failed=0
for i in "${!names[@]}"; do
  echo "- ${names[$i]}"
  if confirm; then
    if bash -c "${cmds[$i]}" >/dev/null; then echo "  đã xóa"; else echo "  LỖI khi xóa"; failed=1; fi
  else
    echo "  bỏ qua"
  fi
done
echo; echo "Xong. Shell mới sẽ không còn thấy các công cụ đã xóa; dòng khởi tạo nvm, uv trong ~/.bashrc, ~/.profile có kiểm tra file nên không báo lỗi."
exit "$failed"
