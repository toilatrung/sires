# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""LocalKms (architecture 8.9): the `sires_common.kms.Kms` operations with keys held in memory. Tests and local
runs only — keys disappear with the process and are never written anywhere."""

from __future__ import annotations

import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_NONCE_BYTES = 12


class LocalKmsError(Exception):
    pass


class LocalKms:
    """In-memory KMS: ES256 signing keys and AES-256-GCM key-encryption keys, addressed by key id."""

    def __init__(self) -> None:
        self._signing: dict[str, ec.EllipticCurvePrivateKey] = {}
        self._encryption: dict[str, bytes] = {}

    def create_signing_key(self, key_id: str) -> None:
        if key_id in self._signing:
            raise LocalKmsError(f"khóa ký {key_id!r} đã có")
        self._signing[key_id] = ec.generate_private_key(ec.SECP256R1())

    def create_encryption_key(self, key_id: str) -> None:
        if key_id in self._encryption:
            raise LocalKmsError(f"khóa mã hóa {key_id!r} đã có")
        self._encryption[key_id] = AESGCM.generate_key(bit_length=256)

    def _signing_key(self, key_id: str) -> ec.EllipticCurvePrivateKey:
        try:
            return self._signing[key_id]
        except KeyError:
            raise LocalKmsError(f"không có khóa ký {key_id!r}") from None

    def _encryption_key(self, key_id: str) -> bytes:
        try:
            return self._encryption[key_id]
        except KeyError:
            raise LocalKmsError(f"không có khóa mã hóa {key_id!r}") from None

    async def sign(self, key_id: str, message: bytes) -> bytes:
        return self._signing_key(key_id).sign(message, ec.ECDSA(hashes.SHA256()))

    async def get_public_key_pem(self, key_id: str) -> bytes:
        return (
            self._signing_key(key_id)
            .public_key()
            .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        )

    async def encrypt(self, key_id: str, plaintext: bytes, *, aad: bytes | None = None) -> bytes:
        nonce = os.urandom(_NONCE_BYTES)
        return nonce + AESGCM(self._encryption_key(key_id)).encrypt(nonce, plaintext, aad)

    async def decrypt(self, key_id: str, ciphertext: bytes, *, aad: bytes | None = None) -> bytes:
        nonce, body = ciphertext[:_NONCE_BYTES], ciphertext[_NONCE_BYTES:]
        try:
            return AESGCM(self._encryption_key(key_id)).decrypt(nonce, body, aad)
        except InvalidTag:
            raise LocalKmsError("giải mã thất bại (sai khóa, AAD hoặc dữ liệu)") from None
