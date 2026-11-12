// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// KMS stand-in for tests (PID-00004 S03): AES-256-GCM with keys held in memory. Optional additional authenticated
// data (e.g. `accountId|connectionId`) binds the ciphertext to its context; a wrong AAD, an unknown key or any
// tampering fails decryption. Ciphertext layout: version(1) | keyIdLength(1) | keyId | iv(12) | tag(16) | data.

export interface LocalKmsOptions {
  /** Id of the first key; default `local-test-key-1`. */
  keyId?: string;
  /** 32-byte key for reproducible runs; random when omitted. */
  key?: Uint8Array;
}

export class LocalKmsError extends Error {
  override readonly name = 'LocalKmsError';
}

const VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class LocalKms {
  private readonly keys = new Map<string, Buffer>();
  private primary: string;

  constructor(options: LocalKmsOptions = {}) {
    this.primary = options.keyId ?? 'local-test-key-1';
    this.addKey(this.primary, options.key);
  }

  /** Adds a key (random when `key` is omitted); `makePrimary` makes new encryptions use it, as after a rotation. */
  addKey(keyId: string, key?: Uint8Array, makePrimary = false): void {
    if (Buffer.byteLength(keyId) > 255 || keyId.length === 0) throw new LocalKmsError('keyId must be 1-255 bytes');
    if (this.keys.has(keyId)) throw new LocalKmsError(`key ${keyId} already exists`);
    if (key && key.length !== 32) throw new LocalKmsError('key must be 32 bytes (AES-256)');
    this.keys.set(keyId, Buffer.from(key ?? randomBytes(32)));
    if (makePrimary) this.primary = keyId;
  }

  get primaryKeyId(): string {
    return this.primary;
  }

  async encrypt(plaintext: Uint8Array | string, aad?: Uint8Array | string, keyId = this.primary): Promise<Buffer> {
    const key = this.keys.get(keyId);
    if (!key) throw new LocalKmsError(`unknown key ${keyId}`);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    if (aad !== undefined) cipher.setAAD(Buffer.from(aad));
    const data = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
    const id = Buffer.from(keyId, 'utf8');
    return Buffer.concat([Buffer.from([VERSION, id.length]), id, iv, cipher.getAuthTag(), data]);
  }

  async decrypt(ciphertext: Uint8Array, aad?: Uint8Array | string): Promise<Buffer> {
    const blob = Buffer.from(ciphertext);
    if (blob.length < 2 || blob[0] !== VERSION) throw new LocalKmsError('unsupported ciphertext');
    const idEnd = 2 + (blob[1] ?? 0);
    const keyId = blob.subarray(2, idEnd).toString('utf8');
    const key = this.keys.get(keyId);
    if (!key) throw new LocalKmsError(`unknown key ${keyId}`);
    const iv = blob.subarray(idEnd, idEnd + IV_LENGTH);
    const tag = blob.subarray(idEnd + IV_LENGTH, idEnd + IV_LENGTH + TAG_LENGTH);
    if (tag.length !== TAG_LENGTH) throw new LocalKmsError('truncated ciphertext');
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      if (aad !== undefined) decipher.setAAD(Buffer.from(aad));
      return Buffer.concat([decipher.update(blob.subarray(idEnd + IV_LENGTH + TAG_LENGTH)), decipher.final()]);
    } catch (error) {
      throw new LocalKmsError('decryption failed (wrong key, AAD or tampered ciphertext)', { cause: error });
    }
  }
}
