#!/usr/bin/env bash
# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
set -eu
mkdir -p /tmp/pid-00034-qc/e2e /tmp/pid-00034-qc/docs
cd /tmp/pid-00034-qc/e2e
cp -r /source/e2e/tests /source/e2e/fixtures .
cp /source/e2e/playwright.config.ts .
cp -r /source/docs/api-design /tmp/pid-00034-qc/docs/
printf '{"type":"module"}\n' > package.json
npm install --cache /tmp/npm-cache --no-audit --no-fund --ignore-scripts @playwright/test@1.64.1 yaml@2.9.0
cat > serve.cjs <<'JS'
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
http.createServer((req, res) => {
  const root = '/source/apps/web/dist';
  const pathname = new URL(req.url, 'http://localhost').pathname;
  let file = path.join(root, pathname);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.setHeader('Content-Type', ({'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
}).listen(5173, '127.0.0.1');
JS
node serve.cjs &
serverpid=$!
trap 'kill "$serverpid"' EXIT
export E2E_BASE_URL=http://127.0.0.1:5173
export E2E_CHROMIUM_EXECUTABLE=/usr/bin/chromium
node node_modules/@playwright/test/cli.js test
mkdir -p /output
cp test-results/junit.xml /output/junit.xml
