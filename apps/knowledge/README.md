# knowledge

Luồng `knowledge` (Python, FastAPI). Kế hoạch: [docs/tickets mục 3](../../docs/tickets/sections/03-track-plans.html#s-3-10).

## Phạm vi sở hữu

SourceDocument, Chunk, vector: trích xuất PDF, chia chunk, embedding, pgvector, API truy xuất lai; nhận lệnh `knowledge.index`.

| Mục | Giá trị |
| --- | --- |
| Database | `sires_knowledge` (DDL tham chiếu: `docs/database/ddl/knowledge.sql`) |
| Cổng cục bộ | 8102 (ghi đè bằng biến `PORT`) |
| Hợp đồng | `internal/knowledge.yaml`, lệnh `knowledge.index` |
| Bản sao chỉ đọc | Chưa có. Ghi ở đây khi service giữ bản sao dữ liệu của service khác (kiến trúc 3.6.2). |

## Chạy

```bash
uv sync --all-packages
pnpm nx run knowledge:dev
```

Kiểm tra: `curl http://localhost:8102/health`.

## Ranh giới

Chỉ luồng `knowledge` sửa thư mục này. Không import mã hay đọc database của service khác; gọi qua hợp đồng ở `docs/api-design` (quy tắc 1.4.1–1.4.6, [docs/tickets mục 1](../../docs/tickets/sections/01-tracks-and-boundaries.html#s-1-4)). Migration đặt ở `migrations/`, giá trị Helm riêng ở `deploy/values.yaml`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
