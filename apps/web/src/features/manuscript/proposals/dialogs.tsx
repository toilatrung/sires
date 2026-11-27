// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Dialogs of a Change Proposal (PID-00115 S06): reject with an optional reason, and “Yêu cầu tạo lại” with an
// instruction the Researcher can edit before it goes to the Orchestrator (H13, EC38). Focus returns to the opener.

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, type ApiError } from '../../../shell';
import { asApiError } from '../model';
import { Dialog } from '../ui';
import type { Outcome } from './useProposalActions';

export function RejectDialog({ onClose, onReject, error, busy }: { onClose: () => void; onReject: (reason: string) => Promise<Outcome>; error?: ApiError; busy: boolean }) {
  const { t } = useTranslation('manuscript');
  const id = useId();
  const [reason, setReason] = useState('');
  return (
    <Dialog title={t('proposal.rejectDialog.title')} onClose={onClose}>
      <p className="ms-dialog__body">{t('proposal.rejectDialog.body')}</p>
      <div className="sires-field">
        <label htmlFor={id}>{t('proposal.rejectDialog.reason')}</label>
        <textarea id={id} className="sires-input ms-proposal__textarea" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
      </div>
      {error && <ErrorState error={error} ns="manuscript" title={t('proposal.rejectFailed')} notSaved={t('proposal.nothingApplied')} />}
      <div className="ms-dialog__actions">
        <button type="button" className="sires-button" data-variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="sires-button"
          data-variant="danger"
          disabled={busy}
          onClick={async () => {
            const outcome = await onReject(reason);
            if (outcome === 'done' || outcome === 'refused') onClose();
          }}
        >
          {t('proposal.rejectDialog.confirm')}
        </button>
      </div>
    </Dialog>
  );
}

export function RegenerateDialog({ initial, task, onClose, onSend, busy }: { initial: string; task: string; onClose: () => void; onSend: (content: string) => Promise<void>; busy: boolean }) {
  const { t } = useTranslation('manuscript');
  const id = useId();
  const [content, setContent] = useState(initial);
  const [error, setError] = useState<ApiError | undefined>();
  const send = async () => {
    if (!content.trim()) return;
    setError(undefined);
    try {
      await onSend(content);
      onClose();
    } catch (caught) {
      setError(asApiError(caught));
    }
  };
  return (
    <Dialog title={t('proposal.regenerateDialog.title')} onClose={onClose} wide>
      <p className="ms-dialog__body">{t('proposal.regenerateDialog.body', { task })}</p>
      <div className="sires-field">
        <label htmlFor={id}>{t('proposal.regenerateDialog.label')}</label>
        <textarea id={id} className="sires-input ms-proposal__textarea" rows={6} value={content} onChange={(event) => setContent(event.target.value)} />
      </div>
      {error && <ErrorState error={error} ns="manuscript" title={t('proposal.regenerateDialog.failed')} notSaved={t('proposal.regenerateDialog.notSent')} />}
      <div className="ms-dialog__actions">
        <button type="button" className="sires-button" data-variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button type="button" className="sires-button" data-variant="outline" disabled={busy || !content.trim()} onClick={() => void send()}>
          {busy ? t('proposal.regenerateDialog.sending') : t('proposal.regenerateDialog.send')}
        </button>
      </div>
    </Dialog>
  );
}
