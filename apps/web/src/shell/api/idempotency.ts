// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Idempotency-Key for commands (DATA-IDEMP-001): one key per user operation, reused when the same operation
// is sent again after a failure (EC10), dropped once the server has answered with success.

export function createIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

export class IdempotencyKeys {
  private readonly keys = new Map<string, string>();

  constructor(private readonly create: () => string = createIdempotencyKey) {}

  /** Key for an operation, e.g. `answerPrompt:<promptId>`; the same until `done`. */
  keyFor(operation: string): string {
    let key = this.keys.get(operation);
    if (!key) {
      key = this.create();
      this.keys.set(operation, key);
    }
    return key;
  }

  done(operation: string): void {
    this.keys.delete(operation);
  }

  /**
   * Run a command with the operation's key. Success forgets the key. When the outcome is unknown (no answer, or a
   * 5xx) the key is kept, so a retry of the same operation sends the same key and the server returns the first
   * result instead of acting twice (EC10). A definite refusal (4xx) also forgets it: the user corrects the input and
   * sends a new request, which must not hit 422 idempotency_key_reused.
   */
  async run<T>(operation: string, send: (key: string) => Promise<T>): Promise<T> {
    try {
      const result = await send(this.keyFor(operation));
      this.done(operation);
      return result;
    } catch (error) {
      const status = (error as { status?: unknown } | null)?.status;
      if (typeof status === 'number' && status < 500) this.done(operation);
      throw error;
    }
  }
}
