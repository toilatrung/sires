// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Accept / reject a Draft version (S08, H9; APR-03, APR-06, APR-07): “Chấp nhận v{n}” is the only primary button of
// Research Artifacts, the consequence line always sits under the buttons, the UI blocks a synthesis with undecided
// claims and a diagram whose check is not valid (the server checks again). Accepted, Rejected, Superseded are read-only.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ErrorState, useApi, useShell, type ApiError } from '../../shell';
import { useSingleFlight, toApiError, type Schemas } from './data';
import { Dialog } from './Dialog';
import { paths, problemDetail } from './labels';

type Version = Schemas['ArtifactVersion'];

export interface DecisionBlocker {
  reason: string;
  /** Undecided claims of a synthesis, listed with links (SYN-HUMAN-REVIEW-001-AC03). */
  claims?: Schemas['Claim'][];
}

export function ArtifactDecision({ projectId, artifact, version, versions, blocker, onDecided }: {
  projectId: string; artifact: Schemas['Artifact']; version: Version; versions: Version[]; blocker?: DecisionBlocker; onDecided: () => void;
}) {
  const { t } = useTranslation('research');
  const api = useApi();
  const { idempotency } = useShell();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [failure, setFailure] = useState<{ action: 'accept' | 'reject'; error: ApiError } | undefined>();
  const once = useSingleFlight();
  const current = artifact.currentAcceptedVersionId && artifact.currentAcceptedVersionId !== version.id
    ? versions.find((row) => row.id === artifact.currentAcceptedVersionId)
    : undefined;
  const path = { projectId, artifactId: artifact.id, versionId: version.id };

  const decide = (action: 'accept' | 'reject') => once(async () => {
    setBusy(true);
    setFailure(undefined);
    try {
      if (action === 'accept') {
        await idempotency.run(`acceptArtifactVersion:${version.id}`, (key) =>
          api.post('/projects/{projectId}/artifacts/{artifactId}/versions/{versionId}/accept', { path, body: {}, idempotencyKey: key }));
      } else {
        await idempotency.run(`rejectArtifactVersion:${version.id}`, (key) =>
          api.post('/projects/{projectId}/artifacts/{artifactId}/versions/{versionId}/reject', { path, body: note.trim() ? { note: note.trim() } : {}, idempotencyKey: key }));
      }
      setRejecting(false);
      setNote('');
    } catch (error) {
      // 409 / 400: show the reason and code, reload artifact and versions (EC41).
      setFailure({ action, error: toApiError(error) });
      setRejecting(false);
    } finally {
      setBusy(false);
      onDecided();
    }
  });

  const n = version.versionNumber;
  const refusal = failure && (
    <ErrorState
      error={failure.error}
      ns="research"
      title={failure.action === 'accept' ? t('decision.acceptRefused', { version: n }) : t('decision.rejectRefused', { version: n })}
      description={problemDetail(failure.error)}
      next={t('decision.reloaded')}
    />
  );
  // Decided elsewhere (409): the reloaded version is read-only, the refusal stays visible.
  if (version.status !== 'Draft') return refusal ? <div className="research-decision">{refusal}</div> : null;
  return (
    <div className="research-decision">
      <div className="research-actions">
        <button type="button" className="sires-button" disabled={busy} onClick={() => setRejecting(true)}>{t('decision.reject')}</button>
        <button
          type="button"
          className="sires-button"
          data-variant="primary"
          disabled={busy || Boolean(blocker)}
          aria-busy={busy || undefined}
          aria-describedby={blocker ? 'research-decision-blocker' : undefined}
          onClick={() => void decide('accept')}
        >
          {t('decision.accept', { version: n })}
        </button>
      </div>
      {blocker && (
        <div id="research-decision-blocker" className="research-reason">
          <span>{blocker.reason}</span>
          {blocker.claims && blocker.claims.length > 0 && (
            <ul>
              {blocker.claims.map((claim) => <li key={claim.id}><Link to={paths.claim(projectId, claim.id)}>{claim.statement}</Link></li>)}
            </ul>
          )}
        </div>
      )}
      <p className="research-meta">
        {t('decision.effect', { version: n })}
        {current && <> {t('decision.effectSuperseded', { version: current.versionNumber })}</>}
      </p>
      {refusal}
      {rejecting && (
        <Dialog
          title={t('decision.rejectTitle', { version: n })}
          cancelLabel={t('decision.keepDraft')}
          onCancel={() => setRejecting(false)}
          confirm={{ label: t('decision.rejectConfirm', { version: n }), onConfirm: () => void decide('reject'), busy }}
        >
          <p>{artifact.title} · {artifact.type} · v{n}</p>
          <ul>
            <li>{t('decision.rejectEffect', { version: n })}</li>
          </ul>
          <label className="sires-field">
            <span className="sires-field__label">{t('decision.noteOptional')}</span>
            <textarea className="sires-input" rows={3} value={note} onChange={(event) => setNote(event.currentTarget.value)} />
          </label>
        </Dialog>
      )}
    </div>
  );
}
