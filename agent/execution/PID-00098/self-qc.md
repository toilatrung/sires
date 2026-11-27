# PID-00098 — Self-QC của Dev

**Kết luận:** Đạt — 35/35 AC có test đạt, không còn khoảng trống CRITICAL hay HIGH. Còn YC1 (thay đổi shell, chờ phiên điều phối) và H11 (chờ PO).

- **Ticket:** [PID-00098](../../../docs/tickets/issues/PID-00098/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx affected -t lint typecheck test build` | Không chạy cả bộ: máy 16 GB dùng chung với các phiên khác. Thay bằng các lệnh của `@sires/web` ở các dòng dưới; CI của PR chạy đủ |
| `vitest run` (`@sires/web`, toàn bộ) | 24 file, 223/223 đạt; riêng khu vực: 4 file, 85/85 đạt |
| `eslint .` (`apps/web`) | 0 lỗi |
| `tsc -p tsconfig.json --noEmit` (`apps/web`) | 0 lỗi |
| build | `shell/mock/build.spec.ts` chạy `vite build` ở `production` và `NODE_ENV=development`: 2/2 đạt, bundle không có mock |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu thông báo |
| `node scripts/development/check-tracks.mjs --base origin/preview/ui-ph02` | `web/library`, `web/shell`; cảnh báo hai luồng, đúng YC1 (commit riêng `78baa91`) |
| `check-ui.mjs apps/web/src` | 0 lỗi; 3 cảnh báo ở `library.css:151` (bóng của `.library-dialog`, dialog được phép có bóng); 9 cảnh báo có sẵn trong `shell/styles` |
| quét kiểu gitleaks `generic-api-key` trên commit mới | 0 dòng khớp (sau khi đổi `key` thành `cite` trong dữ liệu mẫu) |
| preview `dev:mock` | 1440×900: Discover tìm, nhãn, chọn 2, gửi lô, tóm tắt “Đã tạo 2”; Trusted Library có panel chờ duyệt. 390×844: Trusted Library không cuộn ngang, panel dùng được. Chưa kiểm 1024×768, `en`, `prefers-reduced-motion` |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00098-AC01 | `discover.spec.tsx › kết quả không giống Trusted` | đạt |
| PID-00098-AC02 | `reference.spec.tsx › indexing lỗi có thử lại` | đạt |
| UX-REF-001-AC01 | `discover.spec.tsx › nhãn đã có và chưa duyệt` | đạt |
| UX-REF-002-AC01 | `reference.spec.tsx › hai trạng thái và Unavailable`; phần dòng trong bảng: `library.spec.tsx › hai trạng thái trên dòng` | đạt |
| UX-REF-003-AC01 | `reference.spec.tsx › provenance` (trừ truy vấn gốc, N6) | đạt |
| UX-STATE-002-AC01 | `library.spec.tsx › thư viện trống` | đạt |
| LIB-LIBRARY-001-AC01 | `reference.spec.tsx › thêm vào project không duyệt lại` | đạt |
| LIB-LIBRARY-001-AC02 | `reference.spec.tsx › project đang dùng` | đạt |
| DISC-SCHOLAR-001-AC01 | `discover.spec.tsx › metadata và bản ghi nguồn` | đạt |
| DISC-SCHOLAR-001-AC02 | `discover.spec.tsx › nguồn yêu cầu xác minh` | đạt |
| DISC-SCHOLAR-001-AC04 | `discover.spec.tsx › nhãn đã có và chưa duyệt` | đạt |
| DISC-SCHOLAR-002-AC02 | `library.spec.tsx › nguồn discovery lỗi không ảnh hưởng` | đạt |
| INT-SCHOLAR-002-AC01 | `discover.spec.tsx › nguồn giới hạn truy cập` | đạt |
| INT-SCHOLAR-004-AC01 | `discover.spec.tsx › danh sách có thể không đầy đủ` | đạt |
| DISC-REVIEW-001-AC01 | `discover.spec.tsx › chọn 3 loại 2` | đạt |
| DISC-AUTHOR-001-AC01 | `discover.spec.tsx › hai hồ sơ cùng tên` (H11 tạm) | đạt |
| DISC-AUTHOR-001-AC02 | `discover.spec.tsx › danh sách có thể không đầy đủ` | đạt |
| DISC-AUTHOR-001-AC03 | `discover.spec.tsx › chọn tất cả đủ điều kiện` | đạt |
| DISC-AUTHOR-001-AC04 | `discover.spec.tsx › công bố của tôi`, `› ẩn công bố của tôi khi chưa lưu URL` | đạt |
| DISC-ADAPTER-001-AC01 | `discover.spec.tsx › ẩn tìm theo tác giả` | đạt |
| LIB-IMPORT-001-AC01 | `discover.spec.tsx › tóm tắt lô có mục lỗi` | đạt |
| LIB-IMPORT-001-AC03 | `discover.spec.tsx › mục trùng trong lô` | đạt |
| LIB-IMPORT-002-AC01 | `import.spec.tsx › ba DOI chờ duyệt` | đạt |
| LIB-IMPORT-002-AC02 | `import.spec.tsx › BibTeX trùng DOI` | đạt |
| LIB-IMPORT-002-AC03 | `import.spec.tsx › PDF bị từ chối` | đạt |
| LIB-APPROVAL-001-AC02 | `library.spec.tsx › sửa năm rồi duyệt` | đạt |
| LIB-APPROVAL-001-AC04 | `discover.spec.tsx › đã từ chối trước đây` | đạt |
| LIB-APPROVAL-001-AC05 | `library.spec.tsx › duyệt lô 20` | đạt |
| LIB-APPROVAL-001-AC06 | `library.spec.tsx › mục nghi trùng ngoài lô` | đạt |
| LIB-APPROVAL-001-AC07 | `library.spec.tsx › reference DOI vẫn chờ duyệt` | đạt |
| LIB-PROJECT-001-AC02 | `reference.spec.tsx › reference chờ duyệt không thêm vào project` | đạt |
| LIB-LIFECYCLE-001-AC01 | `reference.spec.tsx › thu hồi nêu ảnh hưởng hai project` | đạt |
| LIB-METADATA-001-AC02 | `reference.spec.tsx › sửa tiêu đề giữ key` | đạt |
| LIB-CONTENT-001-AC01 | `reference.spec.tsx › Unavailable vẫn có key` | đạt |
| LIB-CONTENT-001-AC02 | `reference.spec.tsx › tải PDF lên rồi Indexed` | đạt |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | `discover.spec.tsx › truy vấn rỗng` |
| EC02 | đã giải quyết | `› khoảng năm sai` (cả khoảng hợp lệ gửi `filters`) |
| EC03 | đã giải quyết | `› nguồn không phản hồi`: 503, “Tìm lại” cùng khóa, truy vấn khác khóa mới |
| EC04 | đã giải quyết | `› nguồn yêu cầu xác minh`, `› nguồn giới hạn truy cập` |
| EC05 | đã giải quyết | `› không có kết quả gợi ý Google Scholar` |
| EC06 | đã giải quyết | `› không có Google Scholar`, `› không có Google Scholar khi danh sách nguồn lỗi` |
| EC07 | đã giải quyết | `› hủy tìm`, `› hủy tìm khi đã xong` (409 → đọc lại) |
| EC08 | đã giải quyết | `› khôi phục lần tìm`, `› khôi phục lần tìm không có`; nhánh “cần tải lại” gọi lại `getWorkflow` (`Discover.tsx:138`), chưa có test riêng |
| EC09 | đã giải quyết | `› nhãn đã có và chưa duyệt`, `› kết quả không giống Trusted` |
| EC10 | đã giải quyết | `› đã từ chối trước đây`; nhãn Đang chờ duyệt và Đã thu hồi đi cùng nhánh mã (`DuplicateLabel`) |
| EC11 | đã giải quyết | `› reference trùng không đọc được` |
| EC12 | đã giải quyết | `› thiếu metadata` |
| EC13 | đã giải quyết | `› nội dung HTML hiện dạng chữ` |
| EC14 | đã giải quyết | `› metadata và bản ghi nguồn` (`rel="noopener noreferrer"`), `› bản ghi nguồn không phải http` |
| EC15 | đã giải quyết | `› chọn lỗi trả lại trạng thái` (409; lỗi mạng đi cùng nhánh `catch`) |
| EC16 | đã giải quyết | `› giới hạn lô 50`, `› giới hạn lô 50 khi chưa chọn` |
| EC17 | đã giải quyết | `› tóm tắt lô có mục lỗi` (thử lại với khóa mới), `› mục trùng trong lô` |
| EC18 | đã giải quyết | `› lô bị gián đoạn` |
| EC19 | đã giải quyết | `› hai hồ sơ cùng tên` (H11 tạm) |
| EC20 | đã giải quyết | `› ẩn tìm theo tác giả`, `› ẩn công bố của tôi khi chưa lưu URL` |
| EC21 | đã giải quyết | `› tác giả không có dữ liệu` |
| EC22 | đã giải quyết | `import.spec.tsx › DOI sai mẫu` |
| EC23 | đã giải quyết | `› DOI không phân giải` |
| EC24 | đã giải quyết | `› BibTeX có entry lỗi` |
| EC25 | đã giải quyết | `› BibTeX trùng DOI` |
| EC26 | đã giải quyết | `› PDF bị từ chối` (51 MB, không phải PDF trên máy; 422 từ server); 413, 415 từ server đi cùng nhánh hiện lý do |
| EC27 | đã giải quyết | `› giữ nháp nhập thủ công`; `reference.spec.tsx › giữ nháp nhập thủ công khi sửa metadata` |
| EC28 | đã giải quyết | `library.spec.tsx › thư viện trống`, `› thư viện trống còn mục chờ duyệt`, `› lọc rỗng có Xóa lọc` |
| EC29 | đã giải quyết | `› lỗi tại phần` (bảng lỗi, panel vẫn hiện); lỗi panel dùng cùng `ErrorState` có Thử lại |
| EC30 | đã giải quyết | `› tải thêm` |
| EC31 | đã giải quyết | `› cập nhật theo sự kiện`; `reference.spec.tsx › cập nhật khi shell báo tải lại` |
| EC32 | đã giải quyết | `› mục nghi trùng ngoài lô`, `› gộp mục nghi trùng`, `› giữ riêng và duyệt có lý do` |
| EC33 | đã giải quyết | `› duyệt một phần lỗi` |
| EC34 | đã giải quyết | `› hủy dialog không đổi gì` (từ chối); thu hồi và xóa trong `› thu hồi nêu ảnh hưởng hai project`, `› xóa khi không dùng` |
| EC35 | đã giải quyết | `reference.spec.tsx › sửa xung đột phiên bản` |
| EC36 | đã giải quyết | `› Revoked chỉ đọc`; nút sửa không hiện nên không gửi được `updateReferenceMetadata` gây 409, nhánh 409 của `act` đọc lại |
| EC37 | đã giải quyết | `› thêm vào project các trường hợp`, `› reference chờ duyệt không thêm vào project` (422) |
| EC38 | đã giải quyết | `› thu hồi nêu ảnh hưởng hai project` |
| EC39 | đã giải quyết | `› xóa bị từ chối khi đang dùng` |
| EC40 | đã giải quyết | `› indexing lỗi có thử lại`, `› indexing lỗi có thử lại khi đã đổi` |
| EC41 | đã giải quyết | `› không tìm thấy` |
| EC42 | đã giải quyết | `› reference đã gộp` |
| EC43 | đã giải quyết | `import.spec.tsx › đổi ngôn ngữ giữ nội dung` |
| EC44 | cần lưu ý | Thao tác tay: 1440×900 và 390×844 (không cuộn ngang, panel chờ duyệt dùng được) đã kiểm; 1024×768 chưa kiểm |
| EC45 | đã giải quyết | `library.spec.tsx › đang tải`; `discover.spec.tsx › đang tải kết quả` |
| EC46 | cần lưu ý | Chấm chạy, skeleton, thanh không xác định là của shell (PID-00012); chưa kiểm tay `prefers-reduced-motion` |
| Mới | đã giải quyết | (1) Tên truy cập của ô nhập đổi theo dòng lỗi khi lỗi nằm trong `<label>`: đưa lỗi ra ngoài, nối `aria-describedby`. (2) Tóm tắt thu hồi mất khi trang tải lại: thông báo giữ ở `ReferenceScreen`. (3) Một khóa idempotency cho mọi lần tìm: đổi sang khóa theo thân yêu cầu |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- [x] Agent đề xuất, System kiểm soát, Researcher quyết định; thao tác APR chỉ Researcher thực hiện. Duyệt, từ chối, thu hồi, gộp đều do nút của Researcher; kết quả Discover và mục nhập thủ công luôn vào Pending Approval.
- [x] Chuyển trạng thái khớp PRD 18.2: màn không tự đổi trạng thái, chỉ gửi lệnh và đọc lại; mock theo đúng chuyển Pending Approval → Trusted/Rejected, Trusted → Revoked, Revoked/Rejected → Trusted, Failed → Queued.
- [x] Context cách ly theo project và task: không áp dụng ở khu vực library (dữ liệu cấp tài khoản); project chỉ dùng ở “Thêm vào project” và “Project đang dùng”.
- [x] Gọi model qua Model Gateway: không áp dụng (giao diện).
- [x] Không import mã, không đọc database của service khác; dùng đúng hợp đồng trong `docs/api-design` (type `PublicApi` của `@sires/contracts`).
- [x] Sự kiện ghi qua outbox: không áp dụng (giao diện); màn xử lý sự kiện trùng không sai (mỗi sự kiện chỉ gây tải lại).
- [x] Migration: không áp dụng.
- [x] Giao diện theo `docs/ui-design/design.md`; có trạng thái trống, đang tải, lỗi, chạy lâu (`check-ui` 0 lỗi).
- [ ] Không sửa file trong điểm dừng: **sai một phần** — YC1 sửa `apps/web/src/shell/` (commit riêng `78baa91`, chờ phiên điều phối). Không ghi `docs/`, không sửa file sinh tự động.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ đều có ở `report.md` mục 5.
- [x] Không còn mã gỡ lỗi, TODO không có chủ; test mới có tên theo AC, EC.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Nguồn ý định: `docs/tickets/issues/PID-00098/` trên nhánh `docs/pid-00098-clarify` (index, specs/index, scope, acceptance, brief, S01–S09, designs/notes), bảng H1–H20. Mã: commit `78baa91`, `67b5858` trên `web/library-pid-00098`.

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | contradicts | MEDIUM | Sửa `apps/web/src/shell/` dù điểm dừng mục 7 cấm; shell thiếu `emit` cho override, thiếu gửi `FormData`, mẫu điều kiện mock sai | `check-tracks`: `web/library`, `web/shell`; commit `78baa91` | Commit riêng, ghi YC1; phiên điều phối giữ hoặc giao `web/shell` làm lại |
| G2 | partial | LOW | Trên `dev:mock`, `getWorkflow`, `cancelWorkflow`, `listPrompts`, `answerPrompt` trả mẫu sinh, nên lần tìm lỗi, thẻ chọn hồ sơ tác giả và hủy tìm không khớp kho của library (test thì khớp nhờ override cục bộ, H4) | `test-utils.tsx` (`otherAreas`) | Ghi “Đề xuất cho PO” mục 6.1; chờ mock của PID-00059, PID-00060 |
| G3 | partial | LOW | H11 là cách tạm, hợp đồng chưa mô tả prompt chọn hồ sơ | `Discover.tsx:312` (`PromptCard`) | Chờ PO; ghi trong report và mô tả PR |
| G4 | partial | LOW | EC44, EC46: chưa kiểm 1024×768, `en`, `prefers-reduced-motion` | mục 1 dòng preview | Ghi ở “Việc còn lại” |
| G5 | partial | LOW | `dev:mock`: dialog “Thêm vào project” hiện cả project Archived vì fixture không lọc `status=Active` | `Reference.tsx:393` gọi `listProjects` với `status: 'Active'` | Không phải mã của khu vực; ghi mục 6.2 |
| G6 | unrequested | LOW | Thêm `testFetch` (test) và `readUpload` (mock) để vượt giới hạn `FormData` của Vitest/jsdom | `test-utils.tsx`, `__mocks__/index.ts:34` | Nằm trong khu vực; ghi mục 6.3 |


## Lần 2 — 27/11/2026

Sau khi merge #131 Lần 5 (`fbb0ac0`).

| Lệnh | Kết quả |
| --- | --- |
| `eslint .`, `tsc -p tsconfig.json --noEmit` (`apps/web`) | 0 lỗi |
| `vitest run` (`@sires/web`) | 24 file, 231/231 đạt (library 86, shell mock 33) |
| `build.spec.ts` › khu vực khai mock | Đạt: dòng `mocks:` của library đứng sau `mockEnabled`; bản build không có mock của khu vực |

G1 (YC1) thu hẹp: điều kiện mock đã vào #131. Còn `MockRequest.emit`, `ApiClient` gửi `FormData` và `topbar.spec`, chờ phiên điều phối quyết. Không có khoảng trống mới.


## Lần 3 — 27/11/2026

Sau QC độc lập Lần 1 (`dc4e48b`, CHƯA ĐẠT). Revert `78baa91`, merge #131 `f406d47` và #138 `b157d02`, sửa G1–G14, G16, G18–G20 (report.md Lần 3).

| Lệnh | Kết quả |
| --- | --- |
| `eslint .`, `tsc -p tsconfig.json --noEmit` (`apps/web`) | 0 lỗi |
| `vitest run` (`@sires/web`) | 26 file, 252/252 đạt (library 4 file, 94 test) |
| `check-ui.mjs apps/web/src/features/library` | 0 lỗi, 0 cảnh báo (bỏ dialog riêng nên hết cảnh báo bóng) |
| `add-license.mjs --check` | 0 file thiếu |
| So với hợp nhất của #131 và #138 | Chỉ khác ở `apps/web/src/features/library/` và `agent/execution/PID-00098/` |
| quét kiểu gitleaks `generic-api-key` | 0 dòng khớp |
| preview `dev:mock` | 1440×900: cột chính 886px, cột phải 374px; dialog Gộp nêu reference đích, focus ở “Không gộp”, Tab ở trong dialog. 390×844: 13/13 vùng bấm của panel chờ duyệt ≥ 44px, không cuộn ngang. Console sau khi tải lại không còn log `[MSW]` (worker `quiet`, #131) |

| G (QC Lần 1) | Mức | Trạng thái |
| --- | --- | --- |
| G1, G2 | HIGH | Đã sửa |
| G3–G12 | MEDIUM | Đã sửa (test ở report.md Lần 3) |
| G13, G14, G16 | LOW | Sửa một phần |
| G18, G19, G20 | LOW | Đã sửa; G20 trừ phần tải qua `getBlob` |
| G15, G17 | LOW | Chưa làm |

Tự kiểm mục 4: dòng “Không sửa file trong điểm dừng” nay đúng (YC1 đóng). Không còn CRITICAL, HIGH.


## Lần 4 — 27/11/2026

Bỏ mock `listProjectReferences` và `removeReferenceFromProject` khỏi library: hai operation này có mock chủ ở research (H31; report.md Lần 4). Commit `4d3d960`.

| Lệnh | Kết quả |
| --- | --- |
| `vitest run src/features/library` (nhánh này) | 4 file, 94/94 đạt |
| `tsc --noEmit`, `eslint src/features/library` (nhánh này) | 0 lỗi |
| Cây gộp `origin/preview/ui-ph02` (`0418d5a`) với `4d3d960`, worktree tạm: `NX_CACHE_DIRECTORY=<worktree>/.nx/cache-preview98 pnpm nx run-many -t test -p @sires/web --skip-nx-cache` | 68 file, **721/721** đạt, gồm `research/evidence.spec.tsx` (EC10) và `manuscript/__mocks__/manuscript-mock.spec.ts` (EC56) |
| Cây gộp: `tsc -p apps/web/tsconfig.json --noEmit`, `eslint src/features/library` | 0 lỗi |
| Cây gộp: `dev:mock` (cổng tạm 5184) | Khởi động không lỗi, `[SIRes mock] 167 handlers`, console không có lỗi. `/library` hiện panel 5 mục chờ duyệt và 6 dòng Trusted. `GET /projects/{rag}/references` trả 200 với 14 mục từ mock của research |
| Commit `d0c8586` của nhánh docs cũ (#156, thay bằng #159) | Không có trong nhánh này; không cần dựng nhánh v2 |

Worktree tạm và cấu hình preview tạm đã gỡ. Không có khoảng trống mới.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
