// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Pieces shared by Discover, Trusted Library and Reference (PID-00098).

import type { PublicApi } from '@sires/contracts';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog as ShellDialog } from '../../shell';

export type Schemas = PublicApi.components['schemas'];
export type Reference = Schemas['Reference'];
export type ReferenceMetadata = Schemas['ReferenceMetadata'];
export type DiscoveredResult = Schemas['DiscoveredResult'];
export type Workflow = Schemas['Workflow'];

export const NS = 'library';
export const MAX_BATCH = 50;
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

/** “Lewis, Perez, et al. · 2020 · NeurIPS”; missing parts become “—” or “thiếu năm” (EC12). */
export function MetaLine({ metadata }: { metadata: ReferenceMetadata }) {
  const { t } = useTranslation(NS);
  const names = metadata.authors.map((a) => a.name).filter(Boolean);
  const authors = names.length === 0 ? t('meta.noAuthor') : names.length > 3 ? `${names.slice(0, 3).join(', ')}, et al.` : names.join(', ');
  return (
    <span className="library-meta">
      {authors} · {metadata.year ? <span className="sires-num">{metadata.year}</span> : t('meta.noYear')} · {metadata.venue ?? '—'}
    </span>
  );
}

/** Only http(s) links; anything else renders as text (EC14). */
export function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

/** Eligible for import: has a title and at least one author (LIB-IMPORT-001 minimum metadata; EC12). */
export function hasMinimumMetadata(metadata: ReferenceMetadata): boolean {
  return Boolean(metadata.title?.trim()) && metadata.authors.some((a) => a.name?.trim());
}

export function sourceName(source: string): string {
  return source === 'openalex' ? 'OpenAlex' : source === 'google_scholar' ? 'Google Scholar' : source;
}

/**
 * The modal dialog of design.md §4 through the shell's Dialog: 480px, consequence before the confirm button, Escape
 * cancels, Tab stays inside, focus returns to the opener (QC G5).
 */
export function Dialog({ title, children, onClose, actions }: { title: ReactNode; children: ReactNode; onClose: () => void; actions: ReactNode }) {
  return <ShellDialog title={title} onCancel={onClose} actions={actions}>{children}</ShellDialog>;
}

/** Label of a Discovered Result or of a not-yet-trusted row: always dashed, never a status chip (AC01). */
export function UnreviewedLabel() {
  const { t } = useTranslation(NS);
  return <span className="library-tag" data-tone="proposed">{t('label.unreviewed')}</span>;
}
