# agent-core

Luồng `agent-core` (Python, FastAPI). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-8).

## Phạm vi sở hữu

Thực thi Agent Run: Orchestrator và tám Specialist Agent (Analysis Agent chạy instance A, B), agent registry, prompt template, Context Assembler, Model Gateway ba provider, tool, kiểm tra kết nối provider.

| Mục | Giá trị |
| --- | --- |
| Database | `sires_agent_core` (DDL tham chiếu: `docs/database/ddl/agent-core.sql`) |
| Cổng cục bộ | 8101 (ghi đè bằng biến `PORT`) |
| Hợp đồng | `internal/agent-core.yaml`, lệnh `agent.run`, stream `chat.delta` |
| Bản sao chỉ đọc | Chưa có. Ghi ở đây khi service giữ bản sao dữ liệu của service khác (kiến trúc 3.6.2). |

## Chạy

```bash
uv sync --all-packages
pnpm nx run agent-core:dev
```

Kiểm tra: `curl http://localhost:8101/health`.

## Ranh giới

Chỉ luồng `agent-core` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
