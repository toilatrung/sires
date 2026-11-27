#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
set -euo pipefail

services=$(jq -r '.include[].service | select(. == "gateway" or . == "agent-core")' <<< "$IMAGE_MATRIX")
container=''
cleanup() {
  if [[ -n "$container" ]]; then docker rm -f "$container" >/dev/null; fi
}
trap cleanup EXIT

for service in $services; do
  docker load --input "$RUNNER_TEMP/helm-smoke/$service.tar.gz"
  port=$(node -e 'console.log(require("yaml").parse(require("node:fs").readFileSync(process.argv[1], "utf8")).port)' "apps/$service/deploy/values.yaml")
  run_env=(-e "PORT=$port")
  if [[ "$service" == gateway ]]; then
    # Probe startup only: /health does not query PostgreSQL. Never use deployment secrets here.
    run_env+=(-e 'DATABASE_URL=postgres://smoke:smoke@127.0.0.1:1/sires_gateway')
    run_env+=(-e "GATEWAY_CSRF_KEY=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')")
  fi
  container=$(docker run -d --publish "127.0.0.1::$port" "${run_env[@]}" "sires-ci/$service:$GITHUB_RUN_ID")
  address=$(docker port "$container" "$port/tcp")
  if ! status=$(curl --fail --silent --show-error --retry 20 --retry-all-errors --retry-delay 1 --max-time 2 \
    --output /dev/null --write-out '%{http_code}' "http://$address/health") || [[ "$status" != 200 ]]; then
    docker logs "$container"
    exit 1
  fi
  docker exec "$container" awk '/^Uid:/ { pass = $2 > 0 && $3 > 0 } END { exit !pass }' /proc/1/status
  cleanup
  container=''
  printf 'OK %s: /health 200, PID 1 non-root\n' "$service"
done
