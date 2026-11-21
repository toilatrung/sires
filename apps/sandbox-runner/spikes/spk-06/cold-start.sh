#!/usr/bin/env bash
# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

set -euo pipefail
# Cold start of the SPK-06 sandbox (PID-00031). Subcommands:
#   container --output DIR [--runtimes runc,runsc]   new Docker container per case
#   kind-up [IMAGE]                                    kind cluster with containerd + runsc shim, RuntimeClass gvisor
#   pod --output DIR [--runtimes runc,gvisor]          new pod per case in that cluster
#   kind-down                                          delete the cluster
# Needs runsc installed on the host first (setup-runsc.sh); kind-up copies the same binaries into the node.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cluster="${SPK06_KIND_CLUSTER:-sires-spk06}"
node="${cluster}-control-plane"
kind="${KIND:-kind}"

case "${1:-}" in
  container|pod)
    exec python3 "$here/cold_start.py" "$@"
    ;;
  kind-up)
    image="${2:-sires/spk-06:texlive-2022}"
    platform="${GVISOR_PLATFORM:-kvm}"
    case "$platform" in systrap|kvm) ;; *) echo 'GVISOR_PLATFORM: systrap hoặc kvm' >&2; exit 2 ;; esac
    "$kind" create cluster --name "$cluster" --config "$here/cold-start-kind.yaml" --wait 180s
    for binary in runsc containerd-shim-runsc-v1 gvisor-bin; do
      docker cp "/usr/local/bin/$binary" "$node:/usr/local/bin/"
    done
    # kubelet in kind uses the systemd cgroup driver, so runsc must read systemd cgroup paths.
    printf '[runsc_config]\n  platform = "%s"\n  systemd-cgroup = "true"\n' "$platform" \
      | docker exec -i "$node" sh -c 'cat > /etc/containerd/runsc.toml'
    docker exec -i "$node" kubectl --kubeconfig=/etc/kubernetes/admin.conf apply -f - < "$here/cold-start-k8s.yaml"
    # Pods use imagePullPolicy=Never: the image is loaded once, pull time is not part of the cold start.
    "$kind" load docker-image --name "$cluster" "$image"
    docker exec "$node" runsc --version
    ;;
  kind-down)
    "$kind" delete cluster --name "$cluster"
    ;;
  *)
    grep '^#   ' "${BASH_SOURCE[0]}" >&2
    exit 2
    ;;
esac
