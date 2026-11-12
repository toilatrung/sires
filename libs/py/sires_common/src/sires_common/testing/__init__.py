# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Test doubles for SIRes Python services (architecture 8.9).

Containers (PostgreSQL, RabbitMQ, MinIO) are pytest fixtures in `sires_common.testing.fixtures`, loaded on demand so
importing this package needs neither Docker nor testcontainers.
"""

from sires_common.testing.fake_gateway import FakeModelGateway, MissingScenarioError, ScriptedResponse
from sires_common.testing.kms import LocalKms, LocalKmsError
from sires_common.testing.tokens import make_service_keys, sign_agent_run_token

__all__ = [
    "FakeModelGateway",
    "LocalKms",
    "LocalKmsError",
    "MissingScenarioError",
    "ScriptedResponse",
    "make_service_keys",
    "sign_agent_run_token",
]
