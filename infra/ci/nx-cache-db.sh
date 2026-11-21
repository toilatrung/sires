#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
set -euo pipefail
shopt -s nullglob

machine_id=$(cat /var/lib/dbus/machine-id 2>/dev/null || cat /etc/machine-id 2>/dev/null || printf machine)
if [[ ! "$machine_id" =~ ^[a-fA-F0-9]{32}$ && "$machine_id" != machine ]]; then
  echo 'Không đọc được machine ID cho cache Nx.' >&2
  exit 1
fi

# Nx 22 đặt tên SQLite theo machine ID, thay đổi giữa các runner GitHub.
workspace_data=.nx/workspace-data
archive=.nx/ci-cache
case "$1" in
  restore)
    mkdir -p "$workspace_data"
    for db in "$archive"/nx-v*.db*; do
      cp "$db" "$workspace_data/$machine_id-${db##*/nx-}"
    done
    ;;
  save)
    mkdir -p "$archive"
    for db in "$workspace_data/$machine_id"-v*.db*; do
      [[ "$db" != *-shm ]] || continue
      cp "$db" "$archive/nx-${db##*/$machine_id-}"
    done
    ;;
  *)
    echo 'Dùng: nx-cache-db.sh restore|save' >&2
    exit 2
    ;;
esac
