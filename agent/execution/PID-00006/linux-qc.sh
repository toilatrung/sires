#!/usr/bin/env bash
# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
set -euo pipefail

case "${1:-}" in
  prepare)
    source_dir=$(cd "$(dirname "$0")/../../.." && pwd)
    docker build -t sires/pid00006-qc -f "$source_dir/agent/execution/PID-00006/linux-qc.Dockerfile" "$source_dir/agent/execution/PID-00006"
    docker volume inspect sires-pid00006-linux >/dev/null 2>&1 || docker volume create sires-pid00006-linux
    docker run --rm -v "$source_dir:/source:ro" -v sires-pid00006-linux:/workspace \
      -e COREPACK_HOME=/workspace/.corepack -w /workspace node:22-bookworm-slim \
      bash /source/agent/execution/PID-00006/linux-qc.sh bootstrap
    ;;
  bootstrap)
    tar -C /source --exclude=node_modules --exclude=__pycache__ -cf - \
      package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json nx.json eslint.config.mjs \
      .nvmrc .gitignore libs/ts docs/api-design docs/database/ddl agent/execution/PID-00006 | tar -xf -
    corepack pnpm install --frozen-lockfile
    corepack pnpm --filter @sires/contracts exec node scripts/generate.mjs --ts-only
    corepack pnpm --filter @sires/contracts build
    corepack pnpm --filter @sires/platform build
    corepack pnpm --filter @sires/testing build
    ;;
  offline)
    source_dir=$(cd "$(dirname "$0")/../../.." && pwd)
    gateway=$(docker network inspect --format '{{(index .IPAM.Config 0).Gateway}}' bridge)
    docker run --rm --network bridge --cap-add NET_ADMIN -v sires-pid00006-linux:/workspace \
      -v "$source_dir/agent/execution/PID-00006/linux-qc.sh:/qc.sh:ro" \
      -v /var/run/docker.sock:/var/run/docker.sock -e TESTCONTAINERS_HOST_OVERRIDE="$gateway" \
      -e COREPACK_HOME=/workspace/.corepack -e NX_DAEMON=false -w /workspace sires/pid00006-qc \
      bash /qc.sh verify \
      | tee "$source_dir/agent/execution/PID-00006/validation-offline.txt"
    ;;
  verify)
    corepack enable
    # These rules affect only this runner's private network namespace, never the Docker host.
    iptables -A OUTPUT -o lo -j ACCEPT
    iptables -A OUTPUT -d "$TESTCONTAINERS_HOST_OVERRIDE" -j ACCEPT
    iptables -P OUTPUT DROP
    ip6tables -P OUTPUT DROP
    iptables -S OUTPUT
    node - <<'JS'
fetch('https://1.1.1.1', {signal: AbortSignal.timeout(3000)}).then(
  () => { throw new Error('External network unexpectedly accessible'); },
  () => process.stdout.write('External network blocked; runner namespace allows loopback and Docker gateway only\n'),
);
JS
    corepack pnpm nx run @sires/sample-service:test
    ;;
  *) echo 'Usage: linux-qc.sh prepare|offline' >&2; exit 1 ;;
esac
