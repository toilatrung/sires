# Ngữ cảnh biên soạn PRD — AI Research Assistant

Tên chính thức (DEC-43, 31/10/2026): **SIRes (Super Intelligence Researcher)**, thuộc nền tảng eTroy, phát triển bởi đội ngũ SWE, GEN AI, AIE và PO của eTroy.

Cập nhật: 01/11/2026 (Asia/Saigon).
Phiên bản: 1.0 — PO duyệt qua phiếu chốt PC-01 (31/10/2026). Ngày 01/11/2026 bổ sung DEC-47 (Analysis Agent, phiên thảo luận), PO duyệt cùng ngày (DEC-48). Cùng ngày PO bỏ mục MVP Delivery Plan, kế hoạch triển khai lập riêng (DEC-49); PRD còn 21 section, cả 21 Đã hoàn thành.

## Quyền ghi

Mọi thay đổi trong `docs/` phải do PO yêu cầu hoặc duyệt; người dùng và agent khác không được ghi trực tiếp. Quy tắc chi tiết R-01–R-07: [README.md](README.md).

## Mục tiêu và nguồn nội dung

Xây dựng PRD architecture-aware, workflow-first đủ rõ cho Product Owner, developers, coding agents và QA. Dùng outline 22 mục do người dùng cung cấp làm cơ sở; giữ nguyên thứ tự mục và đề mục con.

Nguồn ban đầu: nội dung đính kèm “Tôi đề xuất xây dựng PRD cho AI Research Assistant theo hướng architecture-awar…”. Đề mục và gạch đầu dòng đã được đưa vào HTML để tiếp tục làm việc mà không cần truy cập lại attachment.

## Phương án đã được người dùng duyệt

- Tạo docs/overview/index.html, 22 trang section, assets/styles.css và figures/.
- Tạo docs/docs_context.md để lưu ngữ cảnh, tiến độ và bước tiếp theo.
- Giai đoạn đầu dựng khung; viết PRD chi tiết ở các lượt tiếp theo.
- Phong cách đơn giản, học thuật: nền trắng, chữ dễ đọc, màu nhấn tiết chế.
- HTML tĩnh, liên kết tương đối, mở trực tiếp, không cần server, framework hoặc tài nguyên mạng.
- Nội dung giải thích bằng tiếng Việt; giữ thuật ngữ tiếng Anh và nhãn đã chốt.

## Quyết định sản phẩm đã xác nhận

Nguồn quyết định chính: mục 20.1 trong PRD.

- Web application; individual researchers first.
- Hybrid workspace architecture; chi tiết phân chia workspace cần đặc tả.
- Human-in-the-loop cho quyết định quan trọng.
- Trusted Library bền vững ở cấp tài khoản, tái sử dụng qua các project.
- Google Scholar là trọng tâm discovery của MVP; tích hợp qua dịch vụ trung gian theo hợp đồng + luồng nhập do người dùng hỗ trợ; dự phòng OpenAlex/Semantic Scholar (DEC-19).
- Phê duyệt Plan trước khi thực thi chính thức; Plan đã duyệt là baseline có phiên bản.
- Người dùng chọn từng Task để thực thi; không tự chạy Task tiếp theo.
- Nhãn Available for agent và Manual editor requirement.
- LaTeX khởi tạo Default hoặc Blank.
- Multi-agent độc lập provider, có shared context.
- (01/11/2026, DEC-47) Orchestrator vẫn là mô hình điều phối; thêm Analysis Agent (tối thiểu 2 instance) cùng Orchestrator thảo luận phương án và giải pháp cho vấn đề Orchestrator nêu ra. Thảo luận theo phiên có cấu trúc: Vòng 1 đề xuất độc lập (lập trường bị ẩn với nhau), Vòng 2 phản biện chéo, vòng hẹp tùy chọn, Orchestrator tổng hợp giữ nguyên bất đồng, Researcher chọn qua prompt. Chỉ thảo luận vấn đề cần phán đoán (định hướng, cấu trúc Plan, phương pháp, mâu thuẫn bằng chứng, cách xử lý sự cố, tác động thay đổi lớn); không thảo luận câu hỏi về sự kiện, APR, ghi entity chính thức. Chia sẻ ngữ cảnh qua Deliberation Board bền vững, chỉ ghi thêm, và Context Snapshot; board cho phép bước song song dùng kết quả trung gian, đầu ra chính thức chỉ dựa trên entry final. Kho bền vững là nguồn sự thật, cache chỉ tăng tốc. OQ-098–OQ-102 PO chốt theo đề xuất (DEC-48): đúng 2 Analysis Agent; Researcher xác nhận trước khi phiên chạy, trừ bước phân tích 6.3; Orchestrator giao góc nhìn theo vấn đề; entry hiển thị cho Researcher khi vòng đóng; không bắt buộc khác provider, cảnh báo khi cùng model.
- (01/11/2026, DEC-50) PRD 18 khớp với API đã sửa: instance trên ActorRef, AgentRun, AgentModelAssignment (duy nhất theo account, agent, instance; sameModelWarning); participant có provider, model, trạng thái; recordArtifactVersionId; DeliberationPoint có id và targetPointId; PromptPurpose, DeliberationProposal; DeliberationLabel trên Provenance, ContextItem, Message.
- (01/11/2026, DEC-49) Bỏ mục MVP Delivery Plan khỏi PRD; PO lập kế hoạch triển khai riêng. Priority chuyển sang 2.4; Release Acceptance (REL-01–REL-10), bộ dữ liệu nghiệm thu và Definition of Done cho requirement chuyển sang 19.14; PRD không còn milestone; DEC-41 Deprecated; mục 21, 22 cũ thành 20, 21.
- (01/11/2026, DEC-48) PO duyệt câu chữ bổ sung DEC-47 và Priority 13 requirement mới: 9 P0, 4 P1 (tổng 269: 176 P0, 92 P1, 1 P2).
- (29/10/2026) Có giao diện giám sát, theo dõi các agent phối hợp làm việc (human-in-the-loop) — SCOPE-12.
- (29/10/2026) Settings MVP: thông tin cá nhân; tùy chỉnh URL và API key cho Orchestrator và từng Specialist Agent; tối thiểu Claude, OpenAI, Gemini — SCOPE-13.
- (29/10/2026, OQ-001) Giảm hallucination bằng RAG trên Trusted Reference được index vào vector database (PRB-03).
- (29/10/2026, OQ-002) Người dùng điển hình: cao học, NCS, giảng viên; đa ngành; viết chủ yếu tiếng Anh; LaTeX cơ bản; UI tiếng Việt và tiếng Anh.
- (29/10/2026, OQ-003) KPI-01 claim có evidence ≥ 95%; KPI-02 citation phân giải = 100%; KPI-03 khôi phục phiên ≥ 99%; KPI-04 Task chạy lại do thiếu đầu vào ≤ 10%.
- (29/10/2026, OQ-004) Chuẩn bị cộng tác mức tối thiểu: ghi actor, tách ownership tài khoản/project; không thành viên/chia sẻ.
- (29/10/2026, OQ-005) Duyệt thứ tự ưu tiên khi mâu thuẫn, từ ngữ bắt buộc, quy ước mã (thêm KPI-NN).
- (31/10/2026, DEC-18, bản sửa cuối) Phong cách giao diện là design system SIRes ở [ui-design/design.md](ui-design/design.md), dựa trên Cream (typeui.sh): nền kem, Montserrat (JetBrains Mono chỉ cho ID và mã), một màu xanh thương hiệu (#0277DD nền nút, #025FAC chữ) cho một hành động chính và dữ liệu, bo góc chặt 8/6/4px, viền 1px, không đổ bóng, áp dụng mọi màn hình; nét đứt = đề xuất, nét liền = đã chốt, nền xanh nhạt + icon = cần bạn xử lý, luôn kèm chữ. Thay hướng phẳng kiểu Overleaf trước đó; neumorphism đã loại. Màn tham chiếu: [ui-design/index.html](ui-design/index.html).
- (31/10/2026, phiếu chốt PC-01, DEC-19–DEC-42) PO chốt 27 OQ và duyệt nội dung mục 2–22. Điểm chính: sản phẩm tên **SIRes**, thuộc nền tảng **eTroy**; đăng nhập duy nhất qua eTroy OIDC (https://github.com/toilatrung/eTroy_OIDC); người dùng tự cấp API key, MVP chỉ 3 provider; dashboard mọi provider/tự host là FUT-05; Settings có URL hồ sơ Google Scholar, ngôn ngữ, công tắc đưa lĩnh vực nghiên cứu vào context, Ngưỡng kiểm chứng (mặc định 85%/95%, người dùng chỉnh được); Scholar qua dịch vụ trung gian + nhập thủ công DOI/BibTeX/PDF; duyệt reference theo lô; index PDF có lớp văn bản ≤ 50 MB; embedding qua OpenAI/Gemini của người dùng; xóa mềm project 30 ngày; debug transcript 30 ngày; cloud do đội phát triển vận hành; M1–M7 không gắn ngày. Diễn giải ghi chú PO: ASM-13–ASM-16 (20.2).

## Nguyên tắc cần bảo toàn

Phân biệt ba lớp: quy trình nghiên cứu của người dùng; workflow điều phối Orchestrator/agents; quản lý dữ liệu và trạng thái dùng chung. Plan/Task là hệ thống nghiên cứu dài hạn. Bảo toàn provenance, quyền duyệt, cách ly context và khả năng phục hồi qua nhiều phiên.

Không gắn ngưỡng đánh giá, công nghệ hoặc chính sách cụ thể khi chưa có cơ sở xác nhận. Priority P0/P1/P2 ở mục 7–18 do biên soạn đề xuất theo tiêu chí 2.4 và PO duyệt nguyên bảng 31/10/2026 (DEC-44): 167 P0, 83 P1, 1 P2.

## Cấu trúc và quy ước

- Trang chính: [overview/index.html](overview/index.html).
- Backlog: [overview/back-log.html](overview/back-log.html) — nguồn theo dõi chính cho trạng thái section, việc còn lại (BL-NN-MM), sổ Open Question và việc đồng bộ chéo (SYNC-NN). Section “Đã hoàn thành” = nội dung hoàn thiện + không còn OQ + PO duyệt bản cuối. Cập nhật backlog sau mỗi lượt.
- Nội dung: overview/sections/NN-slug.html; số mục 01–21 (mục MVP Delivery Plan cũ bỏ ngày 01/11/2026, DEC-49; mục 21, 22 cũ đánh số lại thành 20, 21).
- CSS: overview/assets/styles.css.
- Hình: overview/figures/; [hướng dẫn](overview/figures/README.md).
- UI design (PO duyệt 31/10/2026): [ui-design/index.html](ui-design/index.html) xem mọi màn; [ui-design/design.md](ui-design/design.md) quy tắc thiết kế; nguồn ui-design/source/*.dc.html, trang tĩnh ui-design/pages/ (dựng bằng ui-design/tools/render.mjs); canvas https://claude.ai/artifact/PVpjdSkkPJZrNHnwXDFCqK. Skill agent: agent/skills/sires-ui-executor, agent/skills/sires-ui-review.
- API: [api-design/index.html](api-design/index.html) — OpenAPI 3.1 mức MVP; file gốc api-design/openapi.yaml, path theo mục PRD ở api-design/paths/NN-slug.yaml, schema ở api-design/components/; [quy ước](api-design/README.md); hợp đồng nội bộ ở api-design/internal/, sự kiện ở api-design/events/asyncapi.yaml.
- Kiến trúc (v0.2; hướng đã chốt 31/10/2026, ADR-17–23 chờ xác nhận): [architecture/index.html](architecture/index.html) — 12 section ở architecture/sections/NN-slug.html, sơ đồ Mermaid FIG-101+ ở architecture/figures/, sổ ADR-NN, spike SPK-NN, câu hỏi kỹ thuật AQ-NN ở mục 12; [quy ước](architecture/README.md).
- Anchor: s-5-1, s-9-8…; phụ lục: appendix-a…appendix-g.
- Requirement đề xuất: DOMAIN-CAPABILITY-NNN, ví dụ TASK-READINESS-001; danh sách tiền tố DOMAIN ở mục 1.6.
- Goal/Problem/Open Question: GOAL-NN, PRB-NN, OQ-NNN, đánh số liên tục toàn PRD; OQ tổng hợp ở 20.3.
- Acceptance criterion đề xuất: TASK-READINESS-001-AC01.
- Workflow: WF-01–WF-07, tại section 6.
- Figure đề xuất: FIG-001; nguồn .mmd/.puml và ảnh .svg/.png cùng mã.
- Mẫu requirement ở section 1; bảng truy vết sẽ phát triển ở phụ lục E/G.
- Khi viết chi tiết, liên kết requirement → workflow → entity/state → acceptance criteria.
- Quy ước mã là đề xuất biên soạn, chưa phải quyết định kiến trúc sản phẩm.

## Trạng thái biên soạn và xác nhận

Biên soạn: Khung / Đang viết / Chờ duyệt / Đã duyệt.
Yêu cầu: Confirmed Requirement / Assumption / Open Question.
Hai loại trạng thái độc lập; outline đã chốt không có nghĩa mọi chi tiết đã duyệt.

| Mục | Nội dung | Biên soạn | Duyệt chi tiết |
| --- | --- | --- | --- |
| 1 | [Document Overview](overview/sections/01-document-overview.html) | Đã duyệt | Đã duyệt 29/10/2026; thuật ngữ bổ sung 31/10/2026 |
| 2 | [Product Scope](overview/sections/02-product-scope.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 3 | [User Roles and Permissions](overview/sections/03-user-roles-and-permissions.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 4 | [Information Architecture and Navigation](overview/sections/04-information-architecture-and-navigation.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 5 | [Core Domain Model](overview/sections/05-core-domain-model.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 6 | [End-to-End Product Workflow](overview/sections/06-end-to-end-product-workflow.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 7 | [Functional Requirements — Workspace and Project](overview/sections/07-workspace-and-project.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 8 | [Functional Requirements — AI Assistant and Multi-Agent Orchestration](overview/sections/08-ai-assistant-and-multi-agent-orchestration.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 9 | [Functional Requirements — Research Plan and Task Management](overview/sections/09-research-plan-and-task-management.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 10 | [Functional Requirements — Academic Discovery and Trusted Library](overview/sections/10-academic-discovery-and-trusted-library.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 11 | [Functional Requirements — Evidence, RAG and Research Synthesis](overview/sections/11-evidence-rag-and-research-synthesis.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 12 | [Functional Requirements — LaTeX Manuscript Workspace](overview/sections/12-latex-manuscript-workspace.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 13 | [Functional Requirements — Diagram Agent](overview/sections/13-diagram-agent.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 14 | [Shared Context and Orchestration Architecture](overview/sections/14-shared-context-and-orchestration-architecture.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 15 | [UI/UX Requirements](overview/sections/15-ui-ux-requirements.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 16 | [Non-Functional Requirements](overview/sections/16-non-functional-requirements.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01); 16.10 Evaluation và Eval Trace + NFR-OBS-006 duyệt 31/10/2026 (DEC-46) |
| 17 | [Integrations and External Dependencies](overview/sections/17-integrations-and-external-dependencies.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 18 | [Data and State Specifications](overview/sections/18-data-and-state-specifications.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 19 | [Acceptance Criteria and Test Scenarios](overview/sections/19-acceptance-criteria-and-test-scenarios.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 20 | [Assumptions, Constraints and Open Questions](overview/sections/20-assumptions-constraints-and-open-questions.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |
| 21 | [Appendices](overview/sections/21-appendices.html) | Đã duyệt | Đã duyệt 31/10/2026 (PC-01) |

## Công việc đã hoàn thành

- Khởi tạo 23 trang HTML (index + 22 section).
- Đưa đủ đề mục và nội dung outline vào từng section, chưa viết yêu cầu chi tiết.
- Bổ sung bảy workflow, mẫu requirement và quy ước biên soạn.
- Tạo điều hướng, mục lục trong section, CSS responsive và kiểu in.
- Khởi tạo hướng dẫn figures và file ngữ cảnh này.

## Công việc đang thực hiện

01/11/2026: bổ sung DEC-47 vào PRD — 8.7 Agent Deliberation (AGENT-ANALYSIS-001, ORCH-DELIB-001–005), 14.9 Deliberation Board and Context Snapshot (CTX-SNAPSHOT-001, CTX-BOARD-001–003), UX-MONITOR-006–007, NFR-USAGE-005, FIG-034, TS-02-06–09, TS-11-06–08, đồng bộ SYNC-12; 13 requirement mới, Priority 9 P0, 4 P1; PO duyệt và chốt OQ-098–OQ-102 cùng ngày (DEC-48). Chưa đồng bộ docs/architecture, docs/api-design, docs/ui-design. PRD v1.0 (31/10/2026): cả 22 section Đã hoàn thành; mục 16 được bổ sung 16.10 Evaluation và Eval Trace và PO duyệt cùng ngày (DEC-45, DEC-46); Priority 256 requirement (167 P0, 88 P1, 1 P2). Trước đó cả 22 section Đã hoàn thành; Priority đã duyệt (DEC-44). Toàn bộ OQ (OQ-001–OQ-095, trừ mã không cấp) đã đóng. Phiếu chốt: [overview/phieu-chot-backlog.html](overview/phieu-chot-backlog.html) (bản PO xuất: phieu-chot-backlog-2026-10-31-PC-01.md). Chưa chọn technology stack; 17 figure source Mermaid chưa có ảnh xuất.

## Bước tiếp theo

1. Đồng bộ DEC-47/DEC-48 sang docs/architecture (mục 5, 6, ADR mới), docs/api-design (internal/orchestration.yaml, events/asyncapi.yaml) và docs/ui-design (màn Workflow: chế độ xem thảo luận; Settings › Agent Models: Analysis Agent A/B).
1. PO xác nhận cách hiểu ASM-13–ASM-16 (eTroy OIDC, URL hồ sơ Scholar, Ngưỡng kiểm chứng, FUT-05); kiểm tra INT-OIDC-001–004 với repo eTroy_OIDC.
2. Câu hỏi mới phát sinh cấp mã từ OQ-103; quyết định mới từ DEC-51; rủi ro từ RISK-12; figure từ FIG-035; chỉ ghi “Đã duyệt” khi PO duyệt rõ.

## Câu hỏi mở và giả định

- Không còn OQ mở: OQ-098–OQ-102 PO chốt 01/11/2026 (DEC-48). OQ-096, OQ-097 đã chốt 31/10/2026 (DEC-45). Giả định kỹ thuật cần kiểm chứng: ASM-01–ASM-16 (20.2), đặc biệt ASM-01 (Scholar), ASM-13 (eTroy OIDC).
- Chưa chốt technology stack, build toolchain cụ thể và vùng lưu trữ dữ liệu (DEC-27).

## Nhật ký

- 28/10/2026: Người dùng duyệt cấu trúc tài liệu, yêu cầu style đơn giản, học thuật. Đã dựng bộ khung PRD v0.1 từ outline đã chốt.
- 29/10/2026: Người dùng yêu cầu biên soạn bắt đầu từ mục 1. Đã viết chi tiết mục 1: mục đích, đối tượng, cấu trúc PRD, thứ tự ưu tiên khi mâu thuẫn, tầm nhìn, PRB-01–05, nguyên tắc sản phẩm, ba lớp, GOAL-01–03, người dùng mục tiêu, glossary, quy ước (P0–P2, trạng thái, từ ngữ bắt buộc, mã ID, tiền tố DOMAIN, Given/When/Then) và OQ-001–005.
- 29/10/2026: Người dùng duyệt mục 1 (OQ-001–005 vẫn mở). Đã viết chi tiết mục 2: định nghĩa MVP gắn với WF-01–07, SCOPE-01–11 kèm ranh giới (SCOPE-10 Diagram tách riêng, cần xác nhận), ràng buộc chung, OOS-01–04 (outline) và OOS-05–10 (đề xuất), FUT-01–03, tiêu chí gán P0/P1/P2 (chưa gán), OQ-006–011. Thêm mã SCOPE/OOS/FUT.
- 29/10/2026: Theo phản hồi người dùng, bổ sung vào mục 2: SCOPE-12 giám sát agent/human-in-the-loop, SCOPE-13 Settings (Provider Connection = provider + base URL + API key, gán theo từng agent, quy tắc bảo mật key), SCOPE-14 danh sách 1 Orchestrator + 7 Specialist Agent (đề xuất: cố định trong MVP, custom agent ở FUT-04), OQ-012–015. Ghi 2 quyết định mới vào 20.1. Cần đồng bộ sau: glossary 1.5 (Provider Connection, tên 7 agent), mục 3.3, 4.1, 8.2, 8.6, 15, 16, 17.
- 29/10/2026: Người dùng duyệt mục 2 (OQ-006–015 vẫn mở). Đã viết chi tiết mục 3: bốn actor (Researcher, Orchestrator, Specialist Agent, System), nguyên tắc “agent đề xuất, System kiểm soát, Researcher quyết định”, quyền phê duyệt độc quyền APR-01–10, được phép/không được phép của Orchestrator, phạm vi đọc/tạo của 7 Specialist Agent, cách ly project/task, artifact draft/accepted, thẩm quyền phê duyệt, permission matrix R/C/E/A/X/V/D với c* cho bản đề xuất, OQ-016–019. Thêm mã APR.
- 29/10/2026: Theo yêu cầu người dùng, tạo overview/back-log.html: định nghĩa DONE-1/2/3, tổng quan tiến độ, nhóm Đã hoàn thành (chưa có), nhóm Đang thực hiện (mục 1, 2, 3 với 24 việc BL), sổ OQ-001–019, SYNC-01–07, danh sách section chưa bắt đầu, hướng dẫn và mẫu cập nhật. Cập nhật “Hướng biên soạn tiếp theo” ở index (trước đó còn ghi bắt đầu từ mục 5) và thêm liên kết backlog.
- 29/10/2026: Xử lý tồn đọng mục 1 theo backlog: đồng bộ glossary 1.5 (System, Provider Connection, 7 Specialist Agent, artifact draft/accepted, RAG) và bảng mã ID 1.6 (SCOPE/OOS/FUT, APR, KPI, BL/SYNC); PO trả lời OQ-001–005, nội dung mục 1 và 20.1 cập nhật theo; thêm SYNC-08–11 trong backlog.
- 01/11/2026: PO chốt DEC-47 trong phiên làm việc (Analysis Agent tối thiểu 2, cùng Orchestrator thảo luận theo phiên có cấu trúc; chia sẻ ngữ cảnh qua Deliberation Board và Context Snapshot; cho phép làm việc song song). Trên nhánh docs/analysis-agent-deliberation: viết 8.7 (AGENT-ANALYSIS-001, ORCH-DELIB-001–005) và 14.9 (CTX-SNAPSHOT-001, CTX-BOARD-001–003); Analysis Agent là Specialist Agent thứ tám (registry 9 định nghĩa); đồng bộ 1.5 (thuật ngữ deliberation), 2 (SCOPE-12–14), 3.3/3.5, 5.5, 6.3/WF-01, 15.10 (UX-MONITOR-006–007), UX-SETTINGS-003, 16.6 (NFR-USAGE-005), 18 (enum, schema, state), 19 (TS-02-06–09, TS-11-06–08), 21 (DEC-47, OQ-098–102, RISK-11), 22 (phụ lục A, C, E, G); tạo figures/FIG-034-deliberation-flow.mmd; backlog mở lại mục 8, 14 (BL-08-01–03, BL-14-01–02, SYNC-12); index cập nhật và thay mục “16.10 chưa được duyệt” đã lỗi thời (16.10 đã duyệt theo DEC-46). Điểm PO chưa chốt ghi thành OQ, không tự quyết.
- 01/11/2026: PO duyệt toàn bộ bổ sung DEC-47 và chốt OQ-098–OQ-102 theo đề xuất (DEC-48). Cập nhật trạng thái ở 1, 5, 8, 14, 15, 16, 21, 22, FIG-034, backlog (mục 8, 14 trở lại Đã hoàn thành), index.

- 01/11/2026: Theo PO, bỏ hẳn mục MVP Delivery Plan khỏi PRD (DEC-49); chuyển Priority sang 2.4, REL-01–REL-10, bộ dữ liệu nghiệm thu, Definition of Done sang 19.14; bỏ mọi tham chiếu milestone trong PRD (cột “Trước” ở 20.2, phụ lục F, mitigation, DISC-SCHOLAR-002), DEC-41 Deprecated, OQ-028 không còn hiệu lực, xóa FIG-005; đánh số lại mục 21→20, 22→21 (file, anchor, tham chiếu ở overview, architecture, api-design, ui-design, README, AGENT.md; dựng lại dist/openapi.bundled.yaml). Milestone M1–M7 trong docs/architecture và x-milestone trong docs/api-design vẫn còn, thuộc kế hoạch triển khai.
- 01/11/2026: Theo yêu cầu PO, cập nhật UI theo DEC-47/DEC-48 (docs/ui-design/source, dựng lại pages/ và index.html): Workflow thêm tab “Thảo luận” với hai biến thể deliberation-running, deliberation-done (Problem Brief, ba cột Orchestrator/Analysis Agent A/B theo vòng, phản biện trỏ tới điểm bị phản biện, nhãn giả định, entry ẩn “đang viết, mở khi vòng đóng”, cảnh báo cùng model và snapshot lỗi thời, usage theo bên và tổng, bản tổng hợp và lựa chọn đã chọn; UX-MONITOR-006, NFR-USAGE-005); Chat thêm thẻ đề xuất thảo luận “Thảo luận / Bỏ qua” và biến thể bỏ qua với nhãn “Không qua thảo luận” (UX-MONITOR-007); SettingsAgents thêm dòng Analysis Agent A, B và cảnh báo cùng model không chặn lưu (UX-SETTINGS-003, ORCH-DELIB-005); AgentList thêm Analysis Agent A, B và trạng thái deliberation, synthesis; README ui-design cập nhật bảng màn. Dữ liệu mẫu chỉ minh họa. Tên trường hiển thị đã đối chiếu với phiên sửa API spec; phần API còn thiếu (đề xuất mở phiên, nhãn không qua thảo luận, model/trạng thái participant) do phiên đó xử lý.

- 01/11/2026: Theo yêu cầu PO, đồng bộ docs/architecture và docs/api-design theo DEC-47–DEC-49. Architecture: 03 (orchestration sở hữu Deliberation, Deliberation Board, Context Snapshot; agent-core chạy Analysis Agent A, B), 04 (F-13 phiên thảo luận và kết quả trung gian), 05 (5.12 Deliberation, 5.13 Board và Snapshot; bước deliberation trong StepPlan; registry 9 định nghĩa), 06 (bảng và quy tắc bất biến), 02 (không Redis), 12 (ADR-24 Proposed, SPK-11, TR-10); bỏ 11.8 kế hoạch theo milestone và cột “Trước” ở 12.2, 12.4, mọi mốc M1–M7. API (Assumption): schema Deliberation*, ContextSnapshot, DeliberationLabel (nhãn deliberated/skipped trên Provenance, ContextItem, Message), PromptPurpose và DeliberationProposal, AgentModelAssignment theo instance và sameModelWarning; GET /projects/{projectId}/deliberations(/{deliberationId}); 4 endpoint nội bộ của board; 6 sự kiện deliberation.*/context_snapshot.outdated; mã lỗi draft_reference và 6 mã khác; gỡ 213 dòng x-milestone; dựng lại dist. Lệch cần sửa ở PRD 18.1 (instance, deliberationId, points có id, targetPointId…) ghi vào bước tiếp theo.
- 01/11/2026: Theo yêu cầu PO, sửa PRD 18 cho khớp API (DEC-50): 18.1 (ActorRef, AgentRun, Deliberation participants, DeliberationEntry content theo points có id, DeliberationPoint, DeliberationProposal, DeliberationLabel, InteractiveAgentPrompt.purpose, ContextItem, AgentModelAssignment, Message), 18.2 enum (PromptPurpose, DeliberationRoundKind, ParticipantStatus), 18.3 Provenance.deliberation, 18.5 ràng buộc duy nhất (accountId, agent, instance); 8.7 AGENT-ANALYSIS-001 đúng 2 instance; 14.9 CTX-BOARD-003 finding của run lỗi giữ draft; DEC-50 ở 20.1.
## Kiểm tra bộ khung

- Đã đối chiếu đủ 22 section, 160 đề mục con và 406 dòng nội dung outline gốc.
- Đã kiểm tra đủ 7 workflow và 320 liên kết file/anchor nội bộ; không có đích bị thiếu hoặc ID trùng.
- Có 23 trang HTML dùng chung stylesheet cục bộ, không phụ thuộc mạng.
- Chưa kiểm tra trực quan bằng trình duyệt; CSS đã có quy tắc cho màn hình nhỏ và bản in.

## Điều chỉnh typography — 28/10/2026

- Theo phản hồi lỗi font: thay Georgia bằng Times New Roman cho nội dung và tiêu đề, với fallback Times/Liberation Serif.
- Dùng font-weight 700 cho tiêu đề để khớp kiểu Bold có sẵn.
- Giữ Segoe UI/Arial cho nhãn điều hướng và metadata.
- Cập nhật phiên bản stylesheet ở cả 23 trang để trình duyệt tải lại CSS.
- 30/10/2026: Viết chi tiết mục 4–22. Mục 4–6, 19–22 do phiên chính viết; mục 7–10, 11–14, 15–18 viết song song bởi ba subagent rồi đối chiếu. Quy ước mới: bảng chuyển trạng thái Task T-01–T-19 ở 9.8 là chuẩn (5.3, 18.2, FIG-004 đã đồng bộ); thử lại hai lớp (adapter 17.1 tối đa 3 lần trong một Agent Run; Orchestrator 8.5 tối đa 2 Agent Run mới); bộ mã lỗi provider chuẩn ở 8.6; mã DEC-NN (20.1), ASM-NN (20.2), RISK-NN (20.4), REL-NN (19.14), TS-NN-MM (19), M1–M7 (20). OQ được cấp theo dải: 020–028 (mục 4–6, 20), 030–040 (7–10), 050–064 (11–14), 070–085 (15–18), 090–092 (21), 095 (19). OQ-080 trùng OQ-051, OQ-082 trùng OQ-050. Phụ lục E và G sinh tự động từ requirement và kịch bản.
- 30/10/2026: Theo yêu cầu PO, tự review và QC hai vòng (bốn subagent theo nhóm mục, sau đó sửa lỗi chéo) và một vòng kiểm tra tự động (liên kết, ID, mẫu requirement, OQ). Biên soạn chốt 41 OQ có giải pháp; quy ước đánh dấu “Chốt (biên soạn, 30/10/2026)” trong nội dung và “Đã giải quyết (biên soạn, 30/10/2026)” trong bảng OQ; 20.3 tách bảng câu hỏi mở và bảng đã giải quyết. Quyết định đáng chú ý: prompt không hết hạn theo thời gian (chỉ Expired khi lưu trữ project); Change Proposal chấp nhận/từ chối nguyên khối; chỉ Mermaid; pdfLaTeX/XeLaTeX + natbib; heartbeat 30 s / 2 phút; sandbox 120 s / 2 GB; Source Document cấp tài khoản; một Manuscript mỗi project. Mục 2 có thay đổi khi chốt OQ nên cần PO duyệt lại (BL-02-11).
- 31/10/2026: PO chốt hướng thiết kế giao diện (DEC-18, mục 20.1). Mục 15 giữ nguyên nguyên tắc không quy định màu/kích thước; token chi tiết sẽ nằm trong design system riêng.
- 31/10/2026: PO điều chỉnh DEC-18: bỏ neumorphism, dùng một phong cách phẳng kiểu Overleaf cho mọi màn hình. Canvas mẫu đã dựng lại (style guide, Manuscript Workspace, Dashboard).
- 31/10/2026: Tạo phiếu chốt backlog (overview/phieu-chot-backlog.html: 27 OQ + 21 việc duyệt, xuất Markdown/JSON/PDF). PO chốt PC-01 đủ 48/48. Áp dụng vào mục 1–22 (bốn subagent song song cho 2–20 và một cho 22; phiên chính làm 1, 4, 5, 21, backlog): DEC-19–42, ASM-13–16, RISK-10, FUT-05, 15.12 Settings and Sign-in, 17.7 eTroy OIDC, khoảng 25 requirement mới, Priority đề xuất cho 251 requirement (tổng hợp 20, s-20-priority). Backlog: 21 section Đã hoàn thành, mục 20 còn BL-20-04.
- 31/10/2026: PO chốt tên chính thức SIRes (Super Intelligence Researcher), thuộc eTroy, phát triển bởi đội SWE, GEN AI, AIE và PO của eTroy (DEC-43); gắn logo (assets/brand) và favicon vào mọi trang. PO duyệt nguyên bảng Priority (DEC-44, BL-20-04); bỏ nhãn “(đề xuất)”. Cả 22 section Đã hoàn thành.
- 31/10/2026: Tạo docs/api — đặc tả OpenAPI 3.1 mức MVP (0.1.0-mvp, Assumption) từ PRD v1.0: openapi.yaml, paths/07–15 theo mục PRD, components (schema mục 5/18, parameters, responses), index.html, README.md, dist/openapi.bundled.yaml. 132 path, 163 operation; mỗi operation có x-requirements, x-priority, x-milestone, x-apr khi là phê duyệt. Redocly lint hợp lệ. Bước tiếp: kiểm tra /auth/* với eTroy_OIDC (ASM-13), chốt host và URL discovery khi chọn hạ tầng.
- 31/10/2026: Tạo docs/ui-design — bộ thiết kế giao diện đủ màn hình theo DEC-18 trên canvas mẫu (5 trang: Nền tảng, Global, Settings & Sign-in, Project, Trạng thái & Mobile; 31 artboard gồm TopBar/ProjectRail dùng chung, bảng thành phần trạng thái, 9 màn Global, đăng nhập + 4 trang Settings, 10 màn Project, mẫu trạng thái và 2 màn mobile). Dashboard và Manuscript cũ được làm lại theo khung điều hướng mới. Chờ PO đánh giá trước khi dùng làm mẫu thiết kế chính.
- 31/10/2026: Theo yêu cầu, chuyển toàn bộ bộ thiết kế docs/ui-design (31 artboard) sang phong cách Cream (typeui.sh): Montserrat, nền kem, brand #0277DD, bo 24px, nút viên thuốc, không đổ bóng; giữ quy ước trạng thái nét đứt/nét liền. Thay hướng DEC-18 (phẳng kiểu Overleaf) — PRD 20.1 chưa sửa, cần PO xác nhận cập nhật DEC-18.
- 31/10/2026: Rà soát bộ thiết kế theo taste-skill (app screens): bo góc chặt 8/6/4px, chip cần xử lý nền nhạt, điều hướng chọn màu trung tính, một nút chính tô màu mỗi màn, mono chỉ cho ID/mã, bỏ eyebrow trên tiêu đề, tiêu đề 26px. Canvas phiên bản 16.
- 31/10/2026: Thêm component AgentList (agent của workflow và trạng thái Đang chạy/Đang rảnh/Lỗi, light/dark) vào Workflow (P9), bind theo trạng thái workflow; Workflow có thêm biến thể running. Canvas phiên bản 17.
- 31/10/2026: PO duyệt bộ thiết kế UI. Sắp xếp lại docs/ui-design: source/ (nguồn canvas), pages/ (56 trang HTML tĩnh sinh bởi tools/render.mjs), index.html (trình xem), design.md (hướng dẫn thiết kế), assets/. Tạo skill agent/skills/sires-ui-executor (dựng UI theo design.md, kèm tokens.css) và agent/skills/sires-ui-review (đối chiếu UI với thiết kế, kèm scripts/check-ui.mjs). PRD 20.1 DEC-18 vẫn chưa cập nhật sang Cream.
- 31/10/2026: Theo PO, cập nhật DEC-18 trong PRD 20.1 sang design system đã duyệt (Cream, ui-design/design.md); mục 15 thêm liên kết tới design.md và index.html; ghi nhật ký backlog.
- 31/10/2026: Theo yêu cầu người dùng, bổ sung Evaluation và Eval Trace. Phạm vi đã thống nhất: Eval Trace chỉ ở thời điểm thiết kế/phát triển (eval harness offline trên bộ dữ liệu nghiệm thu 19.14, provider thật, key của đội); production giữ trace metadata (NFR-OBS-002 không đổi); thu Eval Trace từ dữ liệu người dùng để FUT-06. Thêm 16.10 NFR-EVAL-001–004, NFR-OBS-006 (metadata phiên bản prompt/model/retrieval trên Agent Run), TS-13-10, TS-13-11, FUT-06, OQ-096, OQ-097; cập nhật 19.14, 20.3, phụ lục E/G (256 requirement, 441 AC; 5 requirement P1 đề xuất ngoài DEC-44). OQ của mục 16 chuyển sang 16.11. Mục 16 chờ PO duyệt phần bổ sung.
- 31/10/2026: Tạo docs/architecture — tài liệu thiết kế hệ thống v0.1 (Đề xuất, chờ Tech lead/PO duyệt), cấu trúc giống overview/api-design: index.html, README.md, 12 section (tổng quan và động lực kiến trúc; technology stack; context/container/module và cấu trúc repo; luồng F-01–F-12; workflow engine và Orchestrator; dữ liệu; RAG và pipeline tài liệu; Model Gateway và tích hợp; sandbox LaTeX/Mermaid; bảo mật; triển khai và vận hành; sổ ADR-01–16, spike SPK-01–09, rủi ro TR-01–07, câu hỏi AQ-01–06), 8 sơ đồ Mermaid FIG-101–108. Stack đề xuất: React+Vite (TS), Python 3.12 + FastAPI, modular monolith, workflow engine tự xây trên PostgreSQL 16 + pgvector, object storage S3, SSE qua outbox + LISTEN/NOTIFY, Model Gateway trên SDK chính thức, BFF OIDC, envelope encryption KMS, sandbox gVisor, Kubernetes + Terraform. Khi ADR được duyệt: cập nhật ASM-11 và DEC-27 trong PRD 20.
- 31/10/2026: Theo chỉ đạo, cập nhật docs/architecture lên v0.2: backend tách thành nhiều service (gateway, identity, workspace, planning, orchestration, library, research, manuscript, audit, sandbox-runner viết bằng NestJS; agent-core và knowledge viết bằng Python), monorepo chung FE + BE (pnpm + Nx + uv); các đề xuất stack còn lại của v0.1 được chấp thuận (ADR-03–16 Accepted; ADR-01/02 Superseded by ADR-17/18). Quyết định mới phát sinh, Proposed: ADR-19 RabbitMQ, ADR-20 hợp đồng nội bộ OpenAPI/AsyncAPI + token service-to-service, ADR-21 công cụ monorepo, ADR-22 database theo service, ADR-23 audit tập trung qua outbox. Viết lại mục 2, 3, 4, 12, index; cập nhật mục 1, 5–11, FIG-102–105, FIG-108; thêm SPK-10, TR-08–09, AQ-07 (knowledge dùng Python hay gộp vào agent-core), AQ-08 (nhóm sở hữu service). Việc tiếp theo: tạo docs/api-design/internal và events/asyncapi.yaml.
- 31/10/2026: Chốt giữ knowledge (PDF, chunk, embedding, truy xuất) là service Python riêng, tách khỏi agent-core: ADR-18 Accepted, AQ-07 đóng; cập nhật architecture mục 3, 12 và index.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../LICENSES.md).
- 31/10/2026: Tạo hợp đồng nội bộ theo architecture v0.2 (ADR-20): docs/api-design/internal/ — schemas.yaml (token nội bộ, ContextBundle, AgentRunWorkOrder/Result/Failure, AgentWriteMeta, WriteAck, ProviderSecretEnvelope, EventEnvelope, SandboxJob/Result), responses.yaml, và 9 file OpenAPI 3.1 (identity, orchestration, agent-core, workspace, planning, library, research, manuscript, knowledge; 50 endpoint, extension x-callers); docs/api-design/events/asyncapi.yaml (AsyncAPI 3.0: 29 sự kiện trên sires.events, lệnh agent.run, knowledge.index, sandbox.build, phản hồi sandbox.reply.research, stream chat.delta; operations ghi service phát/nghe). Cả 10 file qua redocly lint; mọi mã trong x-requirements có trong PRD. Chốt quy tắc routing key con theo trạng thái đích và đổi tên sự kiện trong architecture mục 3–7 cho khớp (ví dụ workflow.status_changed.running thay workflow.started). Cập nhật api-design README, index (#internal), architecture 3.3, 12, index.
- 31/10/2026: PO chốt OQ-096, OQ-097 theo đề xuất (DEC-45): nhãn evidence cho 1 trong 5 đề tài (khoảng 100 claim, PO gán, QA hỗ trợ) để đo recall retrieval; dung sai cổng hồi quy 2 điểm phần trăm cho tỷ lệ khớp mức hỗ trợ và phát hiện citation không khớp, KPI-02 không giảm. Đã cập nhật 16.10, 19.13, 19.14, 20.1, 20.3, backlog. Mục 16 vẫn chờ PO duyệt 16.10/NFR-OBS-006 (BL-16-01) và FUT-06 (BL-16-04).
- 31/10/2026: Đồng bộ thuật ngữ evaluation (BL-16-06): thêm bảng “Thuật ngữ đánh giá chất lượng agent” vào 1.5 (anchor s-1-5-eval, term-*) và bảng tương ứng ở phụ lục A (appendix-a-eval) gồm Retrieval, recall của retrieval, nhãn evidence, precision của nhãn Supported, eval harness, Eval Trace, baseline (đánh giá), hồi quy, cổng hồi quy, dung sai hồi quy (giá trị theo DEC-45); thêm tiền tố NFR-EVAL vào bảng mã 1.6. Trạng thái: bổ sung 31/10/2026, chờ PO duyệt cùng 16.10; thuật ngữ cũ giữ Đã duyệt; không sửa requirement.
- 31/10/2026: PO duyệt phần bổ sung 16.10 (NFR-EVAL-001–004), NFR-OBS-006 ở P1, TS-13-10, TS-13-11, FUT-06 và thuật ngữ evaluation (BL-16-01, BL-16-04; DEC-46). Bảng Priority: 256 requirement, 167 P0, 88 P1, 1 P2 (mục 2.4, 20, 22). Mục 16 trở lại Đã hoàn thành. Theo yêu cầu PO, viết docs/README.md: cấu trúc docs/ và quy tắc chỉ ghi khi PO yêu cầu/duyệt (R-01–R-07).
- 01/11/2026: Theo yêu cầu PO, sửa ghi chú trong README.md: docs/ đã nằm trong Git (toilatrung/sires) nhưng chưa có CODEOWNERS và bảo vệ nhánh.
