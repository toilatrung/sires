// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
const { existsSync, readFileSync } = require('node:fs');
const { join, posix } = require('node:path');
const { parse } = require('smol-toml');

module.exports = {
  name: 'sires-uv-workspace',
  createDependencies(_options, context) {
    const projectsByPackage = new Map();
    for (const project of Object.values(context.projects)) {
      if (!project.tags?.includes('lang:python')) continue;
      const sourceFile = posix.join(project.root, 'pyproject.toml');
      const manifestPath = join(context.workspaceRoot, sourceFile);
      if (!existsSync(manifestPath)) continue;
      const manifest = parse(readFileSync(manifestPath, 'utf8'));
      projectsByPackage.set(manifest.project.name, { project, sourceFile, manifest });
    }

    const edges = [];
    for (const { project, sourceFile, manifest } of projectsByPackage.values()) {
      for (const [name, source] of Object.entries(manifest.tool?.uv?.sources ?? {})) {
        const target = projectsByPackage.get(name)?.project.name;
        if (source.workspace === true && target && target !== project.name) {
          edges.push({ source: project.name, target, sourceFile, type: 'static' });
        }
      }
    }
    return edges;
  },
};
