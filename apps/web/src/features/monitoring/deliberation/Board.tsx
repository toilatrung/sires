// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Deliberation Board of one session (PID-00083 S02, Workflow--view-deliberation-*): one column per participant, one
// row per round (independent, cross-critique, narrow). An open round shows only “Đang viết…” cells (entries of an open
// round are never shown, CTX-BOARD-002); a closed round without an entry of a party shows “Không có lập trường”.
// Critique points link to their target point and targets link back, all reachable by keyboard.

import type { MouseEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatTime } from '../../../shell';
import { hrefs, partyKey, partyName, shortCode, type Detail, type Entry, type Party, type Schemas } from './model';

type Position = Schemas['PositionContent'];
type Critique = Schemas['CritiqueContent'];
type Finding = Schemas['FindingContent'];
type Retraction = Schemas['RetractionContent'];

export const pointAnchor = (entryId: string, pointId: string) => `dl-point-${entryId}-${pointId}`;

/** Move focus to an anchor inside the page (the board's links are in-page). */
export function focusAnchor(event: MouseEvent<HTMLAnchorElement>, anchor: string) {
  const target = document.getElementById(anchor);
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView?.({ block: 'center' });
  target.focus();
}

const initial = (party: Party) => (party.agent === 'orchestrator' ? 'O' : (party.instance ?? 'A'));

export function Board({ projectId, detail }: { projectId: string; detail: Detail }) {
  const { t } = useTranslation('monitoring');
  const rounds = detail.rounds.filter((r) => r.kind === 'independent' || r.kind === 'cross_critique' || r.kind === 'narrow');
  // Only entries of closed rounds count, also for back links, replacements and retractions: an entry of an open round
  // in the data (the contract leaves them in pendingEntries) never shows, not even as a count (DEC-47, OQ-101).
  const closedRounds = new Set(detail.rounds.filter((r) => r.closed).map((r) => r.round));
  const visible = detail.entries.filter((e) => e.type !== 'problem_brief' && e.type !== 'synthesis' && e.round != null && closedRounds.has(e.round));
  const byId = new Map(detail.entries.map((e) => [e.id, e]));
  const supersededBy = new Map(visible.filter((e) => e.supersedesEntryId).map((e) => [e.supersedesEntryId!, e]));
  const retractions = new Map(visible.filter((e) => e.type === 'retraction').map((e) => [(e.content as Retraction).targetEntryId, e]));
  // Critique points pointing at each target point, for the back links (EC05).
  const backLinks = new Map<string, { entry: Entry; pointId: string }[]>();
  for (const entry of visible) {
    if (entry.type !== 'critique') continue;
    for (const p of (entry.content as Critique).points) {
      const target = pointAnchor(p.targetEntryId ?? (entry.content as Critique).targetEntryId, p.targetPointId);
      backLinks.set(target, [...(backLinks.get(target) ?? []), { entry, pointId: p.id }]);
    }
  }

  const cell = (round: Schemas['DeliberationRound'], participant: Schemas['DeliberationParticipant']): ReactNode => {
    const key = partyKey(participant);
    if (!round.closed) {
      const pending = (detail.pendingEntries ?? []).some((p) => p.round === round.round && partyKey(p.author) === key);
      return pending ? (
        <p className="dl-pending">
          <span data-running="">{t('deliberation.pending')}</span>
        </p>
      ) : null;
    }
    const own = visible.filter((e) => e.round === round.round && partyKey(e.author) === key && e.type !== 'retraction');
    if (own.length === 0) {
      // The party's Agent Run failed: the error style of the reference screen, with the run (EC13).
      if (participant.status === 'error') {
        const runId = participant.currentAgentRunId ?? undefined;
        return (
          <div className="dl-none" data-failed="" role="note">
            <strong>{t('deliberation.noPosition')}</strong>
            {runId && <span>{t('deliberation.runFailed', { id: shortCode('ar', runId) })}</span>}
            {runId && <Link to={hrefs.agentRun(projectId, runId)}>{t('deliberation.viewRun', { id: shortCode('ar', runId) })}</Link>}
          </div>
        );
      }
      return (
        <div className="dl-none">
          <p>{t('deliberation.noPosition')}</p>
        </div>
      );
    }
    return own.map((entry) => (
      <EntryCard key={entry.id} entry={entry} byId={byId} supersededBy={supersededBy.get(entry.id)} retraction={retractions.get(entry.id)} backLinks={backLinks} projectId={projectId} />
    ));
  };

  return (
    <section className="dl-board" aria-label={t('deliberation.board')}>
      <div className="dl-board__head" role="presentation">
        {detail.participants.map((p) => {
          const perspective = detail.brief.perspectives.find((x) => partyKey(x.participant) === partyKey(p))?.perspective;
          return (
            <div key={partyKey(p)} className="dl-party">
              <span className="dl-party__name">{partyName(p)}</span>
              <span className="dl-party__perspective">{perspective ?? (p.agent === 'orchestrator' ? t('deliberation.orchestratorRole') : '')}</span>
              <span className="dl-party__model">
                {p.providerConnectionName ?? p.provider} · <span className="sires-id">{p.model}</span>
              </span>
              <span
                className="sires-chip dl-party__status"
                data-tone={p.status === 'running' ? 'running' : p.status === 'error' ? 'error' : 'neutral'}
                data-running={p.status === 'running' ? '' : undefined}
                data-status={p.status}
              >
                {t(`deliberation.party.${p.status}`)}
              </span>
            </div>
          );
        })}
      </div>
      {rounds.map((round) => (
        <section key={round.round} className="dl-round" aria-labelledby={`dl-round-${round.round}`}>
          <h3 id={`dl-round-${round.round}`} className="dl-round__title">
            {t(`deliberation.roundKind.${round.kind}`, { round: round.round })}
            {round.kind === 'narrow' && round.focus && <> — {round.focus}</>}{' '}
            <span className="dl-round__note">
              ·{' '}
              {round.closed
                ? t('deliberation.roundClosed', { time: round.closedAt ? formatTime(round.closedAt) : '' })
                : t('deliberation.roundOpen')}
              {round.round === 1 && round.closed && `; ${t('deliberation.hiddenUntilClosed')}`}
            </span>
          </h3>
          <div className="dl-round__cells">
            {detail.participants.map((p) => (
              <div key={partyKey(p)} className="dl-cell" role="group" aria-label={partyName(p)}>
                <span className="dl-cell__party">{partyName(p)}</span>
                {cell(round, p)}
              </div>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function Sources({ refs, projectId }: { refs?: Schemas['TypedRef'][]; projectId: string }) {
  const { t } = useTranslation('monitoring');
  if (!refs?.length) return null;
  const href = (ref: Schemas['TypedRef']) =>
    ref.type === 'reference'
      ? hrefs.reference(ref.id)
      : ref.type === 'evidence'
        ? hrefs.evidence(projectId, ref.id)
        : ref.type.startsWith('artifact')
          ? hrefs.artifactVersion(projectId, ref.id)
          : undefined;
  return (
    <span className="dl-sources">
      {t('deliberation.sources')}{' '}
      {refs.map((ref, i) => {
        const label = `${t(`deliberation.refType.${ref.type}`, { defaultValue: ref.type })} ${ref.version !== undefined ? `v${ref.version}` : `…${ref.id.slice(-4)}`}`;
        const target = href(ref);
        return (
          <span key={`${ref.type}-${ref.id}`}>
            {i > 0 && ', '}
            {target ? <Link to={target}>{label}</Link> : label}
          </span>
        );
      })}
    </span>
  );
}

function EntryCard({
  entry,
  byId,
  supersededBy,
  retraction,
  backLinks,
  projectId,
}: {
  entry: Entry;
  byId: Map<string, Entry>;
  supersededBy?: Entry;
  retraction?: Entry;
  backLinks: Map<string, { entry: Entry; pointId: string }[]>;
  projectId: string;
}) {
  const { t } = useTranslation('monitoring');
  const retracted = entry.status === 'retracted' || Boolean(retraction);
  const reason = retraction ? (retraction.content as Retraction).reason : undefined;

  const body = (
    <>
      <p className="dl-entry__type">
        {t(`deliberation.entryType.${entry.type}`)} · <span lang="en">{entry.type}</span>
        {entry.supersedesEntryId && <span className="dl-flag" data-flag="changed">{t('deliberation.changedPosition')}</span>}
        {entry.needsReview && <span className="dl-flag" data-flag="review">{t('deliberation.needsReview')}</span>}
        {retracted && <span className="dl-flag" data-flag="retracted">{t('deliberation.retracted')}</span>}
      </p>
      {entry.supersedesEntryId && entry.changeReason && <p className="dl-entry__reason">{t('deliberation.changeReason', { reason: entry.changeReason })}</p>}
      {retracted && reason && <p className="dl-entry__reason">{t('deliberation.retractReason', { reason })}</p>}
      <EntryContent entry={entry} byId={byId} backLinks={backLinks} projectId={projectId} />
      <p className="dl-entry__meta">
        {entry.type === 'position' && <>{t('deliberation.confidence', { level: t(`deliberation.level.${(entry.content as Position).confidence}`) })} · </>}
        {entry.status} <span className="sires-num">{formatTime(entry.updatedAt ?? entry.createdAt)}</span>
      </p>
    </>
  );

  if (supersededBy) {
    return (
      <details className="dl-entry" data-state="replaced">
        <summary>
          {t('deliberation.replaced')} — {entry.type === 'position' ? (entry.content as Position).option : t(`deliberation.entryType.${entry.type}`)}
        </summary>
        {body}
      </details>
    );
  }
  return (
    <article className="dl-entry" data-state={retracted ? 'retracted' : entry.needsReview ? 'review' : undefined}>
      {body}
    </article>
  );
}

function EntryContent({ entry, byId, backLinks, projectId }: { entry: Entry; byId: Map<string, Entry>; backLinks: Map<string, { entry: Entry; pointId: string }[]>; projectId: string }) {
  const { t } = useTranslation('monitoring');
  if (entry.type === 'position') {
    const content = entry.content as Position;
    return (
      <>
        <p className="dl-entry__option">{content.option}</p>
        <ul className="dl-points">
          {content.points.map((p) => {
            const anchor = pointAnchor(entry.id, p.id);
            const critics = backLinks.get(anchor) ?? [];
            return (
              <li key={p.id} id={anchor} tabIndex={-1} className="dl-point">
                <span className="sires-id">{p.id}</span>
                {p.assumption && <span className="dl-flag" data-flag="assumption">{t('deliberation.assumption')}</span>}
                {p.criterion && <span className="dl-point__criterion">{p.criterion}</span>}
                <span>{p.text}</span>
                <Sources refs={p.sourceRefs} projectId={projectId} />
                {critics.length > 0 && (
                  <span className="dl-point__critics">
                    {t('deliberation.critiques', { count: critics.length })}:{' '}
                    {critics.map((c, i) => {
                      const back = pointAnchor(c.entry.id, c.pointId);
                      return (
                        <span key={back}>
                          {i > 0 && ', '}
                          <a href={`#${back}`} onClick={(e) => focusAnchor(e, back)}>
                            {initial(c.entry.author)}·{c.pointId}
                          </a>
                        </span>
                      );
                    })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </>
    );
  }
  if (entry.type === 'critique') {
    const content = entry.content as Critique;
    return (
      <ul className="dl-points">
        {content.points.map((p) => {
          const targetEntry = byId.get(p.targetEntryId ?? content.targetEntryId);
          const target = pointAnchor(targetEntry?.id ?? content.targetEntryId, p.targetPointId);
          return (
            <li key={p.id} id={pointAnchor(entry.id, p.id)} tabIndex={-1} className="dl-point">
              <span className="dl-flag" data-flag={p.kind}>
                {t(`deliberation.critiqueKind.${p.kind}`)}
              </span>{' '}
              →{' '}
              <a href={`#${target}`} onClick={(e) => focusAnchor(e, target)} aria-label={t('deliberation.toPoint', { point: `${targetEntry ? partyName(targetEntry.author) : ''} ${p.targetPointId}` })}>
                {targetEntry ? initial(targetEntry.author) : '?'}·{p.targetPointId}
              </a>
              {p.assumption && <span className="dl-flag" data-flag="assumption">{t('deliberation.assumption')}</span>}
              <span>{p.text}</span>
              <Sources refs={p.sourceRefs} projectId={projectId} />
            </li>
          );
        })}
      </ul>
    );
  }
  if (entry.type === 'finding') {
    const content = entry.content as Finding;
    return (
      <>
        <p className="dl-entry__option">{content.summary}</p>
        <ul className="dl-points">
          {content.points.map((p) => (
            <li key={p.id} id={pointAnchor(entry.id, p.id)} tabIndex={-1} className="dl-point">
              <span className="sires-id">{p.id}</span>
              {p.assumption && <span className="dl-flag" data-flag="assumption">{t('deliberation.assumption')}</span>}
              <span>{p.text}</span>
              <Sources refs={p.sourceRefs} projectId={projectId} />
            </li>
          ))}
        </ul>
      </>
    );
  }
  return null;
}
