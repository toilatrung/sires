#!/usr/bin/env bash
# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
set -euo pipefail
# Run as root on a Linux Docker host. Preserves other registered runtimes.
version=20261116.0
platform="${GVISOR_PLATFORM:-systrap}"
case "$platform" in systrap|kvm) ;; *) echo 'GVISOR_PLATFORM: systrap hoặc kvm' >&2; exit 2 ;; esac
[[ "$EUID" == 0 ]] || { echo 'Cần root để cài runtime Docker.' >&2; exit 2; }
temporary="$(mktemp -d -t sires-runsc.XXXXXXXX)"
trap 'rm -rf -- "$temporary"' EXIT
cd "$temporary"
url="https://storage.googleapis.com/gvisor/releases/release/${version}/$(uname -m)"
curl -fsSLO "${url}/gvisor.tar.bz2"
curl -fsSLO "${url}/gvisor.tar.bz2.sha512"
sha512sum -c gvisor.tar.bz2.sha512
tar -xjf gvisor.tar.bz2 -C /usr/local/bin
/usr/local/bin/runsc install --runtime=runsc -- "--platform=${platform}"
systemctl reload docker
docker run --rm --runtime=runsc --network=none hello-world
/usr/local/bin/runsc --version
