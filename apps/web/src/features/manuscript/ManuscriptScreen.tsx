// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Route of the Manuscript screen (PID-00115 S02): /projects/{projectId}/manuscript/<file path>?proposal=<id>.
// Phone width shows the proposal review only (H21); otherwise the workspace, or the init block when the project
// has no Manuscript yet (H5), or “Không tìm thấy” for a project the account cannot see (EC04).

import { useParams } from 'react-router';
import { NotFound, useNavigationData } from '../../shell';
import { InitPanel } from './layout/InitPanel';
import { Workspace } from './layout/Workspace';
import { MobileProposals } from './mobile/MobileProposals';
import { ManuscriptProvider, useManuscript } from './state';
import { useLayout } from './ui';

export function ManuscriptScreen() {
  const params = useParams();
  const projectId = params.projectId ?? '';
  const initialPath = params['*'] ? decodeURIComponent(params['*']) : undefined;
  return (
    <ManuscriptProvider key={projectId} projectId={projectId} initialPath={initialPath}>
      <ManuscriptBody />
    </ManuscriptProvider>
  );
}

function ManuscriptBody() {
  const layout = useLayout();
  const navigation = useNavigationData();
  const { manuscript, projectId } = useManuscript();
  if (navigation.project?.id === projectId && navigation.project.state === 'not-found') return <NotFound />;
  if (manuscript.status === 'error' && manuscript.error.status === 404) return <NotFound />;
  if (layout === 'phone') return <MobileProposals />;
  if (manuscript.status === 'ready' && manuscript.data === null) return <InitPanel />;
  return <Workspace layout={layout} />;
}
