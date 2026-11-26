// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Manual import on Discover (#nhap-thu-cong, PID-00098 S05): one createReferenceManually per DOI, BibTeX pasted or
// from a .bib file, PDF checked on the device first (≤ 50 MB). Everything lands in Pending Approval, never Trusted.

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useApi, useDraft, useShell, type ApiError } from '../../shell';
import { MAX_BATCH, MAX_PDF_BYTES, NS, type Reference } from './common';

const DOI = /^10\.\d{4,9}\/\S+$/i;
type Line = { kind: 'created' | 'duplicate' | 'error'; label: string; reference?: Reference; duplicateOf?: string; detail?: string };

export function normalizeDoi(line: string): string {
  return line.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
}

export function ManualImport() {
  const { t } = useTranslation(NS);
  const api = useApi();
  const { idempotency } = useShell();
  const id = useId();
  const doiDraft = useDraft('library.manual.doi');
  const bibDraft = useDraft('library.manual.bibtex');
  const [doiError, setDoiError] = useState<string>();
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [pdfMessage, setPdfMessage] = useState<{ tone: 'info' | 'error'; text: string }>();

  const toLine = (ref: Reference): Line => ref.duplicateWarnings?.[0]?.referenceId
    ? { kind: 'duplicate', label: ref.metadata.title, reference: ref, duplicateOf: ref.duplicateWarnings[0].referenceId }
    : { kind: 'created', label: ref.metadata.title, reference: ref };

  const sendDois = async () => {
    const raw = doiDraft.value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (raw.length > MAX_BATCH) { setDoiError(t('manual.doi.tooMany', { max: MAX_BATCH })); return; }
    const invalid = raw.filter((l) => !DOI.test(normalizeDoi(l)));
    setDoiError(invalid.length ? t('manual.doi.invalid', { lines: invalid.join(', ') }) : undefined);
    const valid = raw.filter((l) => DOI.test(normalizeDoi(l)));
    if (!valid.length) return;
    setBusy(true);
    const out: Line[] = [];
    const keep: string[] = [...invalid];
    for (const line of valid) {
      const doi = normalizeDoi(line);
      try {
        // One request and one Idempotency-Key per DOI (LIB-IMPORT-002-AC01); the same DOI sent again after an unknown
        // outcome (5xx, network) reuses its key, so it cannot create the reference twice (QC G10).
        const { data } = await idempotency.run(`createReferenceManually:doi:${doi}`, (key) => api.post('/references', { body: { doi }, idempotencyKey: key }));
        out.push(...(data.items ?? []).map(toLine));
      } catch (e) {
        const error = e as ApiError;
        out.push({ kind: 'error', label: doi, detail: `${t(`error.${error.code}`, { defaultValue: t('manual.failed') })} (${error.code})` });
        keep.push(line);
      }
    }
    setLines(out);
    doiDraft.setValue(keep.join('\n'));
    if (!keep.length) doiDraft.clear();
    setBusy(false);
  };

  const sendBibtex = async () => {
    const bibtex = bibDraft.value.trim();
    if (!bibtex) return;
    setBusy(true);
    try {
      const { data } = await idempotency.run(`createReferenceManually:bibtex:${bibtex}`, (key) => api.post('/references', { body: { bibtex }, idempotencyKey: key }));
      setLines([
        ...(data.items ?? []).map(toLine),
        ...(data.errors ?? []).map((p) => ({ kind: 'error' as const, label: t('manual.bibtex.entry'), detail: `${p.detail ?? p.title} (${p.code})` })),
      ]);
      if (!data.errors?.length) bibDraft.clear();
    } catch (e) {
      const error = e as ApiError;
      setLines([{ kind: 'error', label: 'BibTeX', detail: `${t('manual.failed')} (${error.code})` }]);
    } finally {
      setBusy(false);
    }
  };

  const sendPdf = async (file: File | undefined) => {
    if (!file) return;
    // Checked on the device before any request (OQ-050, EC26).
    if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) { setPdfMessage({ tone: 'error', text: t('pdf.notPdf') }); return; }
    if (file.size > MAX_PDF_BYTES) { setPdfMessage({ tone: 'error', text: t('pdf.tooLarge') }); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await idempotency.run(`importReferenceFromPdf:${file.name}:${file.size}:${file.lastModified}`,
        (key) => api.post('/references/pdf-imports', { body: form, idempotencyKey: key }));
      setPdfMessage({ tone: 'info', text: t('pdf.accepted', { name: file.name }) });
    } catch (e) {
      const error = e as ApiError;
      const reason = error.code === 'pdf_without_text_layer' ? t('pdf.noText') : error.code === 'payload_too_large' || error.status === 413 ? t('pdf.tooLarge')
        : error.code === 'unsupported_media_type' || error.status === 415 ? t('pdf.notPdf') : t('manual.failed');
      setPdfMessage({ tone: 'error', text: `${reason} (${error.code})` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="nhap-thu-cong" className="library-card library-manual" aria-labelledby="manual-title">
      <h2 id="manual-title" className="library-card__title">{t('manual.title')}</h2>
      <p className="library-muted">{t('manual.hint')}</p>
      <div className="library-manual__grid">
        <div className="library-manual__part">
          {/* Errors and hints sit outside the label (aria-describedby), so the field's name stays its label. */}
          <div className="sires-field">
            <label className="sires-field__label" htmlFor={`${id}-doi`}>{t('manual.doi.label')}</label>
            <textarea id={`${id}-doi`} className="sires-input library-textarea" rows={4} value={doiDraft.value} placeholder="10.1145/3703155" aria-invalid={Boolean(doiError)}
              aria-describedby={doiError ? `${id}-doi-error` : undefined} onChange={(e) => doiDraft.setValue(e.currentTarget.value)} />
            {doiError && <span id={`${id}-doi-error`} className="library-field-error">{doiError}</span>}
          </div>
          <button type="button" className="sires-button" data-size="sm" disabled={busy || !doiDraft.value.trim()} onClick={() => void sendDois()}>{t('manual.submit')}</button>
        </div>
        <div className="library-manual__part">
          <label className="sires-field"><span className="sires-field__label">{t('manual.bibtex.label')}</span>
            <textarea className="sires-input library-textarea library-mono" rows={4} value={bibDraft.value} onChange={(e) => bibDraft.setValue(e.currentTarget.value)} />
          </label>
          <span className="library-inline-actions">
            <label className="sires-button" data-size="sm">{t('manual.bibtex.file')}
              <input type="file" accept=".bib,text/x-bibtex,text/plain" hidden onChange={async (e) => {
                const file = e.currentTarget.files?.[0];
                if (file) bibDraft.setValue(await file.text());
              }} />
            </label>
            <button type="button" className="sires-button" data-size="sm" disabled={busy || !bibDraft.value.trim()} onClick={() => void sendBibtex()}>{t('manual.submit')}</button>
          </span>
        </div>
        <div className="library-manual__part">
          <div className="sires-field">
            <label className="sires-field__label" htmlFor={`${id}-pdf`}>{t('manual.pdf.label')}</label>
            <input id={`${id}-pdf`} className="sires-input" type="file" accept="application/pdf,.pdf" aria-describedby={`${id}-pdf-hint`} onChange={(e) => void sendPdf(e.currentTarget.files?.[0])} />
            <span id={`${id}-pdf-hint`} className="library-muted">{t('manual.pdf.hint')}</span>
          </div>
          {pdfMessage && <span className={pdfMessage.tone === 'error' ? 'library-item-error' : 'library-muted'} role={pdfMessage.tone === 'error' ? 'alert' : 'status'}>{pdfMessage.text}</span>}
        </div>
      </div>
      {lines.length > 0 && (
        <ul className="library-summary" aria-label={t('manual.results')}>
          {lines.map((line, index) => (
            <li key={`${line.label}-${index}`}>
              <span className="library-summary__title">{line.label}</span>
              {line.kind === 'created' && line.reference && <Link to={`/library/${line.reference.id}`}>{t('manual.created')}</Link>}
              {line.kind === 'duplicate' && (
                <span>{t('manual.duplicate')} · <Link to={`/library/${line.duplicateOf}`}>{t('discover.batch.existing')}</Link> · <Link to="/library">{t('manual.suggestMerge')}</Link></span>
              )}
              {line.kind === 'error' && <span className="library-item-error">{line.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
