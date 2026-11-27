// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Shared draft store (H7, UX-AUTH-002): unsent text of registered inputs, kept in this browser per account and
// route, so it survives a session expiry and the sign-in that follows. Never sent to the server.
// Storage: localStorage (synchronous, survives the full-page OIDC round trip); in-memory when unavailable.

const PREFIX = 'sires.draft.v1';

export interface DraftHandle {
  /** Value saved for this field before it registered (restored after sign-in), if any. */
  readonly initial: string | undefined;
  /** Save the current value; an empty string removes the draft. */
  update(value: string): void;
  /** Remove the draft, e.g. after the content was sent (EC30). */
  clear(): void;
  /** Stop tracking (unmount); the saved draft stays. */
  release(): void;
}

interface Registered {
  accountId: string;
  key: string;
  value: string;
}

class MemoryStorage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

function defaultStorage(): DraftStorage {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = `${PREFIX}:probe`;
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch {
    // Private mode or storage disabled: keep drafts for this page only.
  }
  return new MemoryStorage();
}

export class DraftStore {
  private readonly storage: DraftStorage;
  private readonly registered = new Set<Registered>();

  /** `accountId` returns the account of the current session (GET /auth/session), undefined when signed out. */
  constructor(
    private readonly accountId: () => string | undefined,
    storage?: DraftStorage,
  ) {
    this.storage = storage ?? defaultStorage();
  }

  static key(accountId: string, route: string, fieldId: string): string {
    return `${PREFIX}:${encodeURIComponent(accountId)}:${encodeURIComponent(route)}:${encodeURIComponent(fieldId)}`;
  }

  private read(key: string): string | undefined {
    try {
      const raw = this.storage.getItem(key);
      if (raw === null) return undefined;
      const parsed = JSON.parse(raw) as { value?: unknown };
      return typeof parsed.value === 'string' ? parsed.value : undefined;
    } catch {
      return undefined;
    }
  }

  private write(key: string, value: string): void {
    try {
      if (value === '') this.storage.removeItem(key);
      else this.storage.setItem(key, JSON.stringify({ value, savedAt: new Date().toISOString() }));
    } catch {
      // Quota exceeded: the input keeps its text; only the backup is lost.
    }
  }

  /** Saved draft of a field for the current account, without registering. */
  get(route: string, fieldId: string): string | undefined {
    const account = this.accountId();
    return account ? this.read(DraftStore.key(account, route, fieldId)) : undefined;
  }

  /**
   * Register an input. `route` is the in-app path the field lives on (e.g. /projects/p1/chat), `fieldId` names
   * the field inside that screen (e.g. `chat.composer`). Only drafts of the signed-in account are returned (EC29).
   */
  register(route: string, fieldId: string): DraftHandle {
    const account = this.accountId();
    if (!account) {
      return { initial: undefined, update: () => undefined, clear: () => undefined, release: () => undefined };
    }
    const key = DraftStore.key(account, route, fieldId);
    const initial = this.read(key);
    const entry: Registered = { accountId: account, key, value: initial ?? '' };
    this.registered.add(entry);
    return {
      initial,
      update: (value: string) => {
        entry.value = value;
        this.write(key, value);
      },
      clear: () => {
        entry.value = '';
        this.write(key, '');
      },
      release: () => {
        this.registered.delete(entry);
      },
    };
  }

  /** Write the current value of every registered field; the session-expired flow calls it before leaving (EC08). */
  flushAll(): void {
    for (const entry of this.registered) this.write(entry.key, entry.value);
  }

  /** Remove every draft of an account; sign-out calls it before leaving the app (EC30, S14). */
  clearAccount(accountId: string | undefined): void {
    if (!accountId) return;
    const prefix = `${PREFIX}:${encodeURIComponent(accountId)}:`;
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i += 1) {
      const key = this.storage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) this.storage.removeItem(key);
    for (const entry of this.registered) if (entry.accountId === accountId) entry.value = '';
  }
}
