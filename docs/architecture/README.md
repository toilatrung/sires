# Architecture — SIRes (MVP)

Tài liệu thiết kế hệ thống cho SIRes ở mức MVP (milestone M1–M7): technology stack, thành phần, luồng hoạt động và phương án cho các bài toán kỹ thuật của hệ thống. Suy ra từ PRD v1.0 tại [../overview/index.html](../overview/index.html) và bám hợp đồng API tại [../api-design/index.html](../api-design/index.html).

Trạng thái: **phiên bản 0.2 (31/10/2026).** Đã chốt hướng: backend nhiều service (NestJS cho service hệ thống, Python cho agent core), monorepo chung FE + BE, các đề xuất stack còn lại của bản 0.1. Danh sách service, broker, hợp đồng nội bộ và công cụ monorepo (ADR-17–ADR-23) còn chờ xác nhận.

## Cấu trúc thư mục

Theo cấu trúc `docs/overview/` và `docs/api-design/`: một trang mục lục, các section đánh số, hình tách riêng.

| Đường dẫn | Vai trò | Tương ứng |
| --- | --- | --- |
| [index.html](index.html) | Mục lục, tóm tắt quyết định, bảng truy vết section → PRD | `overview/index.html`, `api-design/index.html` |
| `sections/NN-slug.html` | Nội dung từng mục (01–12) | `overview/sections/` |
| `figures/FIG-1NN-slug.mmd` | Nguồn sơ đồ Mermaid; [hướng dẫn](figures/README.md) | `overview/figures/` |

Stylesheet dùng chung `../overview/assets/styles.css` và logo `../overview/assets/brand/`, giống `api-design`.

## Danh sách section

| Mục | File | Nội dung |
| --- | --- | --- |
| 1 | `01-architecture-overview.html` | Mục tiêu, phạm vi, động lực kiến trúc từ PRD, nguyên tắc, quy ước mã |
| 2 | `02-technology-stack.html` | Stack đề xuất theo lớp, lý do, phương án đã cân nhắc |
| 3 | `03-system-context-and-containers.html` | Ngữ cảnh, danh sách service, sở hữu dữ liệu, giao tiếp, monorepo, quy tắc cho người viết service |
| 4 | `04-runtime-flows.html` | Luồng hoạt động F-01–F-12 giữa các service |
| 5 | `05-workflow-engine-and-orchestration.html` | Workflow engine bền vững, checkpoint, heartbeat, idempotency, Orchestrator, agent registry |
| 6 | `06-data-architecture.html` | PostgreSQL, phiên bản, audit, outbox, cách ly tenant, object storage, xóa và retention |
| 7 | `07-rag-and-document-pipeline.html` | Indexing PDF, chunking, embedding theo tài khoản, truy xuất lai, kiểm chứng claim/citation |
| 8 | `08-model-gateway-and-integrations.html` | Model Gateway ba provider, structured output, lỗi và thử lại, Scholar/DOI, eTroy OIDC |
| 9 | `09-sandbox-latex-and-diagrams.html` | Build LaTeX và render Mermaid cô lập, hàng đợi build |
| 10 | `10-security-architecture.html` | Xác thực, phân quyền, bí mật, cách ly, CSRF, quyền riêng tư |
| 11 | `11-deployment-and-operations.html` | Môi trường, topology, CI/CD, sao lưu, observability, mở rộng, eval harness |
| 12 | `12-decisions-risks-and-open-issues.html` | Sổ ADR, spike kiểm chứng ASM, rủi ro kỹ thuật, câu hỏi mở |

## Quy ước

- **Mã quyết định kiến trúc:** `ADR-NN` (ví dụ ADR-03). Sổ ADR ở mục 12; mỗi ADR ghi bối cảnh, quyết định, phương án đã cân nhắc, hệ quả. Trạng thái: `Proposed` → `Accepted` / `Rejected` / `Superseded by ADR-NN`.
- **Luồng hoạt động:** `F-NN` (mục 4). Bước trong luồng: `F-04.S3`.
- **Service:** tên viết thường không dấu (`orchestration`, `agent-core`…); thư mục `apps/<service>` (mục 3).
- **Hợp đồng:** OpenAPI công khai ở `docs/api-design/openapi.yaml`; nội bộ ở `docs/api-design/internal/<service>.yaml`; sự kiện ở `docs/api-design/events/asyncapi.yaml` (ADR-20).
- **Hình:** `FIG-1NN` — dải 100 trở lên dành cho kiến trúc, tránh trùng FIG-001–033 của PRD.
- **Spike:** `SPK-NN`, mỗi spike kiểm chứng một hoặc nhiều giả định ASM-NN của PRD 21.2.
- **Câu hỏi mở:** câu hỏi kỹ thuật `AQ-NN` (Tech lead trả lời); câu hỏi cần PO quyết định cấp mã `OQ-NNN` tiếp theo trong PRD (từ OQ-098).
- **Truy vết:** mỗi phương án ghi requirement PRD mà nó phục vụ (ví dụ `CTX-RECOVERY-001`, `NFR-SECRETS-001`).
- **Ngôn ngữ:** nội dung tiếng Việt; tên thành phần, công nghệ, mã, trường dữ liệu tiếng Anh.

## Thứ tự ưu tiên khi mâu thuẫn

1. PRD (`docs/overview`) là chuẩn về hành vi sản phẩm.
2. Đặc tả API (`docs/api-design`) là chuẩn về hợp đồng giao tiếp.
3. Tài liệu kiến trúc mô tả *cách hiện thực*; khi phát hiện PRD hoặc API không hiện thực được, ghi câu hỏi mở và sửa nguồn trước, không tự quyết trong kiến trúc.

## Quy tắc cập nhật

1. Quyết định mới hoặc thay đổi quyết định: thêm/sửa ADR ở mục 12 trước, rồi cập nhật section liên quan.
2. Khi ADR được duyệt, đổi trạng thái `Accepted`, ghi ngày và người duyệt; cập nhật ASM-11 trong PRD 21.2 nếu liên quan stack.
3. Sơ đồ: sửa file `.mmd` trong `figures/`, giữ mã FIG ổn định.
4. Cập nhật nhật ký trong [../docs_context.md](../docs_context.md).
