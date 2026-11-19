# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
from uuid import UUID

from sires_common.generated.messages import Aggregate as Entity
from sires_common.generated.messages import Id

entity = Entity(type='project', id=Id(UUID(int=1)), version=1, fieldNotInSpec=True)
multiline = Entity(
    type='project',
    id=Id(UUID(int=1)),
    version=1,
    fieldNotInSpec=True,
)
