# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

# Image for any NestJS service: docker build -f infra/docker/node/Dockerfile --build-arg SERVICE=identity .
FROM node:22-slim AS build
ARG SERVICE
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm nx run @sires/${SERVICE}:build \
 && pnpm --filter @sires/${SERVICE} deploy --legacy --prod /out

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out .
USER node
CMD ["node", "dist/main.js"]
