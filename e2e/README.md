# e2e

Luồng `e2e`: Playwright theo kịch bản TS của PRD 19, k6, kiểm thử bảo mật tự động, smoke staging và production ([docs/tickets 3.15](../docs/tickets/sections/03-track-plans.html#s-3-15)). Không chạy trong `test` mặc định.

```bash
pnpm --filter @sires/e2e exec playwright install chromium
pnpm --filter @sires/e2e e2e
```

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../LICENSES.md).
