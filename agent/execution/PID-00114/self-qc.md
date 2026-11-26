# PID-00114 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00114](../../../docs/tickets/issues/PID-00114/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Lần chạy sau thêm mục `Lần N — dd/mm/yyyy` ở cuối file.

## 1. Lệnh

Chạy hai lượt: lượt dựng (trong lúc làm) và lượt kiểm lại trước khi commit (bảng dưới là lượt kiểm lại, cùng kết quả).

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build` | Không chạy nguyên dạng vì base của nhánh gồm các commit gộp (#140, shell). Thay bằng `nx show projects --affected --files=<file đã đổi>` → `["@sires/web"]`, và chạy đủ 4 target của `@sires/web` ở dưới |
| `NX_DAEMON=false pnpm nx run-many -t lint typecheck test build -p @sires/web --skip-nx-cache` | Đạt: lint, typecheck; test 25 file, 196/196 (khu vực research 5 file, 58 test); build vite 140 module |
| Quét `dist/assets` sau build | Không có mã mock; `shell/mock/build.spec.ts` đạt |
| `node scripts/docs/add-license.mjs` / `--check` | 0 file thêm / 0 file thiếu |
| `check-tracks.mjs --stdin` trên file đã đổi | `repo, web/research` (`repo` là `agent/execution/PID-00114/`) |
| `check-ui.mjs apps/web/src/features/research` | 0 error, 3 warning (`box-shadow` của dialog — lớp nổi, design.md §2.3 cho phép) |
| `check-pid.mjs PID-00114` | ĐỦ; 1 cảnh báo: `report.md` đã ở “Xong — chờ QC” |
| Preview `dev:mock` (Chrome headless 1440×900, 390×844; preview của agent dựng thêm 1024×768) | Không cuộn ngang ở mọi cỡ. Màn claim Conflicting có Evidence Inspector; artifact sơ đồ v2 Draft; bản tổng hợp có chip tại câu, “Chấp nhận v2” bị chặn vì còn 1 claim chưa quyết định, nhóm claim chưa định vị. Console: một 404 là `/favicon.ico` của app (shell chưa có favicon). Lượt dựng còn thấy 404 của `getWorkflow` (mock monitoring) khi workflow xong — report.md mục 6 |
| Đọc mã | 5 route theo H3; `mocks` dùng điều kiện `DEV && MODE !== 'production'`; không `dangerouslySetInnerHTML`, `innerHTML`; một `fetch` trực tiếp (preview sơ đồ, implement.md mục 3); không import khu vực khác; i18n vi và en cùng 252 khóa |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00114-AC01 | `claim.spec.tsx › Unsupported giữ nhãn ở danh sách, Inspector và sau khi chấp nhận`; `synthesis.spec.tsx › Unsupported tại câu` | đạt |
| PID-00114-AC02 | `artifact.spec.tsx › Draft có provenance và thao tác nghiệm thu` | đạt |
| UX-EVID-001-AC01 | `evidence.spec.tsx › trang 7 trong văn cảnh` | đạt |
| UX-CLAIM-001-AC01 | `synthesis.spec.tsx › Unsupported tại câu` | đạt |
| EVID-INSPECTOR-001-AC01 | `evidence.spec.tsx › metadata và ngữ cảnh` | đạt |
| EVID-INSPECTOR-001-AC02 | `evidence.spec.tsx › loại evidence` | đạt |
| SYN-HUMAN-REVIEW-001-AC01 | `claim.spec.tsx › Not Assessed không chấp nhận được` | đạt |
| SYN-HUMAN-REVIEW-001-AC03 | `artifact.spec.tsx › synthesis còn claim chưa quyết định` | đạt |
| DIAG-SOURCE-001-AC01 | `diagram.spec.tsx › lưu nguồn thành version mới` | đạt |
| DIAG-SOURCE-001-AC02 | `diagram.spec.tsx › nguồn và preview cùng version` | đạt |
| DIAG-VALIDATE-001-AC01 | `diagram.spec.tsx › lỗi cú pháp` | đạt |
| DIAG-REVIEW-001-AC01 | `artifact.spec.tsx › diagram lỗi không chấp nhận được` | đạt |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý |
| --- | --- | --- |
| EC01 | đã giải quyết | `evidence.spec.tsx › ba tab trống` |
| EC02 | đã giải quyết | `evidence.spec.tsx › hai trạng thái của reference` |
| EC03 | đã giải quyết | `evidence.spec.tsx › bỏ reference khỏi project` (đếm evidence, hệ quả, 409 trong dialog) |
| EC04 | đã giải quyết, cần lưu ý | `claim.spec.tsx › tải thêm`; Evidence, Artifacts dùng cùng `usePaged` nhưng không có test riêng |
| EC05 | đã giải quyết, cần lưu ý | `claim.spec.tsx › lọc theo Active task` (bật, đổi Active task, không còn Active task); Evidence, Artifacts cùng cách, không test riêng |
| EC06 | đã giải quyết | `evidence.spec.tsx › lỗi tại vùng`, `› lỗi tại vùng của panel` |
| EC07 | đã giải quyết | `evidence.spec.tsx › không tìm thấy`; `artifact.spec.tsx › không tìm thấy` |
| EC08 | đã giải quyết | `evidence.spec.tsx › vị trí thiếu đoạn` |
| EC09 | đã giải quyết | `evidence.spec.tsx › thiếu đoạn liền kề` |
| EC10 | đã giải quyết | `evidence.spec.tsx › Stale không loại, không liên kết` |
| EC11 | đã giải quyết | `evidence.spec.tsx › khôi phục evidence` |
| EC12 | đã giải quyết | `evidence.spec.tsx › loại evidence` (dialog, lý do, 409 không gửi lại) |
| EC13 | đã giải quyết | `evidence.spec.tsx › liên kết PDF tại trang` |
| EC14 | đã giải quyết | `evidence.spec.tsx › chưa claim nào dùng` |
| EC15 | đã giải quyết | `claim.spec.tsx › Conflicting hiện hai phía` |
| EC16 | đã giải quyết | `claim.spec.tsx › link tới evidence Stale` (Stale, Excluded) |
| EC17 | đã giải quyết | `claim.spec.tsx › Not Assessed không chấp nhận được` (lý do cạnh nút, 400 hiện lý do) |
| EC18 | đã giải quyết | `claim.spec.tsx › Unsupported giữ nhãn ở danh sách, Inspector và sau khi chấp nhận` |
| EC19 | đã giải quyết | `claim.spec.tsx › 409 tải lại claim` (chấp nhận, từ chối); 409 kiểm chứng ở `› kiểm chứng chạy lâu` |
| EC20 | đã giải quyết | `claim.spec.tsx › sửa phát biểu` (rỗng, Accepted, merge-patch + If-Match, 412 giữ nội dung) |
| EC21 | đã giải quyết, cần lưu ý | `claim.spec.tsx › kiểm chứng chạy lâu`; trên `dev:mock` thẻ báo lỗi tải workflow khi xong vì `getWorkflow` của mock monitoring trả 404 (report.md mục 6) |
| EC22 | đã giải quyết | `claim.spec.tsx › liên kết evidence` (radio không chọn sẵn, bàn phím, 422), `› đổi quan hệ` (“Liên kết lại”) |
| EC23 | đã giải quyết | `claim.spec.tsx › needs review` (không ghi lý do) |
| EC24 | đã giải quyết | `claim.spec.tsx › chấp nhận hàng loạt` (k/n, lỗi một phần, không có claim đủ điều kiện) |
| EC25 | đã giải quyết | `claim.spec.tsx › claim đã quyết định` |
| EC26 | đã giải quyết | `artifact.spec.tsx › trống` |
| EC27 | đã giải quyết | `artifact.spec.tsx › version đang dùng` |
| EC28 | đã giải quyết | `artifact.spec.tsx › provenance thiếu trường` |
| EC29 | đã giải quyết | `artifact.spec.tsx › nội dung HTML hiện dạng chữ`; SVG từ blob ở `diagram.spec.tsx › nguồn và preview cùng version` |
| EC30 | đã giải quyết | `artifact.spec.tsx › nội dung theo format` |
| EC31 | đã giải quyết | `artifact.spec.tsx › so sánh version` |
| EC32 | đã giải quyết | `diagram.spec.tsx › lỗi cú pháp`; `artifact.spec.tsx › diagram lỗi không chấp nhận được` |
| EC33 | đã giải quyết | `diagram.spec.tsx › preview lỗi` |
| EC34 | đã giải quyết | `diagram.spec.tsx › chưa kiểm tra được` |
| EC35 | đã giải quyết | `diagram.spec.tsx › lưu nguồn thành version mới` (nguồn lỗi kèm cảnh báo, 409 giữ editor) |
| EC36 | đã giải quyết | `diagram.spec.tsx › yêu cầu Diagram Agent sửa` |
| EC37 | đã giải quyết, cần lưu ý | `diagram.spec.tsx › workflow sửa sơ đồ`; cùng lưu ý `dev:mock` như EC21 |
| EC38 | đã giải quyết | `synthesis.spec.tsx › claim chưa định vị` |
| EC39 | đã giải quyết | `synthesis.spec.tsx › nhiều claim cùng vị trí` |
| EC40 | đã giải quyết | `artifact.spec.tsx › synthesis còn claim chưa quyết định` |
| EC41 | đã giải quyết | `artifact.spec.tsx › chấp nhận bị từ chối` |
| EC42 | đã giải quyết | `artifact.spec.tsx › version đã quyết định` |
| EC43 | đã giải quyết | `evidence.spec.tsx › tải lại khi có sự kiện` (claim, reference, “cần tải lại”); workflow ở `claim.spec.tsx › kiểm chứng chạy lâu`, `diagram.spec.tsx › workflow sửa sơ đồ` |
| EC44 | đã giải quyết | `claim.spec.tsx › không gửi trùng`, `artifact.spec.tsx › không gửi trùng` |
| EC45 | đã giải quyết, cần lưu ý | `diagram.spec.tsx › nháp nguồn sơ đồ`; nháp phát biểu claim và chỉ dẫn Diagram Agent đã đăng ký nhưng không có test riêng |
| EC46 | đã giải quyết | `evidence.spec.tsx › đổi ngôn ngữ` (nhãn, tên trạng thái giữ tiếng Anh, giờ HH:mm và ngày đầy đủ) |
| EC47 | đã giải quyết | thao tác tay trên preview 1440×900, 1024×768, 390×844 (VI); EN kiểm trong test |
| EC48 | đã giải quyết, cần lưu ý | rà shell: có chip, `LongOperation`, Active task, kho nháp, tín hiệu “reload”; shell chưa có dialog (khu vực dựng theo H2) và client chưa đọc nhị phân (report.md mục 6) |
| Mới | đã giải quyết | Danh sách của dialog chấp nhận hàng loạt đổi khi danh sách phía sau tải lại → chụp danh sách lúc mở (`claim.spec.tsx › chấp nhận hàng loạt`) |
| Mới | đã giải quyết | Dấu “ · ” hiện trước mã Task khi chưa tải → `TaskKey` nhận `prefix` |
| Mới | cần lưu ý | Ở `/claims/:claimId` rail không đánh dấu khu vực (shell `context.ts`, report.md mục 6) |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; chấp nhận, từ chối claim và version chỉ từ thao tác của Researcher, không chọn sẵn phương án.
- [x] Chuyển trạng thái theo PRD 18.2 ở giao diện (Evidence Active ↔ Excluded; claim, version chỉ quyết định khi Draft); provenance hiện đủ theo 18.3.
- [x] Dữ liệu theo project ở đường dẫn; 404 của tài nguyên không thuộc tài khoản hiện “Không tìm thấy”.
- [x] Gọi model qua Model Gateway — không áp dụng (giao diện không gọi model); không hiện key, stack trace.
- [x] Không import mã của khu vực khác; chỉ dùng shell qua `src/shell` (test dùng `shell/test`, `shell/mock` như README); dùng đúng hợp đồng.
- [x] Sự kiện qua outbox — không áp dụng (giao diện chỉ nghe SSE).
- [x] Migration — không áp dụng.
- [x] Giao diện theo design.md; có trống, đang tải, lỗi, thẻ thao tác dài; `check-ui` 0 error.
- [x] Không sửa file ngoài luồng, file sinh tự động, `docs/`.
- [x] Không làm ngoài phạm vi; yêu cầu thêm ở report.md mục 5.
- [x] Không còn mã gỡ lỗi, TODO; test mang tên theo AC, EC.
- [x] Đã tự chạy spec-converge-skill (mục 5); không còn CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

| G | Loại | Mức | Mô tả | Bằng chứng | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | MEDIUM | Trên `dev:mock`, thẻ thao tác dài kiểm chứng và sửa sơ đồ báo lỗi tải workflow khi xong vì `getWorkflow` của mock dùng chung trả 404 cho workflow của mock research | thao tác tay; `ClaimInspector.tsx:116`, `ArtifactDetail.tsx:79` | Để PO: theo H12 `getWorkflow` thuộc monitoring; test override cục bộ đạt; đề xuất ở report.md mục 6 |
| G2 | partial | LOW | Rail không đánh dấu “References and Evidence” ở `/claims/:claimId` | shell `context.ts` | Ngoài luồng; đề xuất cho shell |
| G3 | partial | LOW | Preview đọc bằng `fetch` cùng origin, không qua client có type (client chỉ đọc JSON) | `DiagramContent.tsx:32` | Ghi implement.md mục 3; đề xuất cho shell |
| G4 | unrequested | LOW | Câu giải thích reference Revoked ở tab References (từ màn `Evidence--view-references`, H4 không nêu) | `ReferencesTab.tsx` | Giữ theo màn tham chiếu; PO quyết |
| G5 | partial | LOW | EC04, EC05 chỉ có test ở tab Claims | `claim.spec.tsx` | Mã dùng chung `usePaged`, cùng tham số; giữ |
| G6 | partial | LOW | EC45 chỉ test nháp nguồn sơ đồ | `diagram.spec.tsx › nháp nguồn sơ đồ` | Nháp phát biểu và chỉ dẫn đã đăng ký `useDraft`; giữ |
| G7 | partial | LOW | Editor: cột cạnh editor hiện preview kết quả “Kiểm tra”, preview của version ở khung phía trên (sketch “Editor nguồn \| preview”) | `DiagramContent.tsx` | Ghi implement.md mục 3; PO quyết |
| G8 | partial | LOW | Danh sách đã có dữ liệu mà lần tải lại lỗi thì giữ dữ liệu cũ, không báo | `ClaimsTab.tsx`, `EvidenceTab.tsx`, `ArtifactsScreen.tsx` | Lỗi lần tải đầu hiện theo EC06; giữ |
| G9 | partial | LOW | Kiểm EN trên trình duyệt chỉ ở 1440; 1024, 390 kiểm EN qua test jsdom | thao tác tay | Ghi nhận |
| G10 | partial | LOW | `nx affected` không chạy nguyên dạng (base có commit gộp) | mục 1 | Thay bằng danh sách project affected theo file và 4 target của `@sires/web` |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
