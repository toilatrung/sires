// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// File tree of the manuscript (PID-00115 S03, H9): folders come from the file paths plus folders made in the
// browser that have no file yet (EC14); root files first, then folders, each sorted by name.

import type { ManuscriptFile } from '../model';

export interface FolderNode {
  kind: 'folder';
  /** Folder path without trailing slash, '' for the root. */
  path: string;
  name: string;
  folders: FolderNode[];
  files: FileNode[];
}

export interface FileNode {
  kind: 'file';
  path: string;
  name: string;
  file?: ManuscriptFile;
  /** File a Proposed Change Proposal adds (not in the revision yet, EC35). */
  proposedAdd?: boolean;
}

function folder(path: string): FolderNode {
  return { kind: 'folder', path, name: path.split('/').pop() ?? path, folders: [], files: [] };
}

export function buildTree(files: readonly ManuscriptFile[], extraFolders: readonly string[], proposedAdds: readonly string[]): FolderNode {
  const root = folder('');
  const folders = new Map<string, FolderNode>([['', root]]);
  const ensure = (path: string): FolderNode => {
    const found = folders.get(path);
    if (found) return found;
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const node = folder(path);
    folders.set(path, node);
    ensure(parentPath).folders.push(node);
    return node;
  };
  const dir = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
  for (const extra of extraFolders) ensure(extra);
  for (const file of files) ensure(dir(file.path)).files.push({ kind: 'file', path: file.path, name: file.path.split('/').pop()!, file });
  for (const path of proposedAdds) {
    if (files.some((file) => file.path === path)) continue;
    ensure(dir(path)).files.push({ kind: 'file', path, name: path.split('/').pop()!, proposedAdd: true });
  }
  const sort = (node: FolderNode) => {
    node.files.sort((a, b) => a.name.localeCompare(b.name));
    node.folders.sort((a, b) => a.name.localeCompare(b.name));
    node.folders.forEach(sort);
  };
  sort(root);
  return root;
}

/** Every file path under a folder (the folder itself excluded). */
export function filesUnder(files: readonly ManuscriptFile[], folderPath: string): ManuscriptFile[] {
  return files.filter((file) => file.path.startsWith(`${folderPath}/`));
}
