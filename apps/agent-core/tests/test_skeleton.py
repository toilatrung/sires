# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S02 — one sub-package per agent in agents/ and prompts/, matching app.is_actor_ref of 00-common.sql."""

from __future__ import annotations

import importlib
import pkgutil
import re

from migration_support import ddl

import agent_core.agents
import agent_core.prompts


def _agents_of_is_actor_ref() -> set[str]:
    """Agent names listed in `app.is_actor_ref` (`a->>'agent' IN (...)`)."""
    match = re.search(r"a->>'agent' IN \(([^)]*)\)", ddl("00-common.sql"))
    assert match, "không tìm thấy danh sách agent trong app.is_actor_ref"
    return set(re.findall(r"'([a-z_]+)'", match.group(1)))


def test_agent_packages() -> None:
    expected = _agents_of_is_actor_ref()
    assert len(expected) == 9
    for parent in (agent_core.agents, agent_core.prompts):
        found = {module.name for module in pkgutil.iter_modules(parent.__path__) if module.ispkg}
        assert found == expected, parent.__name__
        for name in expected:
            module = importlib.import_module(f"{parent.__name__}.{name}")
            assert module.__doc__, module.__name__
            # Skeleton only: no prompt, definition or logic yet (NFR-EVAL-004 untouched).
            public = [attr for attr in vars(module) if not attr.startswith("__")]
            assert public == [], f"{module.__name__}: {public}"
