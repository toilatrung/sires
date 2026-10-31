# API — SIRes (MVP)

Đặc tả OpenAPI 3.1 cho SIRes ở mức MVP (milestone M1–M7), suy ra từ PRD v1.0 tại [../overview/index.html](../overview/index.html).
Trạng thái: **Assumption — bản đề xuất của biên soạn**, chưa phải quyết định kiến trúc; technology stack chưa chọn (DEC-27, OQ-091).

## Cấu trúc thư mục

Theo cấu trúc `docs/overview/`: một trang mục lục, các file nội dung đánh số theo mục PRD, thành phần dùng chung tách riêng.

| Đường dẫn | Vai trò | Tương ứng trong overview |
| --- | --- | --- |
| [index.html](index.html) | Mục lục API, bảng truy vết nhóm endpoint → mục PRD | `overview/index.html` |
| [openapi.yaml](openapi.yaml) | File gốc: info, quy ước, servers, security, tags, bảng paths (`$ref`) | — |
| `paths/NN-slug.yaml` | Path Item của từng mục PRD, cùng số và slug với `overview/sections/NN-slug.html` | `overview/sections/` |
| `components/schemas/*.yaml` | Schema theo domain, lấy từ mục 5 và 18 | mục 5, 18 |
| [components/parameters.yaml](components/parameters.yaml), [components/responses.yaml](components/responses.yaml) | Tham số và phản hồi lỗi dùng chung | — |
| `dist/openapi.bundled.yaml` | Bản gộp một file, sinh tự động — không sửa tay | — |
| [redocly.yaml](redocly.yaml), `.redocly.lint-ignore.yaml` | Cấu hình kiểm tra | — |
| `internal/<service>.yaml` | Hợp đồng REST nội bộ giữa các service (OpenAPI 3.1), một file mỗi service có endpoint nội bộ | architecture 3.3, 3.5 |
| [internal/schemas.yaml](internal/schemas.yaml), [internal/responses.yaml](internal/responses.yaml) | Schema dùng chung cho API nội bộ và payload message; lỗi riêng của API nội bộ | architecture 5, 10.4 |
| [events/asyncapi.yaml](events/asyncapi.yaml) | Sự kiện và lệnh qua RabbitMQ (AsyncAPI 3.0) | architecture 3.5, 6.4 |

File `paths/` hiện có: 07, 08, 09, 10, 11, 12, 13, 14, 15. Mục 15 chỉ gồm 15.12 Settings and Sign-in cùng 17.7 eTroy OIDC.
Các mục còn lại của PRD không sinh endpoint riêng; ràng buộc của chúng (16 NFR, 17 tích hợp, 18 dữ liệu) nằm trong quy ước chung và schema.

## Quy ước

- **Base path:** `/api/v1`. Đổi phá vỡ tương thích tăng major (`/api/v2`).
- **Xác thực:** chỉ eTroy OIDC (authorization code). Backend là Relying Party, cấp cookie `sires_session`; lệnh ghi gửi `X-CSRF-Token`.
- **Ownership:** tài nguyên cấp project nằm dưới `/projects/{projectId}`; tài nguyên cấp tài khoản ở gốc (`/references`, `/provider-connections`, `/me/...`). Truy cập chéo tài khoản trả `404`.
- **Chuyển trạng thái:** endpoint hành động `POST …/{verb}` (approve, reject, activate, cancel…), không cho PATCH trường `status`. Mã chuyển Task ghi ở `x-transition` (T-01–T-19, PRD 9.8).
- **Idempotency:** header `Idempotency-Key` cho mọi lệnh có tác động (DATA-IDEMP-001).
- **Concurrency:** `ETag`/`If-Match` theo `rowVersion`; lệch trả `412` (DATA-CONC-001).
- **Tác vụ dài:** `202` + `Workflow`; theo dõi bằng `GET /workflows/{id}` hoặc SSE `GET /events`.
- **Lỗi:** `application/problem+json` với `code` ổn định (danh sách trong `components/responses.yaml`).
- **Tên trạng thái:** giữ nguyên chuỗi của PRD (`In Progress`, `Pending Approval`…) để khớp mục 5/18.
- **Ngôn ngữ:** `summary`/`description` viết tiếng Việt; tên đường dẫn, trường, enum, `operationId` tiếng Anh.

### Extension truy vết

| Extension | Ý nghĩa |
| --- | --- |
| `x-requirements` | Mã requirement PRD mà operation phục vụ (ví dụ `TASK-TRIGGER-001`) |
| `x-priority` | P0/P1 theo bảng Priority đã duyệt (DEC-44) |
| `x-milestone` | M1–M7 (kế hoạch triển khai lập riêng, ngoài PRD) |
| `x-apr` | Quyền phê duyệt độc quyền của Researcher (APR-01–APR-10, PRD 3.3) — agent không bao giờ gọi |
| `x-transition` | Mã chuyển trạng thái Task (PRD 9.8) |

## Phạm vi MVP

Có: mọi requirement chức năng mục 7–14 có tương tác người dùng, Settings/Sign-in và tích hợp eTroy OIDC.
P1 vẫn nằm trong MVP và được đánh dấu `x-priority: P1` (Dashboard, tìm kiếm toàn cục, tìm theo tác giả, export bản thảo, export audit trail…).

Không có endpoint công khai (chạy nội bộ trong Orchestrator/System): ORCH-DELEGATE-001, AGENT-HANDOFF-001, CTX-ROUTING-001.
ORCH-CONFLICT-001 hiển thị qua prompt `choice`; SYN-REVIEW-001 chạy trong workflow `task_execution` và cho ra Artifact `synthesis`.

Ngoài MVP: thành viên/chia sẻ project (OWN-06), custom agent (FUT-04), provider khác ba provider đã chốt (FUT-05), thông báo ngoài ứng dụng, xóa tài khoản và export toàn project (NFR-RET-004/005 — bổ sung khi PO nâng ưu tiên).

## Kiểm tra và xem tài liệu

Kiểm tra (cần mạng để tải Redocly CLI lần đầu):

```bash
npx @redocly/cli@2.11.1 lint openapi.yaml
```

Gộp thành một file sau mỗi lần sửa:

```bash
npx @redocly/cli@2.11.1 bundle openapi.yaml -o dist/openapi.bundled.yaml
```

Xem dạng Swagger UI hoặc Redoc (chạy server cục bộ để `$ref` tương đối được phân giải):

```bash
npx @redocly/cli@2.11.1 preview-docs openapi.yaml
```

Hoặc mở `dist/openapi.bundled.yaml` trong https://editor.swagger.io.

## Hợp đồng nội bộ (architecture v0.2)

Backend chia thành nhiều service (architecture mục 3, ADR-17–ADR-20). API công khai ở trên do gateway định tuyến tới service sở hữu; giữa các service dùng hai loại hợp đồng:

| File | Service | Endpoint chính |
| --- | --- | --- |
| [internal/identity.yaml](internal/identity.yaml) | identity | resolve tài khoản OIDC, cấu hình agent cho readiness, tùy chọn agent, ngưỡng kiểm chứng, embedding, danh mục model, envelope API key, báo lỗi provider |
| [internal/orchestration.yaml](internal/orchestration.yaml) | orchestration | `start` / `heartbeat` / `result` / `failure` của Agent Run, Context Item cho lắp ráp context, mở prompt thay service khác |
| [internal/agent-core.yaml](internal/agent-core.yaml) | agent-core | agent registry, kiểm tra kết nối provider |
| [internal/workspace.yaml](internal/workspace.yaml) | workspace | context project, danh bạ project cho Global Assistant, tin nhắn gần đây, ghi tin của Orchestrator, tìm kiếm |
| [internal/planning.yaml](internal/planning.yaml) | planning | context Task, baseline, ghi Plan Version Draft, readiness ngữ nghĩa, tìm kiếm |
| [internal/library.yaml](internal/library.yaml) | library | tool `search_sources`, ghi đề xuất reference, tra cứu reference, selection của project, vị trí nội dung PDF, tìm kiếm |
| [internal/research.yaml](internal/research.yaml) | research | ghi evidence, claim, artifact version, kết quả kiểm chứng; context bundle; trạng thái cho readiness; tool Mermaid; KPI-01; tìm kiếm |
| [internal/manuscript.yaml](internal/manuscript.yaml) | manuscript | context bản thảo, ghi Change Proposal (cổng citation), kết quả build từ sandbox-runner, KPI-02 |
| [internal/knowledge.yaml](internal/knowledge.yaml) | knowledge | truy xuất lai, đọc chunk, kiểm tra quote |

gateway, audit và sandbox-runner không mở endpoint nội bộ: gateway chỉ gọi đi; audit và sandbox-runner chỉ nhận message (audit gọi `/internal/kpi/*` của research và manuscript).

### Quy ước nội bộ

- **Không qua Internet:** server là DNS nội bộ Kubernetes (`http://<service>.sires.svc.cluster.local:8080`); không có Ingress. Đường dẫn bắt đầu bằng `/internal/`.
- **Xác thực:** `Authorization: Bearer <token nội bộ>` — JWT ký bằng KMS, hạn ≤ 5 phút, nội dung theo `internal/schemas.yaml#/ServiceTokenClaims` (ADR-20). Chỉ gateway phát token actor Researcher; token của Agent Run luôn có actor agent và `agentScope`.
- **`x-callers`:** danh sách service được phép gọi operation; service khác nhận `403 caller_not_allowed`. Entity ngoài phạm vi tài khoản hoặc phạm vi agent vẫn trả `404`.
- **Ghi đầu ra của agent:** body có `meta: AgentWriteMeta` (agentRunId, outputIndex, provenance); `Idempotency-Key` = `agentRunId:outputIndex`; phản hồi `WriteAck`. Mục không hợp lệ nằm trong `rejected`, không làm hỏng cả lô (architecture 5.8).
- **Context bundle:** mọi API đọc cho Context Assembler trả `ContextBundle` gồm mục có `TypedRef` có phiên bản và lớp context (PRD 14.2), để ghi context manifest.
- **Không bao giờ trả API key dạng rõ:** identity chỉ trả envelope mã hóa cho agent-core và knowledge (ADR-10).
- Extension giữ như API công khai: `x-requirements`, `x-milestone`; thêm `x-callers`. Message trong AsyncAPI có `x-producer`, `x-consumers`, `x-requirements`.

### Sự kiện và lệnh

[events/asyncapi.yaml](events/asyncapi.yaml): exchange `sires.events` (topic, routing key = `type`, thêm đoạn con trạng thái đích với sự kiện đổi trạng thái), queue lệnh `agent.run`, `knowledge.index`, `sandbox.build`, phản hồi `sandbox.reply.research`, stream `sires.stream`. Vỏ chung `EventEnvelope` (id = id dòng outbox, `aggregate.version` để bỏ bản cũ). Phần `operations` liệt kê service nào phát và nghe message nào.

Kiểm tra:

```bash
npx @redocly/cli@2.11.1 lint internal/identity.yaml internal/orchestration.yaml internal/agent-core.yaml internal/workspace.yaml internal/planning.yaml internal/library.yaml internal/research.yaml internal/manuscript.yaml internal/knowledge.yaml
```

```bash
npx @redocly/cli@2.11.1 lint events/asyncapi.yaml
```

## Quy tắc cập nhật

1. Sửa PRD trước; spec theo sau. Khi lệch, PRD là chuẩn (thứ tự ưu tiên 1.4).
2. Endpoint mới đặt trong file `paths/` của mục PRD chứa requirement chính, thêm dòng vào `paths:` ở `openapi.yaml` và bảng ở `index.html`.
3. Mỗi operation có `operationId`, `tags`, `x-requirements`, `x-priority`, `x-milestone`; thêm `x-apr` nếu là phê duyệt.
4. Chạy lint và bundle; cập nhật nhật ký trong [../docs_context.md](../docs_context.md).
5. Endpoint nội bộ đặt trong `internal/<service sở hữu dữ liệu>.yaml`, có `x-callers`; sự kiện mới thêm message vào `events/asyncapi.yaml` cùng `operations` của service phát và service nghe. Đổi phá vỡ: thêm phiên bản mới, giữ bản cũ tới khi mọi bên gọi/nghe chuyển xong (architecture 3.6).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
