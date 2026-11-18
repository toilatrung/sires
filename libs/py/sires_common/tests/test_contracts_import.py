# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import importlib
import json
import pkgutil
import re
import subprocess
import sys
from pathlib import Path
from uuid import UUID

import pytest
import yaml
from pydantic import ValidationError

from sires_common import generated
from sires_common.generated.messages import AgentRunRequestedMessage

ROOT = Path(__file__).resolve().parents[4]
GENERATED = Path(generated.__file__).parent
MANIFEST = json.loads((GENERATED / 'manifest.json').read_text())


@pytest.mark.parametrize('service', MANIFEST['services'])
def test_import(service: str) -> None:
    """AC02: all client, model and endpoint modules import, for every internal API."""
    package = importlib.import_module(f'sires_common.generated.{service}')
    client = importlib.import_module(f'{package.__name__}.client')
    with client.Client(base_url='http://localhost') as instance:
        assert instance.get_httpx_client() is not None
    for module in pkgutil.walk_packages(package.__path__, prefix=f'{package.__name__}.'):
        importlib.import_module(module.name)

    source = ROOT / 'docs/api-design/internal' / f'{service.replace("_", "-")}.yaml'
    api = yaml.safe_load(source.read_text(encoding='utf8'))
    expected = {
        re.sub('[^a-z0-9]', '', operation['operationId'].lower())
        for item in api['paths'].values()
        for method, operation in item.items()
        if method in {'get', 'post', 'put', 'patch', 'delete', 'head', 'options'}
    }
    actual = {
        re.sub('[^a-z0-9]', '', module.stem.lower())
        for module in (GENERATED / service / 'api').rglob('*.py')
        if module.name != '__init__.py'
    }
    assert expected == actual, f'{service}: missing or unexpected operations'


@pytest.mark.parametrize('service', ['agent-core', 'knowledge'])
def test_import_from_service(service: str) -> None:
    """AC02: import clients from both consumer service working directories."""
    result = subprocess.run(
        [sys.executable, '-c',
         'import importlib, pkgutil; from sires_common import generated; '
         '[importlib.import_module(m.name) for m in '
         'pkgutil.walk_packages(generated.__path__, prefix="sires_common.generated.")]'],
        cwd=ROOT / 'apps' / service, capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stderr


def test_message_model() -> None:
    """AC03: a valid agent.run payload passes, every required field is enforced."""
    payload = {
        'agentRunId': '01900000-0000-7000-8000-000000000001',
        'workflowId': '01900000-0000-7000-8000-000000000002',
        'stepId': '01900000-0000-7000-8000-000000000003',
        'accountId': '01900000-0000-7000-8000-000000000004',
        'agent': 'orchestrator', 'attempt': 1,
    }
    model = AgentRunRequestedMessage.model_validate(payload)
    assert model.root.agentRunId.root == UUID(payload['agentRunId'])
    for field in payload:
        with pytest.raises(ValidationError):
            AgentRunRequestedMessage.model_validate({k: v for k, v in payload.items() if k != field})
    for attempt in [0, 4]:
        with pytest.raises(ValidationError):
            AgentRunRequestedMessage.model_validate({**payload, 'attempt': attempt})
    with pytest.raises(ValidationError):
        AgentRunRequestedMessage.model_validate({**payload, 'agent': 'unknown-agent'})


def test_every_message_model() -> None:
    """All AsyncAPI messages have usable Pydantic model schemas."""
    messages = importlib.import_module('sires_common.generated.messages')
    source = yaml.safe_load((ROOT / 'docs/api-design/events/asyncapi.yaml').read_text(encoding='utf8'))
    expected = {f'{name[0].upper()}{name[1:]}Message' for name in source['components']['messages']}
    assert set(MANIFEST['messages']) == expected
    for name in MANIFEST['messages']:
        model = getattr(messages, name)
        assert model.model_json_schema()
