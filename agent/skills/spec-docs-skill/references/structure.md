# Cấu trúc bộ tài liệu

Mẫu lấy từ repo SIRes. Script `scaffold.mjs` dựng đúng cây dưới đây; các bộ ngoài `overview` là tùy chọn.

```
AGENT.md                         hướng dẫn cho mọi coding agent: thứ tự đọc, quy tắc bắt buộc, kiểm tra
.github/CODEOWNERS               PO là code owner của docs/ và của chính file này
scripts/docs/check-docs.mjs      kiểm tra id, liên kết, anchor, thẻ; liệt kê mã tiếp theo
scripts/docs/update-index.mjs    đồng bộ docs/index.html với các thư mục
docs/
  README.md                      cấu trúc docs/, quy tắc quyền ghi R-01–R-07, quy ước chung
  docs_context.md                ngữ cảnh biên soạn: quyết định đã xác nhận, trạng thái, bước tiếp theo, mã tiếp theo, nhật ký
  index.html                     trang vào chung; danh sách giữa <!-- docs-index:start --> và <!-- docs-index:end -->
  overview/                      PRD
    index.html                   mục lục, trạng thái từng section, hướng biên soạn tiếp theo
    sections/NN-slug.html        từng section, số 01…
    back-log.html                DONE-1/2/3, tiến độ, việc BL-NN-MM, sổ OQ, SYNC-NN, nhật ký
    figures/FIG-NNN-slug.mmd     nguồn sơ đồ Mermaid; README quy ước
    assets/styles.css            stylesheet dùng chung cho mọi bộ HTML
  architecture/                  (tùy chọn) index.html, README.md, sections/NN-slug.html, figures/FIG-1NN-*
  api-design/                    (tùy chọn) openapi.yaml, paths/NN-slug.yaml, components/, dist/ (sinh tự động)
  ui-design/                     (tùy chọn) README.md, design.md, source/, pages/ (sinh tự động)
```

## Vai trò của từng file nguồn sự thật

| Câu hỏi | Nguồn |
| --- | --- |
| Ai được ghi, căn cứ thế nào | `docs/README.md` (R-01–R-07) |
| Đang ở đâu, làm gì tiếp, mã tiếp theo | `docs/docs_context.md` |
| Section nào xong, việc nào còn mở, OQ nào chờ PO | `docs/overview/back-log.html` |
| Sản phẩm phải làm gì | PRD `sections/` |
| PO đã chốt gì | PRD mục Assumptions, Constraints and Open Questions › Confirmed Product Decisions (`DEC-NN`) |
| Giả định, câu hỏi, rủi ro | cùng mục: Technical Assumptions (`ASM-NN`), Open Product Questions (`OQ-NNN`), Risks (`RISK-NN`) |

Khi các nguồn mâu thuẫn: PRD là chuẩn về hành vi sản phẩm; kiến trúc là chuẩn về cách hiện thực; API phải khớp PRD. Mâu thuẫn ghi thành OQ cho PO, không tự chọn.

## PRD outline

Phần đầu và phần cuối cố định; phần giữa là các mục Functional Requirements lấy từ config. Số mục tính tự động, nên mục “Assumptions…” có số khác nhau giữa các dự án (SIRes là 20).

| Thứ tự | Section | Đề mục con mặc định |
| --- | --- | --- |
| 1 | Document Overview | Purpose, Product Vision, Product Goals, Target Users, Terminology, Document Conventions (điền sẵn), Mẫu requirement |
| 2 | Product Scope | MVP Scope, Out of Scope, Future Scope, Scope Prioritization |
| 3 | User Roles and Permissions | Actors, Approval Authority, Permission Matrix, Data Ownership and Isolation |
| 4 | Information Architecture and Navigation | Information Architecture, Navigation Model, Screen Inventory |
| 5 | Core Domain Model | Entity Overview, Entity Definitions, Lifecycles and States, Invariants |
| 6 | End-to-End Product Workflow | Workflow Overview, Workflow Specifications, Exception and Recovery Paths |
| 7… | Functional Requirements — *tên* | theo `functional[].subsections` |
| sau đó | UI/UX Requirements (`UX`) | Design Principles, Screen Requirements, States and Feedback, Accessibility, Localization |
| | Non-Functional Requirements (`NFR`) | Performance, Availability and Reliability, Security and Privacy, Observability and Audit, Compatibility |
| | Integrations and External Dependencies (`INT`) | Integration Inventory, Integration Contracts, Failure Handling |
| | Data and State Specifications (`DATA`) | Data Entities and Fields, State Transitions, Versioning and Audit, Retention and Deletion |
| | Acceptance Criteria and Test Scenarios | Acceptance Approach, Test Scenarios, Release Acceptance |
| | Assumptions, Constraints and Open Questions | Confirmed Product Decisions, Technical Assumptions, Open Product Questions, Risks and Mitigations |
| cuối | Appendices | A Glossary … G Acceptance Test Matrix |

Mọi section trừ hai mục cuối có đề mục “Open Questions của mục N” (anchor `s-N-oq`). Mỗi trang có header, mục lục trong trang (`details.local-toc`), điều hướng trước/sau (`nav.section-nav`) và footer.

## Config của `scaffold.mjs`

| Trường | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `project.name` | có | Tên ngắn, dùng trong tiêu đề trang |
| `project.fullName`, `project.description`, `project.team` | | Trang mục lục PRD, meta description |
| `po.name` | có | Tên PO trong R-01–R-07, AGENT.md |
| `po.github` | | Tạo `.github/CODEOWNERS` |
| `functional[]` | có, ≥ 1 | `title`, `prefixes` (tiền tố DOMAIN), `scope`, `subsections`, `slug` (mặc định từ title) |
| `sets` | | Mặc định cả bốn bộ; `overview` luôn có |
| `architecture.sections` | | Danh sách `[tên, mô tả]`; mặc định 9 mục chung |
| `license` | | `id` (SPDX), `file`, `label`, `lines`; gắn ghi chú vào mọi file tạo ra |
| `version`, `date`, `language` | | Mặc định `0.1`, hôm nay (`dd/mm/yyyy`), `vi` |
| `agentFiles`, `copyScripts` | | Mặc định `true`; đặt `false` để không tạo AGENT.md/CODEOWNERS hoặc không chép script |

## Thành phần HTML dùng chung (`styles.css`)

`site-header` (brand + phiên bản/ngày), `eyebrow`, `meta`, `status` (dòng trạng thái nhỏ), `note` (khối ghi chú), `local-toc`, `table-wrap` (bọc mọi bảng để cuộn ngang trên điện thoại), `contents` (mục lục có trạng thái), `section-nav`, `skip-link`, `cover-logo`. Có kiểu in và `prefers-reduced-motion`. Không thêm framework hay font mạng.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
