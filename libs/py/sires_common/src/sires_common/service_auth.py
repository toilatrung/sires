# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Internal service tokens (ADR-20, architecture 10.4; ServiceTokenClaims in internal/schemas.yaml).

- Each service signs its outgoing calls with its own ES256 key: header `kid` = service name, `sub` = `kid`.
- The receiver checks the signature with the public key of `kid` from the key set loaded at start-up (unknown
  `kid` → rejected, nothing fetched from the network), `iss`, `exp` (in the future and at most 5 minutes ahead).
- `act.type = agent` (Agent Run token): accepted only when signed by `orchestration`, `sub = agent-core`, with
  `agentRunId` and `agentScope`, and `aud` an array containing this service (H2, H4). Any other token must have
  `aud` = this service as a single value.
- Every failure → `401 invalid_service_token`; a valid token whose `sub` is not in the route's `x-callers` →
  `403 caller_not_allowed` (internal/responses.yaml; PID-00003 I3).
"""

from __future__ import annotations

import base64
import contextvars
import json
import time
from collections.abc import Awaitable, Callable, Iterable, Mapping
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID

import jwt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from fastapi import Request
from pydantic import ValidationError

from sires_common.errors import ProblemError
from sires_common.kms import Kms
from sires_common.schemas import ActorRef, AgentScope, ServiceName, ServiceTokenClaims
from sires_common.tenancy import TenantContext

SERVICE_TOKEN_ISSUER = "sires-internal"
MAX_TOKEN_TTL_SECONDS = 300
ALGORITHM = "ES256"
ORCHESTRATION: ServiceName = "orchestration"
AGENT_CORE: ServiceName = "agent-core"
_CACHE_LIMIT = 1024


class InvalidServiceToken(ProblemError):
    def __init__(self, reason: str) -> None:
        # The reason is for logs and tests only; the response does not say why the token failed.
        super().__init__(401, "invalid_service_token", "Token nội bộ không hợp lệ")
        self.reason = reason


class CallerNotAllowed(ProblemError):
    def __init__(self, caller: str) -> None:
        super().__init__(403, "caller_not_allowed", "Service không được phép gọi endpoint này")
        self.caller = caller


# ---------- Signing ----------


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def der_to_jws_signature(der: bytes) -> bytes:
    """ECDSA DER signature → JWS ES256 form (R || S, 32 bytes each)."""
    r, s = decode_dss_signature(der)
    return r.to_bytes(32, "big") + s.to_bytes(32, "big")


class TokenSigner(Protocol):
    """Signs JWS input with the service's private key; `kid` is the service name."""

    @property
    def kid(self) -> str: ...

    async def sign(self, signing_input: bytes) -> bytes:
        """Return the ES256 JWS signature (R || S)."""
        ...


class LocalKeySigner:
    """In-memory ES256 key. For tests and local runs only; staging and production sign in KMS."""

    def __init__(self, kid: str, private_key: ec.EllipticCurvePrivateKey) -> None:
        if not isinstance(private_key.curve, ec.SECP256R1):
            raise ValueError("ES256 cần khóa P-256")
        self._kid = kid
        self._key = private_key

    @classmethod
    def generate(cls, kid: str) -> LocalKeySigner:
        return cls(kid, ec.generate_private_key(ec.SECP256R1()))

    @classmethod
    def from_pem(cls, kid: str, pem: bytes | str) -> LocalKeySigner:
        key = serialization.load_pem_private_key(pem.encode() if isinstance(pem, str) else pem, password=None)
        if not isinstance(key, ec.EllipticCurvePrivateKey):
            raise ValueError("khóa không phải EC")
        return cls(kid, key)

    @property
    def kid(self) -> str:
        return self._kid

    def public_key(self) -> ec.EllipticCurvePublicKey:
        return self._key.public_key()

    async def sign(self, signing_input: bytes) -> bytes:
        return der_to_jws_signature(self._key.sign(signing_input, ec.ECDSA(hashes.SHA256())))


class KmsTokenSigner:
    """Signs with a KMS key (`Kms.sign`, DER) and converts to the JWS form."""

    def __init__(self, kms: Kms, key_id: str, kid: str) -> None:
        self._kms = kms
        self._key_id = key_id
        self._kid = kid

    @property
    def kid(self) -> str:
        return self._kid

    async def sign(self, signing_input: bytes) -> bytes:
        return der_to_jws_signature(await self._kms.sign(self._key_id, signing_input))


async def sign_token(signer: TokenSigner, claims: Mapping[str, Any]) -> str:
    """Compact JWS with header {alg: ES256, typ: JWT, kid}."""
    header = {"alg": ALGORITHM, "typ": "JWT", "kid": signer.kid}
    segments = [
        _b64url(json.dumps(header, separators=(",", ":")).encode()),
        _b64url(json.dumps(dict(claims), separators=(",", ":"), default=str).encode()),
    ]
    signing_input = ".".join(segments).encode("ascii")
    signature = await signer.sign(signing_input)
    return f"{signing_input.decode('ascii')}.{_b64url(signature)}"


# ---------- Public key set ----------


class PublicKeySet:
    """`kid` → public key of each service in one environment, loaded from configuration or a secret."""

    def __init__(self, keys: Mapping[str, ec.EllipticCurvePublicKey]) -> None:
        for kid, key in keys.items():
            if not isinstance(key, ec.EllipticCurvePublicKey) or not isinstance(key.curve, ec.SECP256R1):
                raise ValueError(f"khóa của {kid!r} không phải EC P-256")
        self._keys = dict(keys)

    @classmethod
    def from_pem(cls, keys: Mapping[str, bytes | str]) -> PublicKeySet:
        loaded: dict[str, ec.EllipticCurvePublicKey] = {}
        for kid, pem in keys.items():
            key = serialization.load_pem_public_key(pem.encode() if isinstance(pem, str) else pem)
            if not isinstance(key, ec.EllipticCurvePublicKey):
                raise ValueError(f"khóa của {kid!r} không phải EC")
            loaded[kid] = key
        return cls(loaded)

    @classmethod
    def from_jwks(cls, jwks: Mapping[str, Any]) -> PublicKeySet:
        loaded: dict[str, ec.EllipticCurvePublicKey] = {}
        for jwk in jwks.get("keys", []):
            if jwk.get("kty") != "EC" or jwk.get("crv") != "P-256" or not jwk.get("kid"):
                raise ValueError("JWK phải là EC P-256 có kid")
            x = int.from_bytes(_b64url_decode(jwk["x"]), "big")
            y = int.from_bytes(_b64url_decode(jwk["y"]), "big")
            loaded[jwk["kid"]] = ec.EllipticCurvePublicNumbers(x, y, ec.SECP256R1()).public_key()
        return cls(loaded)

    @classmethod
    def from_json(cls, text: str) -> PublicKeySet:
        """JWKS (`{"keys": [...]}`) or a `{kid: PEM}` object."""
        data = json.loads(text)
        if isinstance(data, dict) and "keys" in data:
            return cls.from_jwks(data)
        return cls.from_pem(data)

    def get(self, kid: str) -> ec.EllipticCurvePublicKey | None:
        return self._keys.get(kid)

    def kids(self) -> list[str]:
        return sorted(self._keys)

    def to_jwks(self) -> dict[str, Any]:
        keys = []
        for kid, key in sorted(self._keys.items()):
            numbers = key.public_numbers()
            keys.append(
                {
                    "kty": "EC",
                    "crv": "P-256",
                    "kid": kid,
                    "alg": ALGORITHM,
                    "use": "sig",
                    "x": _b64url(numbers.x.to_bytes(32, "big")),
                    "y": _b64url(numbers.y.to_bytes(32, "big")),
                }
            )
        return {"keys": keys}


# ---------- Verification ----------


@dataclass(frozen=True, slots=True)
class ServiceCaller:
    """A verified internal token: who calls (`sub`), who signed (`kid`) and on whose behalf (`act`)."""

    claims: ServiceTokenClaims
    kid: str

    @property
    def service(self) -> ServiceName:
        return self.claims.sub

    @property
    def actor(self) -> ActorRef:
        return self.claims.act

    @property
    def account_id(self) -> UUID | None:
        return self.claims.accountId

    @property
    def project_id(self) -> UUID | None:
        return self.claims.projectId

    @property
    def agent_run_id(self) -> UUID | None:
        return self.claims.agentRunId

    @property
    def agent_scope(self) -> AgentScope | None:
        return self.claims.agentScope

    def tenant_context(self) -> TenantContext:
        if self.claims.accountId is None:
            raise ValueError("token không mang accountId")
        return TenantContext(self.claims.accountId, self.claims.act, self.claims.projectId)


class TokenVerifier:
    """Checks internal tokens addressed to `service`."""

    def __init__(
        self,
        service: ServiceName,
        keys: PublicKeySet,
        *,
        issuer: str = SERVICE_TOKEN_ISSUER,
        clock_skew_seconds: int = 0,
        now: Callable[[], float] = time.time,
    ) -> None:
        self.service = service
        self._keys = keys
        self._issuer = issuer
        self._skew = clock_skew_seconds
        self._now = now

    def verify(self, token: str) -> ServiceCaller:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise InvalidServiceToken("malformed") from exc
        if header.get("alg") != ALGORITHM:
            raise InvalidServiceToken("alg")
        kid = header.get("kid")
        if not isinstance(kid, str):
            raise InvalidServiceToken("kid_missing")
        key = self._keys.get(kid)
        if key is None:
            raise InvalidServiceToken("kid_unknown")
        try:
            payload = jwt.decode(
                token,
                key=key,
                algorithms=[ALGORITHM],
                options={
                    "verify_signature": True,
                    "verify_exp": False,
                    "verify_nbf": False,
                    "verify_iat": False,
                    "verify_aud": False,
                    "verify_iss": False,
                },
            )
        except jwt.PyJWTError as exc:
            raise InvalidServiceToken("signature") from exc
        try:
            claims = ServiceTokenClaims.model_validate(payload)
        except ValidationError as exc:
            raise InvalidServiceToken("claims") from exc
        if claims.iss != self._issuer:
            raise InvalidServiceToken("iss")
        now = self._now()
        if claims.exp <= now - self._skew:
            raise InvalidServiceToken("expired")
        if claims.exp - now > MAX_TOKEN_TTL_SECONDS + self._skew:
            raise InvalidServiceToken("ttl_too_long")
        self._check_signer_and_audience(claims, kid)
        return ServiceCaller(claims, kid)

    def _check_signer_and_audience(self, claims: ServiceTokenClaims, kid: str) -> None:
        if claims.act.type == "agent":
            if kid != ORCHESTRATION:
                raise InvalidServiceToken("agent_token_not_signed_by_orchestration")
            if claims.sub != AGENT_CORE:
                raise InvalidServiceToken("agent_token_sub")
            if claims.agentRunId is None or claims.agentScope is None:
                raise InvalidServiceToken("agent_token_scope")
            if not isinstance(claims.aud, list) or self.service not in claims.aud:
                raise InvalidServiceToken("aud")
            return
        if claims.sub != kid:
            raise InvalidServiceToken("sub_not_signer")
        if isinstance(claims.aud, list) or claims.aud != self.service:
            raise InvalidServiceToken("aud")


# ---------- FastAPI guard ----------

_current_caller: contextvars.ContextVar[ServiceCaller | None] = contextvars.ContextVar(
    "sires_service_caller", default=None
)


def current_service_caller() -> ServiceCaller | None:
    """Verified caller of the request being handled (set by the guard), or None in jobs and consumers."""
    return _current_caller.get()


def _bearer(request: Request) -> str:
    header = request.headers.get("authorization")
    if not header:
        raise InvalidServiceToken("missing")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise InvalidServiceToken("scheme")
    return token.strip()


class ServiceAuth:
    """Guard for internal routes, declared with the route's `x-callers`:

    `caller: Annotated[ServiceCaller, Depends(auth.require(["agent-core", "research"]))]`
    """

    def __init__(self, verifier: TokenVerifier) -> None:
        self.verifier = verifier

    def require(self, callers: Iterable[ServiceName]) -> Callable[[Request], Awaitable[ServiceCaller]]:
        allowed = frozenset(callers)

        async def dependency(request: Request) -> ServiceCaller:
            caller = self.verifier.verify(_bearer(request))
            if caller.service not in allowed:
                raise CallerNotAllowed(caller.service)
            request.state.service_caller = caller
            _current_caller.set(caller)
            return caller

        return dependency


# ---------- Outgoing calls ----------


class ServiceTokenIssuer:
    """Issues tokens for this service's outgoing calls: `sub` = this service, `aud` = target service.

    Never issues `act.type = agent`: an Agent Run calls other services with the token orchestration gave it
    (use `bearer_headers`); refreshing that token on heartbeat is the worker's job (PID-00073).
    """

    def __init__(
        self,
        service: ServiceName,
        signer: TokenSigner,
        *,
        issuer: str = SERVICE_TOKEN_ISSUER,
        ttl_seconds: int = MAX_TOKEN_TTL_SECONDS,
        reuse_margin_seconds: int = 60,
        now: Callable[[], float] = time.time,
    ) -> None:
        if signer.kid != service:
            raise ValueError("kid của khóa ký phải bằng tên service (H2)")
        if not 0 < ttl_seconds <= MAX_TOKEN_TTL_SECONDS:
            raise ValueError("hạn token ≤ 5 phút")
        self.service = service
        self._signer = signer
        self._issuer = issuer
        self._ttl = ttl_seconds
        self._margin = min(reuse_margin_seconds, ttl_seconds)
        self._now = now
        self._cache: dict[tuple[Any, ...], tuple[str, int]] = {}

    async def issue(
        self,
        audience: ServiceName,
        *,
        actor: ActorRef,
        account_id: UUID | None = None,
        project_id: UUID | None = None,
    ) -> str:
        if actor.type == "agent":
            raise ValueError("token act.type = agent chỉ do orchestration phát cho Agent Run (H2)")
        cache_key = (audience, actor.model_dump_json(), account_id, project_id)
        now = int(self._now())
        cached = self._cache.get(cache_key)
        if cached is not None and cached[1] - now > self._margin:
            return cached[0]
        exp = now + self._ttl
        claims: dict[str, Any] = {
            "iss": self._issuer,
            "sub": self.service,
            "aud": audience,
            "exp": exp,
            "act": actor.as_json(),
        }
        if account_id is not None:
            claims["accountId"] = str(account_id)
        if project_id is not None:
            claims["projectId"] = str(project_id)
        token = await sign_token(self._signer, claims)
        if len(self._cache) >= _CACHE_LIMIT:
            self._cache = {k: v for k, v in self._cache.items() if v[1] - now > self._margin}
        self._cache[cache_key] = (token, exp)
        return token

    async def headers_for(
        self,
        audience: ServiceName,
        *,
        component: str | None = None,
        account_id: UUID | None = None,
        project_id: UUID | None = None,
    ) -> dict[str, str]:
        """`Authorization` header for a call to `audience`.

        Inside a request: actor, account and project come from the verified incoming token. In a job or consumer
        (no request): `act = {type: system, component}`, account and project as given.
        """
        caller = current_service_caller()
        if caller is not None:
            if caller.actor.type == "agent":
                raise ValueError("request của Agent Run: dùng token orchestration đã cấp (bearer_headers)")
            token = await self.issue(
                audience, actor=caller.actor, account_id=caller.account_id, project_id=caller.project_id
            )
        else:
            if not component:
                raise ValueError("lời gọi từ job hoặc consumer phải nêu component (act.type = system)")
            token = await self.issue(
                audience,
                actor=ActorRef(type="system", component=component),
                account_id=account_id,
                project_id=project_id,
            )
        return bearer_headers(token)


def bearer_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
