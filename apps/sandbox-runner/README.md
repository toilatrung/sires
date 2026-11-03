# sandbox-runner

Luồng `sandbox-runner` (TypeScript, NestJS). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-13).

## Phạm vi sở hữu

Controller nhận `sandbox.build`, build LaTeX và render Mermaid trong sandbox gVisor không mạng (kiến trúc 9).

| Mục | Giá trị |
| --- | --- |
| Database | Không có |
| Cổng cục bộ | 3109 (ghi đè bằng biến `PORT`) |
| Hợp đồng | Lệnh `sandbox.build`, phản hồi `sandbox.reply.*` trong `events/asyncapi.yaml` |
| Bản sao chỉ đọc | Chưa có. Ghi ở đây khi service giữ bản sao dữ liệu của service khác (kiến trúc 3.6.2). |

## Chạy

```bash
pnpm --filter @sires/sandbox-runner dev
```

Image sandbox ở `sandbox/latex/` và `sandbox/mermaid/`, chốt sau SPK-06, SPK-07.

## Ranh giới

Chỉ luồng `sandbox-runner` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
