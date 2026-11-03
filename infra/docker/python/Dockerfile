# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

# Image for agent-core or knowledge:
#   docker build -f infra/docker/python/Dockerfile --build-arg PACKAGE=sires-agent-core --build-arg MODULE=agent_core.main .
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
ARG PACKAGE
ARG MODULE
WORKDIR /repo
COPY pyproject.toml uv.lock ./
COPY apps/agent-core apps/agent-core
COPY apps/knowledge apps/knowledge
COPY libs/py libs/py
COPY eval eval
RUN uv sync --frozen --no-dev --package ${PACKAGE}
ENV APP_MODULE=${MODULE}
CMD ["sh", "-c", "uv run --no-sync uvicorn ${APP_MODULE}:app --host 0.0.0.0 --port 8000"]
