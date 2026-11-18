// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import {
  createECDH,
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type JsonWebKey,
  type KeyObject,
  sign as signWithKey,
} from 'node:crypto';
import { isServiceName, SERVICE_NAMES, type ServiceName } from './claims';

// Signing keys of internal tokens (ADR-20; PID-00003 H1): one ES256 key pair per service, kid = service name. In
// staging and production the private key lives in KMS (PID-00035, PID-00153) behind {@link ServiceSigner}; this file
// only has the local signer for tests and development. Each environment has one public key set (kid → public key),
// loaded at startup; an unknown kid is refused, keys are never fetched from the network (designs/notes.html).

/** Signs for one service. A KMS adapter implements the same interface. */
export interface ServiceSigner {
  /** The service whose private key signs; written as `kid` and, for the service's own calls, as `sub`. */
  readonly service: ServiceName;
  /** ES256 signature of `data`: SHA-256 then ECDSA P-256, as the 64-byte `r ‖ s` of JWS (RFC 7518 3.4). */
  sign(data: Uint8Array): Promise<Uint8Array>;
}

/** Public keys of one environment, by kid. */
export interface ServicePublicKeys {
  get(kid: ServiceName): KeyObject | undefined;
}

/** A JSON Web Key Set restricted to what is needed here: EC P-256 public keys whose `kid` is a service name. */
export interface ServiceJwks {
  keys: Array<JsonWebKey & { kid?: string }>;
}

/** Signer over a private key held in this process (tests, local development). */
export function localServiceSigner(service: ServiceName, privateKey: KeyObject | JsonWebKey): ServiceSigner {
  const key = isKeyObject(privateKey) ? privateKey : createPrivateKey({ key: privateKey, format: 'jwk' });
  assertP256(key, 'private', service);
  return {
    service,
    sign: async (data) => new Uint8Array(signWithKey('sha256', data, { key, dsaEncoding: 'ieee-p1363' })),
  };
}

/** Public key set from a fixed map. */
export function servicePublicKeys(keys: Partial<Record<ServiceName, KeyObject | JsonWebKey>>): ServicePublicKeys {
  const map = new Map<ServiceName, KeyObject>();
  for (const [kid, key] of Object.entries(keys) as Array<[ServiceName, KeyObject | JsonWebKey | undefined]>) {
    if (!isServiceName(kid)) throw new TypeError(`servicePublicKeys: kid “${kid}” is not a service name`);
    if (!key) continue;
    const publicKey = isKeyObject(key) ? (key.type === 'private' ? createPublicKey(key) : key) : publicFromJwk(key);
    assertP256(publicKey, 'public', kid);
    map.set(kid, publicKey);
  }
  return { get: (kid) => map.get(kid) };
}

/** Public key set from a JWKS document (`{"keys":[{"kty":"EC","crv":"P-256","kid":"gateway","x":…,"y":…}]}`). */
export function servicePublicKeysFromJwks(jwks: ServiceJwks | string): ServicePublicKeys {
  const document = (typeof jwks === 'string' ? JSON.parse(jwks) : jwks) as ServiceJwks;
  if (!document || !Array.isArray(document.keys)) throw new TypeError('servicePublicKeysFromJwks: expected {"keys": [...]}');
  const keys: Partial<Record<ServiceName, JsonWebKey>> = {};
  for (const jwk of document.keys) {
    if (!isServiceName(jwk.kid)) throw new TypeError(`servicePublicKeysFromJwks: kid “${String(jwk.kid)}” is not a service name`);
    if (keys[jwk.kid]) throw new TypeError(`servicePublicKeysFromJwks: kid “${jwk.kid}” appears twice`);
    keys[jwk.kid] = jwk;
  }
  return servicePublicKeys(keys);
}

/** The public JWK of a service key, with its kid, for building a JWKS. */
export function publicJwk(service: ServiceName, key: KeyObject): JsonWebKey & { kid: ServiceName } {
  const publicKey = key.type === 'private' ? createPublicKey(key) : key;
  const { kty, crv, x, y } = publicKey.export({ format: 'jwk' });
  return { kty, crv, x, y, kid: service };
}

/** Key pairs created in memory for every service (or the ones listed): for tests. */
export function generateServiceKeys(services: readonly ServiceName[] = SERVICE_NAMES): {
  signer: (service: ServiceName) => ServiceSigner;
  publicKeys: ServicePublicKeys;
  privateKeys: Map<ServiceName, KeyObject>;
} {
  const privateKeys = new Map<ServiceName, KeyObject>();
  for (const service of services) {
    privateKeys.set(service, generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey);
  }
  return keySet(privateKeys);
}

/** Order of the P-256 group (SEC 2, 2.4.2). */
const P256_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

/**
 * Development key set shared by every service started with `pnpm local:up`: each private key is derived from one
 * seed and the service name (HMAC-SHA256 reduced into [1, n − 1]), so services that share the seed share the key set
 * without a key file. Anyone who knows the seed can sign as any service: never use it outside local development.
 */
export function deriveDevServiceKeys(seed: string, services: readonly ServiceName[] = SERVICE_NAMES) {
  if (seed.length < 16) throw new TypeError('deriveDevServiceKeys: seed must have at least 16 characters');
  const privateKeys = new Map<ServiceName, KeyObject>();
  for (const service of services) {
    const digest = createHmac('sha256', seed).update(`sires-dev-service-key:${service}`).digest('hex');
    const scalar = (BigInt(`0x${digest}`) % (P256_ORDER - 1n)) + 1n;
    const d = Buffer.from(scalar.toString(16).padStart(64, '0'), 'hex');
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(d);
    const point = ecdh.getPublicKey(); // 0x04 ‖ x ‖ y
    const jwk: JsonWebKey = {
      kty: 'EC',
      crv: 'P-256',
      d: d.toString('base64url'),
      x: point.subarray(1, 33).toString('base64url'),
      y: point.subarray(33, 65).toString('base64url'),
    };
    privateKeys.set(service, createPrivateKey({ key: jwk, format: 'jwk' }));
  }
  return keySet(privateKeys);
}

/** Environment variables read by {@link serviceAuthKeysFromEnv}. */
export const SERVICE_AUTH_ENV = {
  /** Private key of this service as a JWK (JSON). Local or self-managed deployments only; KMS replaces it later. */
  privateKey: 'SERVICE_AUTH_PRIVATE_KEY',
  /** Public key set of the environment as a JWKS (JSON). */
  publicKeys: 'SERVICE_AUTH_PUBLIC_KEYS',
  /** Development only: seed for {@link deriveDevServiceKeys}; used when the two variables above are absent. */
  devSeed: 'SERVICE_AUTH_DEV_SEED',
} as const;

/**
 * Signer and public key set of `service` from the environment: either a private JWK and a JWKS, or — outside
 * production — a development seed. Throws when neither is configured.
 */
export function serviceAuthKeysFromEnv(
  service: ServiceName,
  env: NodeJS.ProcessEnv = process.env,
): { signer: ServiceSigner; publicKeys: ServicePublicKeys } {
  const privateJwk = env[SERVICE_AUTH_ENV.privateKey];
  const jwks = env[SERVICE_AUTH_ENV.publicKeys];
  if (privateJwk && jwks) {
    return { signer: signerFromEnv(service, privateJwk), publicKeys: publicKeysFromEnv(jwks) };
  }
  if (privateJwk || jwks) {
    // Half a configuration is a deployment mistake: never fall back to the development seed (QC Lần 1 G5).
    const missing = privateJwk ? SERVICE_AUTH_ENV.publicKeys : SERVICE_AUTH_ENV.privateKey;
    throw new Error(`service auth keys incomplete: ${missing} is missing (the two variables go together)`);
  }
  const seed = env[SERVICE_AUTH_ENV.devSeed];
  if (seed) {
    if (env.NODE_ENV === 'production') {
      throw new Error(`${SERVICE_AUTH_ENV.devSeed} is for local development and is refused when NODE_ENV=production`);
    }
    const keys = deriveDevServiceKeys(seed);
    return { signer: keys.signer(service), publicKeys: keys.publicKeys };
  }
  throw new Error(
    `service auth keys missing: set ${SERVICE_AUTH_ENV.privateKey} and ${SERVICE_AUTH_ENV.publicKeys}, or ${SERVICE_AUTH_ENV.devSeed} for local development`,
  );
}

// Parse errors of V8 quote the start of the value: never let them reach a log (QC Lần 1 G4).
function signerFromEnv(service: ServiceName, value: string): ServiceSigner {
  try {
    return localServiceSigner(service, JSON.parse(value) as JsonWebKey);
  } catch {
    throw new Error(`${SERVICE_AUTH_ENV.privateKey} is not a valid P-256 private JWK`);
  }
}

function publicKeysFromEnv(value: string): ServicePublicKeys {
  let document: unknown;
  try {
    document = JSON.parse(value);
  } catch {
    throw new Error(`${SERVICE_AUTH_ENV.publicKeys} is not valid JSON (expected a JWKS)`);
  }
  return servicePublicKeysFromJwks(document as ServiceJwks);
}

function keySet(privateKeys: Map<ServiceName, KeyObject>) {
  const publicKeys = servicePublicKeys(Object.fromEntries(privateKeys));
  return {
    privateKeys,
    publicKeys,
    signer(service: ServiceName): ServiceSigner {
      const key = privateKeys.get(service);
      if (!key) throw new TypeError(`no key for service “${service}”`);
      return localServiceSigner(service, key);
    },
  };
}

function publicFromJwk(jwk: JsonWebKey): KeyObject {
  // Never keep a private part handed in by mistake.
  const { kty, crv, x, y } = jwk;
  return createPublicKey({ key: { kty, crv, x, y }, format: 'jwk' });
}

function isKeyObject(value: unknown): value is KeyObject {
  return typeof value === 'object' && value !== null && typeof (value as KeyObject).export === 'function' && 'asymmetricKeyType' in value;
}

function assertP256(key: KeyObject, type: 'private' | 'public', service: string): void {
  if (key.type !== type || key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new TypeError(`key of “${service}” must be an EC P-256 ${type} key (ES256)`);
  }
}
