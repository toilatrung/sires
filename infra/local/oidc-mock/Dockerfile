# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

# Image của OIDC mock (PID-00160), build từ gốc repo:
#   docker build -f infra/local/oidc-mock/Dockerfile -t sires/oidc-mock:local .
# Chỉ cho cục bộ và staging PH-02, không bao giờ production. Không đặt NODE_ENV=production: mock không phải service
# của SIRes, OIDC_MOCK_ENV quyết định chế độ. Image chỉ có dist/, config/ và phụ thuộc production của package.
FROM node:22-slim AS build
ENV CI=true NX_DAEMON=false
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm nx run @sires/oidc-mock:build \
 && pnpm --filter @sires/oidc-mock deploy --legacy --prod /out

FROM node:22-slim
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 9400
CMD ["node", "dist/main.js"]
