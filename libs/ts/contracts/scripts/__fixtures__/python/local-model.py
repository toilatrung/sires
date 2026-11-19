# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
from sires_common.generated.messages import AgentRunRequestedMessage


class AgentRunAssignment:
    pass


def inspect(local: AgentRunAssignment, generated: AgentRunRequestedMessage) -> None:
    print(generated.root.attempt)
    print(local.fieldNotInSpec)


class Aggregate:
    def __init__(self, version: int) -> None:
        self.version = version


single = Aggregate(version=1, fieldNotInSpec=True)
multiline = Aggregate(
    version=1,
    fieldNotInSpec=True,
)
