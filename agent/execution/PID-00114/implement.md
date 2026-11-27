# PID-00114 — Triển khai

- **Ticket:** [PID-00114](../../../docs/tickets/issues/PID-00114/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026

File này mô tả mã đang chạy ở `apps/web/src/features/research/` (đường dẫn dưới đây tính từ thư mục đó).

## 1. Luồng đã triển khai

References and Evidence:
1. Route `projects/:projectId/evidence`, `…/claims/:claimId`, `…/evidence/:evidenceId` cùng màn `ReferencesAndEvidence` — `index.tsx:17`, `EvidenceScreen.tsx:27`; tab lấy từ route hoặc `?tab=` (mặc định claims), Active task từ `useNavigationData` — `EvidenceScreen.tsx:36`.
2. Danh sách: `usePaged` (limit 20, cursor, bộ lọc, `taskId` khi bật ô Active task) cho `listClaims`, `listEvidence`; `useLoad` cho `listProjectReferences` — `data.tsx:29`, `data.tsx:57`. Sự kiện: `research.object_status_changed` (claim, evidence), sự kiện reference, tín hiệu “cần tải lại” → tải lại bằng GET — `data.tsx:129–143`.
3. Panel: `ClaimInspector` hoặc `EvidenceInspector`, khóa theo id; lệnh qua `useShell().idempotency.run` (khóa theo thao tác) và `useSingleFlight`; 409/400/412 → `ErrorState` kèm mã, tải lại, không gửi lại — `ClaimInspector.tsx:138`, `EvidenceInspector.tsx:49`.
4. Chip `StatusChip` của shell; dialog `Dialog.tsx` (design.md §4).

Research Artifacts:
1. `ResearchArtifacts` → `ArtifactsFrame` (`listArtifacts` theo trang, lọc `type`, `hasAccepted`, `taskId`) — `ArtifactsScreen.tsx:35`, `:44`.
2. `ArtifactDetail`: `getArtifact`, `listArtifactVersions`, version theo `?version=` (mặc định mới nhất), `?compare=`; claim của version synthesis bằng `listClaims?artifactVersionId=` mọi trang — `ArtifactDetail.tsx:27`, `:46`.
3. Nội dung: diagram → `DiagramContent`/`DiagramFigure`; synthesis → `SynthesisContent`; khác → `FormatContent`; `Provenance`; điều kiện chặn tính ở `ArtifactDetail.tsx:107`, nghiệm thu ở `ArtifactDecision.tsx:41`.

Thao tác dài: `verifyClaim`/`requestDiagram` trả 202 `Workflow` → `LongOperation` của shell kèm “Xem workflow” → `workflow.status_changed` của workflow đó → `getWorkflow` → Succeeded thì tải lại claim hoặc version, Failed/Cancelled thì hộp lỗi kèm `lastError.code` — `ClaimInspector.tsx:116`, `ArtifactDetail.tsx:79`.

Mock (S01): `Feature.mocks` → `__mocks__/index.ts` (mặc định `createResearchMocks()`) → `createResearchOverrides(store)` (`__mocks__/overrides.ts`) trên kho `createResearchStore` (`__mocks__/store.ts:101`); sự kiện đẩy qua `siresMock.events` (dev) hoặc `mock.events` (test); workflow kết thúc sau 4 giây (dev) hoặc khi gọi `finishWorkflows()` (test).

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `useLoad`, `usePaged` | hook | `data.tsx:29`, `:57` | GET kèm trạng thái, trang theo `nextCursor`, tải lại | mọi màn dùng | request mới thắng request cũ; không dựng trạng thái từ payload sự kiện | `evidence.spec.tsx › tải lại khi có sự kiện`, `claim.spec.tsx › tải thêm` |
| `useSingleFlight` | hook | `data.tsx:187` | bỏ lần bấm thứ hai khi lệnh đang gửi | EC44 | một request mỗi lần bấm | `claim.spec.tsx › không gửi trùng`, `artifact.spec.tsx › không gửi trùng` |
| `ClaimInspector` (`command`, `accept`, `verify`, `changeRelation`, `saveStatement`) | component | `ClaimInspector.tsx:88–262` | duyệt claim | APR-06; AC01, SYN-HUMAN-REVIEW-001-AC01 | Not Assessed không chấp nhận; gửi `rowVersion`; `If-Match` cho PATCH; 4xx không gửi lại; nhãn mức hỗ trợ không đổi khi chấp nhận | `claim.spec.tsx` |
| `BulkAcceptDialog` | component | `ClaimDialogs.tsx:147` | chấp nhận lần lượt claim Draft mức Supported | SYN-HUMAN-REVIEW-001 | danh sách chụp lúc mở; mỗi claim một `Idempotency-Key`; claim lỗi liệt kê kèm mã | `claim.spec.tsx › chấp nhận hàng loạt` |
| `EvidenceInspector.change` | hàm | `EvidenceInspector.tsx:49` | loại (kèm lý do) / khôi phục | EVID-INSPECTOR-001-AC02 | chỉ Active → Excluded, Excluded → Active; Stale không thao tác | `evidence.spec.tsx › loại evidence`, `› khôi phục evidence` |
| `ArtifactDecision.decide`, điều kiện chặn | hàm | `ArtifactDecision.tsx:41`, `ArtifactDetail.tsx:107` | chấp nhận/từ chối version | APR-03/06/07; AC02, SYN-HUMAN-REVIEW-001-AC03, DIAG-REVIEW-001-AC01 | chỉ Draft; synthesis còn claim Draft và diagram không `valid` bị chặn ở giao diện; lỗi 409/400 vẫn hiện sau khi tải lại | `artifact.spec.tsx` |
| `locateClaims`, `paragraphs` | thuật toán | `locate.ts:24`, `:41` | chỗ đặt chip theo `claimAnchors` | UX-CLAIM-001-AC01 | không claim nào mất nhãn (KPI-01) | `synthesis.spec.tsx` |
| `usePreview`, `DiagramFigure`, `DiagramContent` | hook, component | `DiagramContent.tsx:32`, `:173`, `:199` | preview từ blob, trạng thái kiểm tra từ `validation`, editor nguồn | DIAG-SOURCE-001, DIAG-VALIDATE-001 | SVG không vào DOM; nguồn lỗi không hiện preview như hợp lệ; version mới có `basedOnVersionId` | `diagram.spec.tsx` |
| `Provenance` | component | `Provenance.tsx:58` | actor, Agent Run, model, Task, đầu vào, nguồn, phê duyệt | DATA-PROV-001; AC02 | thiếu trường ghi “—”; `inputs: []` → “Không có đầu vào” | `artifact.spec.tsx › provenance thiếu trường` |
| `createResearchOverrides` (`handle`) | hàm | `__mocks__/overrides.ts` | 24 override có trạng thái, ghi lại request | nền mọi test | cùng `Idempotency-Key` trả lại kết quả đầu; sự kiện phát khi trạng thái đổi | mọi spec |
| `checkMermaid` | thuật toán (mock) | `__mocks__/store.ts:163` | kiểm nguồn Mermaid xác định | validate, version mới, preview 404 | kết quả cố định cho cùng nguồn | `diagram.spec.tsx › lỗi cú pháp` |

### Thuật toán: định vị claim (`locateClaims`, `paragraphs`)

- **Vào, ra:** `content`, id claim của version, `claimAnchors` → các điểm đặt chip (sau `charEnd`, nhóm theo vị trí) và claim chưa định vị.
- **Các bước:** bỏ neo của claim không thuộc version, neo ngoài `content` hoặc `charStart ≥ charEnd`; mỗi claim lấy neo hợp lệ đầu tiên; gộp theo `charEnd` giữ thứ tự `claimAnchors`; claim không có neo hợp lệ vào nhóm chưa định vị. Nội dung chia đoạn theo dòng trống, chip đặt trong đúng đoạn chứa `charEnd`.
- **Độ phức tạp:** O(neo + claim).
- **Trường hợp biên:** EC38 (thiếu neo, neo ngoài nội dung), EC39 (nhiều claim một vị trí).

### Thuật toán: kiểm Mermaid của mock (`checkMermaid`)

- Dòng đầu phải khai báo loại; dòng có `->` (không phải `-->`, `->>`) là lỗi theo dòng; ngoặc vuông lệch là lỗi; có `%% render-error` → `render_error`. Dùng cho `validateDiagramSource`, `createArtifactVersion` và Diagram Agent giả.

## 3. Quyết định kỹ thuật trong phạm vi

- `data.tsx` là `.tsx` vì chứa `TaskKeysProvider` (mã Task lưu đệm theo `taskId`, gắn `key={projectId}`).
- Trang 20 dòng; claim của synthesis đọc mọi trang (limit 100, tối đa 10 trang).
- Preview sơ đồ: `fetch` cùng origin (`api.url(...)` + `format=svg`) → blob → `URL.createObjectURL` → `<img>`, thu hồi khi đổi version; kết quả `previewSvg` của “Kiểm tra” cũng thành blob. Lý do: client của shell chỉ đọc JSON (report.md mục 6).
- Nội dung version không phải diagram/synthesis hiện dạng chữ giữ xuống dòng, không dựng Markdown (H8 để Dev chọn), không chèn HTML. CSV đọc theo RFC 4180 (`VersionContent.tsx:13`), lỗi thì hiện chữ.
- Mã Agent Run `ar-` + 4 ký tự hex cuối của id; chunk 6 ký tự hex cuối; tên tác giả rút gọn: họ là từ cuối, “et al.” từ 3 tác giả, “&” với 2.
- Thời điểm: `formatWhen` (`labels.ts:69`) dùng `formatTime`/`formatDateTime` của shell (HH:mm hôm nay, `dd/mm/yyyy HH:mm` ngày khác).
- Tên agent giữ tiếng Anh (`labels.ts:77`); dòng chọn dùng nền `brand-tint` như `Evidence.html`.
- Dialog của khu vực (`Dialog.tsx`): portal, focus vào ô nhập đầu, Tab giữ trong dialog, Esc hủy, trả focus về nút mở.
- “Đang dùng: v{k} Accepted” cần số version: gọi `listArtifactVersions` cho dòng có `currentAcceptedVersionId` khác `latestVersion` (Artifact không có số).
- Dialog Bỏ khỏi project đếm evidence bằng `listEvidence?referenceId=&limit=200`, còn trang thì ghi “200+”.
- Editor sơ đồ: cột phải hiện kết quả “Kiểm tra” (lỗi hoặc preview của nguồn đang sửa); preview của version giữ ở khung figure phía trên.
- Câu giải thích reference Revoked ở tab References lấy từ màn `Evidence--view-references`.
- Mock: id từ 101 để không trùng hàng demo của shell; Task dùng id của fixture planning dùng chung; reference chỉ nằm trong kho của khu vực, không thêm fixture `Reference`; workflow dev kết thúc sau 4 giây.
- Test: `test/render.tsx` dựng shell thật (`renderShell`) với `mockFetch`, một kho mỗi test, override `getTask`/`getWorkflow` chỉ trong test (H12) với mã T-x của designs/notes.html, `stubObjectUrls` cho jsdom.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
