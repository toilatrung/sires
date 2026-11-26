// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Files and outline pane (PID-00115 S03). Stub until S03: the file list opens a file.

import { useTranslation } from 'react-i18next';
import { useManuscript } from '../state';

export function FilePanel() {
  const { t } = useTranslation('manuscript');
  const { fileList, openFile, active } = useManuscript();
  return (
    <nav aria-label={t('files.title')}>
      <ul className="ms-tree">
        {fileList.map((file) => (
          <li key={file.id}>
            <button type="button" className="ms-tree__file sires-id" aria-current={active === file.id ? 'true' : undefined} onClick={() => openFile(file.id)}>
              {file.path}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
