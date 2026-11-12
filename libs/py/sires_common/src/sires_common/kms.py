# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""KMS operations the services rely on (architecture 10.3, 10.4).

Signing keys (ES256, one per service) sign internal tokens; key-encryption keys wrap the DEK of provider secrets.
The real adapter for staging and production belongs to PID-00035 / PID-00153 (N6); tests use
`sires_common.testing.LocalKms`.
"""

from __future__ import annotations

from typing import Protocol


class Kms(Protocol):
    async def sign(self, key_id: str, message: bytes) -> bytes:
        """ECDSA P-256 / SHA-256 signature of `message`, DER encoded (as KMS Sign returns it)."""
        ...

    async def get_public_key_pem(self, key_id: str) -> bytes:
        """SubjectPublicKeyInfo PEM of a signing key."""
        ...

    async def encrypt(self, key_id: str, plaintext: bytes, *, aad: bytes | None = None) -> bytes: ...

    async def decrypt(self, key_id: str, ciphertext: bytes, *, aad: bytes | None = None) -> bytes: ...
