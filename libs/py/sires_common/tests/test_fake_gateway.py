# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""S04 — ModelGateway interface, FakeModelGateway, LocalKms, container fixtures."""

from __future__ import annotations

import json
import subprocess
import sys
from importlib.metadata import requires
from uuid import UUID

import pytest
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

from sires_common.model_gateway import (
    ChatMessage,
    GatewayError,
    ModelGateway,
    ModelRequest,
    ProviderConnectionRef,
    StreamEvent,
    ToolCall,
    Usage,
)
from sires_common.testing import FakeModelGateway, LocalKms, LocalKmsError, MissingScenarioError, ScriptedResponse
from sires_common.testing.fixtures import MinioServer

pytestmark = pytest.mark.anyio

CONN = ProviderConnectionRef(UUID("0193a000-0000-7000-8000-0000000000c1"))
REQUEST = ModelRequest(model="fake-model", messages=(ChatMessage("user", "Tóm tắt evidence"),))
SCRIPT = {
    ("synthesis", "draft"): ScriptedResponse(
        text="Bản tổng hợp có trích dẫn",
        tool_calls=(ToolCall("call-1", "read_evidence", {"evidenceId": "e-1"}),),
        structured={"claims": [{"text": "A", "evidenceIds": ["e-1"]}]},
        usage=Usage(input_tokens=120, output_tokens=40, calls=1),
    ),
    ("verification", "check"): ScriptedResponse(text="Supported", usage="no_data"),
}

PROVIDER_SDKS = ("anthropic", "openai", "google.genai", "google.generativeai", "google.ai")


async def test_deterministic() -> None:
    """PID-00005-AC06: same (agent, step) twice → same result; injected rate_limited → attempts counted."""
    fake = FakeModelGateway(SCRIPT)
    with fake.step("synthesis", "draft"):
        first = await fake.generate(REQUEST, CONN)
        second = await fake.generate(REQUEST, CONN)
    assert first == second
    assert first.text == "Bản tổng hợp có trích dẫn" and first.attempts == 1
    assert first.adapter_version == "fake-1"

    other = FakeModelGateway(SCRIPT)  # a fresh fake with the same script gives the same answer
    assert await other.bind("synthesis", "draft").generate(REQUEST, CONN) == first

    fake.inject("verification", "check", "rate_limited", times=2, retry_after=1.5)
    bound = fake.bind("verification", "check")
    for _ in range(2):
        with pytest.raises(GatewayError) as error:
            await bound.generate(REQUEST, CONN)
        assert (error.value.code, error.value.retryable, error.value.retry_after) == ("rate_limited", True, 1.5)
    answer = await bound.generate(REQUEST, CONN)
    assert answer.attempts == 3 and answer.usage == "no_data"
    assert fake.attempts("verification", "check") == 3
    assert fake.attempts("synthesis", "draft") == 2

    fake.inject("verification", "check", "auth_failed")
    with pytest.raises(GatewayError) as fatal:
        await bound.generate(REQUEST, CONN)
    assert fatal.value.retryable is False

    events = [event async for event in fake.bind("synthesis", "draft").stream(REQUEST, CONN)]
    assert "".join(e.text for e in events if e.kind == "delta") == first.text
    assert events[-1] == StreamEvent("done", response=first)

    texts = ["đoạn một", "đoạn hai"]
    assert await fake.embed(texts, "fake-embed", CONN) == await other.embed(texts, "fake-embed", CONN)
    vectors = (await fake.embed(texts, "fake-embed", CONN)).vectors
    assert len(vectors) == 2 and all(len(v) == 8 for v in vectors) and vectors[0] != vectors[1]
    assert [m.id for m in await fake.list_models(CONN)] == ["fake-model"]


async def test_missing_step() -> None:
    """EC03: no script for the step asked → explicit error naming the agent and step, no default data."""
    fake = FakeModelGateway(SCRIPT)
    with pytest.raises(MissingScenarioError) as missing:
        await fake.bind("synthesis", "revise").generate(REQUEST, CONN)
    assert "synthesis" in str(missing.value) and "revise" in str(missing.value)
    assert (missing.value.agent, missing.value.step) == ("synthesis", "revise")
    with pytest.raises(MissingScenarioError):
        await fake.generate(REQUEST, CONN)  # no step selected
    with pytest.raises(MissingScenarioError):
        [event async for event in fake.bind("writing", "draft").stream(REQUEST, CONN)]
    assert fake.attempts("synthesis", "revise") == 0


def test_fake_implements_interface() -> None:
    fake = FakeModelGateway()
    assert isinstance(fake, ModelGateway)
    assert isinstance(fake.bind("a", "b"), ModelGateway)


def test_import_without_provider_sdk() -> None:
    """agent-core and knowledge import the interface and the fakes without pulling a provider SDK."""
    code = (
        "import json, sys\n"
        "import sires_common.model_gateway, sires_common.testing, sires_common.messaging, sires_common.service_auth\n"
        f"print(json.dumps(sorted(m for m in sys.modules if m.startswith({PROVIDER_SDKS!r}))))\n"
    )
    out = subprocess.run([sys.executable, "-c", code], check=True, capture_output=True, text=True).stdout
    assert json.loads(out) == []
    declared = " ".join(requires("sires-common") or []).lower()
    assert not any(sdk.split(".")[-1] in declared for sdk in ("anthropic", "openai", "genai", "generativeai"))


async def test_local_kms(local_kms: LocalKms) -> None:
    local_kms.create_signing_key("sign/knowledge")
    local_kms.create_encryption_key("kek/provider-keys")
    signature = await local_kms.sign("sign/knowledge", b"payload")
    public = serialization.load_pem_public_key(await local_kms.get_public_key_pem("sign/knowledge"))
    assert isinstance(public, ec.EllipticCurvePublicKey)
    public.verify(signature, b"payload", ec.ECDSA(hashes.SHA256()))
    with pytest.raises(InvalidSignature):
        public.verify(signature, b"other", ec.ECDSA(hashes.SHA256()))

    aad = b"account|connection"
    wrapped = await local_kms.encrypt("kek/provider-keys", b"dek-bytes", aad=aad)
    assert b"dek-bytes" not in wrapped
    assert await local_kms.decrypt("kek/provider-keys", wrapped, aad=aad) == b"dek-bytes"
    with pytest.raises(LocalKmsError):
        await local_kms.decrypt("kek/provider-keys", wrapped, aad=b"other|aad")
    with pytest.raises(LocalKmsError):
        await local_kms.sign("missing", b"x")


def test_minio_fixture(sires_minio: MinioServer) -> None:
    """The MinIO fixture gives a working S3 endpoint (object storage of architecture 6.6)."""
    from minio import Minio

    client = Minio(sires_minio.endpoint, sires_minio.access_key, sires_minio.secret_key, secure=False)
    client.make_bucket("sires-test")
    assert [b.name for b in client.list_buckets()] == ["sires-test"]


def test_fake_gateway_fixture(fake_model_gateway: FakeModelGateway) -> None:
    fake_model_gateway.add("writing", "draft", ScriptedResponse(text="ok"))
    assert fake_model_gateway.attempts("writing", "draft") == 0
