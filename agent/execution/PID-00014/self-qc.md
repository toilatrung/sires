# PID-00014 — Self-QC của Dev

**Kết luận:** Đạt — Lần 2 ngày 22/11/2026 đã sửa lỗi knowledge/agent-core theo YC1; affected 19 project, 72 task đạt.

- **Ticket:** [PID-00014](../../../docs/tickets/issues/PID-00014/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 21/11/2026

## 1. Lệnh

Node 24.22.3, pnpm 10.34.9, Vitest 3.2.7 trên Windows; Docker Engine 29.8.2 trong WSL2 Ubuntu-24.04.
Các lệnh test dùng `DOCKER_HOST=tcp://127.0.0.1:2375`, `NX_DAEMON=false`, `NX_ISOLATE_PLUGINS=false`.
PostgreSQL 16 + pgvector thật qua `startPostgres`; HTTP đi qua Fastify và module ứng dụng thật bằng inject.

| Lệnh | Kết quả |
| --- | --- |
| `check-pid.mjs PID-00014` | Đủ để thực thi, 0 cảnh báo trước khi làm |
| `pnpm nx run @sires/gateway:typecheck` | Đạt |
| `pnpm nx run-many -t lint test build -p @sires/gateway --parallel=1` | Đạt; 29/29 test |
| `pnpm nx run-many -t lint typecheck test build -p @sires/gateway --parallel=1` | Lượt cuối sau kiểm HTTP đổi khóa và định dạng: đạt; 4 file, 29/29 test, không skip; 14.98 giây |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=2 --nxBail` | Không đạt; chọn 19 project do lockfile. Platform đạt 167/167 test; knowledge 21 đạt, 1 lỗi, 2 skip; xem chi tiết dưới |
| `pnpm --filter @sires/gateway deploy --legacy --prod .nx/gateway-production` | Đạt; có cảnh báo peer webpack/schema-utils từ đồ thị công cụ có sẵn |
| CLI của gói production `node dist/migrate.js` trên DB rỗng | Đạt; 1 migration ghi sổ; gói có SQL/journal và không có drizzle-kit/@sires/testing; Fastify `/health` 200 |
| `node scripts/docs/add-license.mjs --check` | Lượt trước pytest: 0 file thiếu; sau pytest báo 2 file cache `.pytest_cache/.gitignore`, `.pytest_cache/README.md`; không phải nguồn ticket. Nguồn gateway và kết quả Dev có SPDX |
| `node scripts/docs/update-index.mjs --check` | Đạt ở lượt kiểm trước pytest; không sửa taskboard/docs |
| `node scripts/development/check-tracks.mjs` | Chỉ thấy commit báo cáo: repo; kiểm cả diff và untracked bằng `--stdin`: gateway + infra (lockfile) |
| Kiểm diff và untracked, bỏ riêng lockfile tự sinh, bằng `check-tracks.mjs --stdin --strict` | Đạt: chỉ gateway; lockfile chỉ thêm importer gateway, đúng quy tắc 1.4.7 |
| `git diff --check` | Đạt |
| UI | Không có màn hình trong ticket |

Lỗi affected: `apps/knowledge/spikes/spk_05/test_text_layer.py:152`,
`test_corrupt_never_hangs` chờ worker chết có reason chứa `exited`, thực tế `timeout`.
`git diff origin/main -- apps/knowledge` trống. Không sửa mã knowledge để làm xanh ticket gateway.
Nx dừng do `--nxBail`; các target chưa chạy không được tính là đạt. `sires-common:test` bị dừng,
không có kết luận đầy đủ. Gateway được kiểm riêng đầy đủ sau lượt này.

Chuẩn bị Linux container đầu tiên đã dừng trong lúc cài phụ thuộc chậm, chưa chạy test;
không tính là đạt. Kiểm thực tế dùng Node Windows truy cập Docker trong WSL2 như cấu hình máy có sẵn.

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00014-AC01 | `apps/gateway/src/session/session.spec.ts › hết hạn sau 12 giờ không hoạt động` | Đạt: phiên hết hạn 401, không gia hạn; còn hạn và lệnh ghi hợp lệ gia hạn đúng 12 giờ |
| PID-00014-AC02 | `apps/gateway/src/session/session.spec.ts › lệnh ghi thiếu CSRF bị từ chối` | Đạt: POST/PUT/PATCH/DELETE thiếu token 403, handler không chạy, không gia hạn; token đúng đi qua |
| NFR-AUTH-001-AC01 | `apps/gateway/src/session/session.spec.ts › không có phiên` | Đạt phần PH-01: 401 problem+json, không trả dữ liệu; quét route nghiệp vụ thuộc PID-00039 |

NFR-AUTH-001-AC02 thuộc N7 (PID-00038/web), không tính vào nghiệm thu ticket này.

## 3. Edge case

| # | Trạng thái | Cách giải quyết / test |
| --- | --- | --- |
| EC01 | Đã giải quyết | Hai POST đồng thời dùng cùng phiên, cả hai thành công, vẫn một dòng session |
| EC02 | Đã giải quyết | Không có cookie → 401 và không có accountId |
| EC03 | Đã giải quyết | Cookie sai định dạng, id không tồn tại, hai cookie trùng tên → 401 |
| EC04 | Đã giải quyết | Thu hồi bằng revoked_at → find_session không trả dòng, HTTP 401 |
| EC05 | Đã giải quyết | Quá hạn tuyệt đối → 401; last_seen_at không đổi |
| EC06 | Đã giải quyết | Trước/sau 12 giờ và đúng tại hạn; GET auth/session cũng không hồi sinh phiên |
| EC07 | Đã giải quyết | GET /events thành công nhưng hai cột thời gian không đổi |
| EC08 | Đã giải quyết | /health, /auth/login, /auth/callback công khai qua handler test |
| EC09 | Đã giải quyết | CSRF sai → 403 trước handler; cả handler ném 403 với token đúng cũng không gia hạn |
| EC10 | Đã giải quyết | GET và HEAD không cần CSRF; GET nhận đúng accountId |
| EC11 | Đã giải quyết | POST không phiên, có/không CSRF đều trả 401 |
| EC12 | Đã giải quyết | Bắt log request thành công/401/403; log có request completed, không có id, cookie, token hoặc khóa |
| EC13 | Đã giải quyết | Migration thiếu vai trò lỗi và rollback; không tự tạo vai trò |
| EC14 | Đã giải quyết | Polling GET lặp lại không đổi hạn; GET auth/session (có query) gia hạn đúng 12 giờ |
| EC15 | Đã giải quyết | Hai lần tính token bằng nhau; cả hai tab POST thành công |
| EC16 | Đã giải quyết | Vai trò _app thật: A thấy phiên A, B/không context thấy 0; ghi tài khoản khác lỗi RLS |
| EC17 | Đã giải quyết | App mới dùng khóa khác: HTTP POST token cũ 403, handler không chạy, hạn không đổi |
| Mới | Đã giải quyết | Thu hồi giữa find và renew không hồi sinh phiên; khóa sai không lộ giá trị trong lỗi; cookie không cho chèn thuộc tính |

## 4. Tự kiểm

- [x] Mọi slice đã chạy kiểm tương ứng; S01–S05 đạt trong phạm vi.
- [x] Không có model, agent hay APR trong ticket; không áp dụng quyền quyết định APR.
- [x] Không có state machine nghiệp vụ hoặc provenance trong ticket; DDL giữ nguyên.
- [x] Dữ liệu phiên cách ly theo tài khoản qua helper tenancy và RLS; EC16 kiểm bằng vai trò thật.
- [x] Không import mã hoặc đọc database của service khác; không thêm hợp đồng.
- [x] Không có sự kiện mới; outbox không áp dụng.
- [x] Migration mới, không sửa migration đã có; so schema với DDL tham chiếu đạt.
- [x] Không có UI; kiểm giao diện không áp dụng.
- [x] Không sửa docs, file sinh tự động hoặc nguồn luồng khác; lockfile chỉ sinh từ gói gateway theo 1.4.7.
- [x] Không có yêu cầu ngoài phạm vi; report mục 5 ghi Không có.
- [x] Mã runtime không có console.log hoặc TODO không chủ; test đặt theo AC/EC.
- [x] Đã áp dụng spec-converge-skill ở chế độ Dev tự QC; không có qc-report.md của QC độc lập.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đọc lại mã, output O1–O5, bước B1–B6, P1–P9 và N1–N10 theo hồ sơ:
migration/journal, lệnh Nx/runtime, module gắn vào AppModule, hai tên file test bắt buộc,
README và migration.* có đúng đường dẫn. DDL và hợp đồng không thay đổi.

| G | Loại | Mức | Mô tả | Bằng chứng | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | HIGH | Chỉ kiểm hash CSRF đã lưu sẽ không vô hiệu token cũ khi đổi khóa (EC17) | `session.service.ts:requireCsrf`, test EC17 | Đã kiểm thêm HMAC bằng khóa hiện tại; HTTP app đổi khóa trả 403 |
| G2 | partial | HIGH | Gia hạn trước handler có thể kéo dài phiên khi handler từ chối lệnh ghi (P4/H1) | `session.interceptor.ts:intercept`, test EC09 | Đã gia hạn sau thành công; handler ném 403 không đổi hạn |

Hai nguy cơ trên được xử lý ngay trong thiết kế/triển khai và kiểm lại bằng lượt cuối 29/29 test.
Không còn khoảng trống CRITICAL hoặc HIGH của PID-00014. Lỗi knowledge và cảnh báo cache giấy phép
ở mục 1 là giới hạn kiểm toàn repo, không phải kết luận đã xanh toàn repo. PO cần QC độc lập trước merge.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).

## Lần 2 — 22/11/2026 · Kiểm nốt và sửa lỗi theo YC1

Phần 1–5 phía trên giữ kết quả của lượt đầu. Kết quả mới nhất thay thế nhận định affected chưa đạt:

| Lệnh / kiểm | Kết quả |
| --- | --- |
| Chạy riêng `test_corrupt_never_hangs` trước sửa | Lỗi tái hiện: worker chết bị phân loại timeout trên Windows |
| `uv run pytest spikes/spk_05/test_text_layer.py -q` sau sửa | Exit 0; gồm hai trường hợp hồi quy EOF trước worker exit và EOF rồi worker treo |
| `uv run pytest spikes/spk-08/test_spk08.py -q` sau sửa | Exit 0; bài end-to-end và hai test đường dẫn giấy phép đạt |
| Ruff cho bốn file Python đã sửa | Đạt |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=2 --output-style=static` | Exit 0; 19 project, 72/72 task đạt, 66 task dùng cache |
| `knowledge:test` trong lượt cuối | 24 đạt, 2 skip, 39.32 giây |
| `agent-core:test` trong lượt cuối | 23 đạt, 47.15 giây |

Hai test skip không phải test bị vô hiệu hóa để qua kiểm: test scale SPK-04 cần `SPK04_SCALE_DB`,
test PDF mẫu SPK-05 cần bộ dữ liệu tải trước. Không tăng timeout, không hạ assertion hoặc thêm skip.
Browser E2E không nằm trong các target lint/typecheck/test/build của lệnh này.

Tự đối chiếu thêm:

| G | Loại | Mức | Bằng chứng và xử lý |
| --- | --- | --- | --- |
| G3 | contradicts | HIGH | `knowledge/.../text_layer.py`: EOF đến trước trạng thái exit gây báo timeout sai; đã join trong ngân sách còn lại, có test worker đóng pipe rồi thoát/treo |
| G4 | partial | MEDIUM | `agent-core/.../spk08_contract.py`: relpath khác ổ Windows ném ValueError; đã fallback URL giấy phép, có test cùng/khác ổ và end-to-end |

Không còn G3/G4 mở; không còn CRITICAL/HIGH. Sửa nguồn ngoài gateway được người dùng yêu cầu trực tiếp
qua YC1 trong report mục 5; không ghi docs hoặc đổi hợp đồng/DDL. Các thay đổi vẫn chưa commit.
Log cuối: [pid00014-final-check.log](../../../.nx/pid00014-final-check.log).
