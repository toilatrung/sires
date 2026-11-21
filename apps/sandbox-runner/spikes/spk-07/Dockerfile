# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee

RUN rm -f /etc/apt/sources.list.d/debian.sources \
    && printf 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20261119T000000Z bookworm main\ndeb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/20261119T000000Z bookworm-security main\n' > /etc/apt/sources.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends chromium librsvg2-bin fonts-dejavu-core fonts-noto-core python3 time \
    && dpkg-query -W > /opt/packages.tsv \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true HOME=/work TMPDIR=/work/tmp XDG_CACHE_HOME=/work/cache XDG_CONFIG_HOME=/work/config
WORKDIR /opt/spk-07
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY parse.mjs render.mjs worker.py ./
RUN mkdir -p /input /work && chmod 1777 /work
USER 65532:65532
WORKDIR /work
ENTRYPOINT ["python3", "/opt/spk-07/worker.py"]
