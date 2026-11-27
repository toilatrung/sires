// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Text of every .tex file of the current revision (PID-00115 S03): the editor's text when the file is open, else
// the server version fetched once per contentHash. Feeds the outline (Dàn ý) and the \input/\include/
// \includegraphics references shown before and after renaming or deleting a file (H9, EC10).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../../shell';
import { fileContent, fileReferences, outline, type FileReference, type OutlineItem } from '../model';
import { useManuscript } from '../state';

export interface TexIndex {
  /** Path → text, for the .tex files known so far. */
  texts: Map<string, string>;
  references: FileReference[];
  outline: OutlineItem[];
  /** True until the main file's text is known. */
  loading: boolean;
}

export function useTexIndex(): TexIndex {
  const api = useApi();
  const { fileList, docs, projectId, manuscript } = useManuscript();
  const [server, setServer] = useState<Map<string, { hash: string; text: string }>>(new Map());
  const tex = useMemo(() => fileList.filter((file) => file.fileType === 'tex'), [fileList]);
  const serverRef = useRef(server);
  serverRef.current = server;
  const docsRef = useRef(docs);
  docsRef.current = docs;

  useEffect(() => {
    let alive = true;
    for (const file of tex) {
      const known = serverRef.current.get(file.id);
      if (known && known.hash === file.contentHash) continue;
      const open = docsRef.current[file.id];
      if (open?.status === 'ready' && open.kind === 'text' && open.baseHash === file.contentHash) continue;
      void fileContent(api, projectId, file)
        .then((content) => {
          if (!alive || !('text' in content) || content.text === undefined) return;
          const text = content.text;
          setServer((current) => new Map(current).set(file.id, { hash: file.contentHash, text }));
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
    // Fetch again only when the file list (paths, hashes) changes; texts of open files come from the editor.
  }, [api, projectId, tex]);

  return useMemo(() => {
    const texts = new Map<string, string>();
    for (const file of tex) {
      const open = docs[file.id];
      if (open?.status === 'ready' && open.kind === 'text') texts.set(file.path, open.text);
      else {
        const known = server.get(file.id);
        if (known) texts.set(file.path, known.text);
      }
    }
    const references = fileReferences([...texts].map(([path, text]) => ({ path, text })));
    const mainFile = manuscript.status === 'ready' ? manuscript.data?.mainFile ?? 'main.tex' : 'main.tex';
    // Outline in document order: the main file, following \input and \include where they appear.
    const items: OutlineItem[] = [];
    const seen = new Set<string>();
    const walk = (path: string) => {
      if (seen.has(path)) return;
      seen.add(path);
      const text = texts.get(path);
      if (text === undefined) return;
      const headings = outline(path, text);
      const refs = references.filter((reference) => reference.path === path && reference.command !== 'includegraphics');
      const events = [...headings.map((item) => ({ line: item.line, item })), ...refs.map((reference) => ({ line: reference.line, reference }))]
        .sort((a, b) => a.line - b.line);
      for (const event of events) {
        if ('item' in event) items.push(event.item);
        else walk(/\.tex$/.test(event.reference.target) ? event.reference.target : `${event.reference.target}.tex`);
      }
    };
    walk(mainFile);
    return { texts, references, outline: items, loading: !texts.has(mainFile) && tex.some((file) => file.path === mainFile) };
  }, [docs, manuscript, server, tex]);
}

