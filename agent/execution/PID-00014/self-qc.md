# PID-00014 — Self-QC của Dev

**Kết luận:** Chưa đạt — G2 HIGH / DBQ-10 (H7) chặn merge; G4 chờ PO. Xem Lần 4. Phần trước là lịch sử, kết luận cũ đã bị QC độc lập thay thế.

- **Ticket:** [PID-00014](../../../docs/tickets/issues/PID-00014/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 22/11/2026

## 1. Lệnh

Node 24.22.3, pnpm 10.34.9, Vitest 3.2.7 trên Windows; Docker Engine 29.8.2 trong WSL2 Ubuntu-24.04.
Các lệnh test dùng `DOCKER_HOST=tcp://127.0.0.1:2375`, `NX_DAEMON=false`, `NX_ISOLATE_PLUGINS=false`.
PostgreSQL 16 + pgvector thật qua `startPostgres`; HTTP đi qua Fastify và module ứng dụng thật bằng inject.

| Lệnh                                                                                        | Kết quả                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-pid.mjs PID-00014`                                                                   | Đủ để thực thi, 0 cảnh báo trước khi làm                                                                                                                                          |
| `pnpm nx run @sires/gateway:typecheck`                                                      | Đạt                                                                                                                                                                               |
| `pnpm nx run-many -t lint test build -p @sires/gateway --parallel=1`                        | Đạt; 29/29 test                                                                                                                                                                   |
| `pnpm nx run-many -t lint typecheck test build -p @sires/gateway --parallel=1`              | Lượt cuối sau kiểm HTTP đổi khóa và định dạng: đạt; 4 file, 29/29 test, không skip; 14.98 giây                                                                                    |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=2 --nxBail`    | Không đạt; chọn 19 project do lockfile. Platform đạt 167/167 test; knowledge 21 đạt, 1 lỗi, 2 skip; xem chi tiết dưới                                                             |
| `pnpm --filter @sires/gateway deploy --legacy --prod .nx/gateway-production`                | Đạt; có cảnh báo peer webpack/schema-utils từ đồ thị công cụ có sẵn                                                                                                               |
| CLI của gói production `node dist/migrate.js` trên DB rỗng                                  | Đạt; 1 migration ghi sổ; gói có SQL/journal và không có drizzle-kit/@sires/testing; Fastify `/health` 200                                                                         |
| `node scripts/docs/add-license.mjs --check`                                                 | Lượt trước pytest: 0 file thiếu; sau pytest báo 2 file cache `.pytest_cache/.gitignore`, `.pytest_cache/README.md`; không phải nguồn ticket. Nguồn gateway và kết quả Dev có SPDX |
| `node scripts/docs/update-index.mjs --check`                                                | Đạt ở lượt kiểm trước pytest; không sửa taskboard/docs                                                                                                                            |
| `node scripts/development/check-tracks.mjs`                                                 | Chỉ thấy commit báo cáo: repo; kiểm cả diff và untracked bằng `--stdin`: gateway + infra (lockfile)                                                                               |
| Kiểm diff và untracked, bỏ riêng lockfile tự sinh, bằng `check-tracks.mjs --stdin --strict` | Đạt: chỉ gateway; lockfile chỉ thêm importer gateway, đúng quy tắc 1.4.7                                                                                                          |
| `git diff --check`                                                                          | Đạt                                                                                                                                                                               |
| UI                                                                                          | Không có màn hình trong ticket                                                                                                                                                    |

Lỗi affected: `apps/knowledge/spikes/spk_05/test_text_layer.py:152`,
`test_corrupt_never_hangs` chờ worker chết có reason chứa `exited`, thực tế `timeout`.
`git diff origin/main -- apps/knowledge` trống. Không sửa mã knowledge để làm xanh ticket gateway.
Nx dừng do `--nxBail`; các target chưa chạy không được tính là đạt. `sires-common:test` bị dừng,
không có kết luận đầy đủ. Gateway được kiểm riêng đầy đủ sau lượt này.

Chuẩn bị Linux container đầu tiên đã dừng trong lúc cài phụ thuộc chậm, chưa chạy test;
không tính là đạt. Kiểm thực tế dùng Node Windows truy cập Docker trong WSL2 như cấu hình máy có sẵn.

## 2. AC → test

| AC                | Test                                                                            | Kết quả                                                                                          |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| PID-00014-AC01    | `apps/gateway/src/session/session.spec.ts › hết hạn sau 12 giờ không hoạt động` | Đạt: phiên hết hạn 401, không gia hạn; còn hạn và lệnh ghi hợp lệ gia hạn đúng 12 giờ            |
| PID-00014-AC02    | `apps/gateway/src/session/session.spec.ts › lệnh ghi thiếu CSRF bị từ chối`     | Đạt: POST/PUT/PATCH/DELETE thiếu token 403, handler không chạy, không gia hạn; token đúng đi qua |
| NFR-AUTH-001-AC01 | `apps/gateway/src/session/session.spec.ts › không có phiên`                     | Đạt phần PH-01: 401 problem+json, không trả dữ liệu; quét route nghiệp vụ thuộc PID-00039        |

NFR-AUTH-001-AC02 thuộc N7 (PID-00038/web), không tính vào nghiệm thu ticket này.

## 3. Edge case

| #    | Trạng thái    | Cách giải quyết / test                                                                                                 |
| ---- | ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| EC01 | Đã giải quyết | Hai POST đồng thời dùng cùng phiên, cả hai thành công, vẫn một dòng session                                            |
| EC02 | Đã giải quyết | Không có cookie → 401 và không có accountId                                                                            |
| EC03 | Đã giải quyết | Cookie sai định dạng, id không tồn tại, hai cookie trùng tên → 401                                                     |
| EC04 | Đã giải quyết | Thu hồi bằng revoked_at → find_session không trả dòng, HTTP 401                                                        |
| EC05 | Đã giải quyết | Quá hạn tuyệt đối → 401; last_seen_at không đổi                                                                        |
| EC06 | Đã giải quyết | Trước/sau 12 giờ và đúng tại hạn; GET auth/session cũng không hồi sinh phiên                                           |
| EC07 | Đã giải quyết | GET /events thành công nhưng hai cột thời gian không đổi                                                               |
| EC08 | Đã giải quyết | /health, /auth/login, /auth/callback công khai qua handler test                                                        |
| EC09 | Đã giải quyết | CSRF sai → 403 trước handler; cả handler ném 403 với token đúng cũng không gia hạn                                     |
| EC10 | Đã giải quyết | GET và HEAD không cần CSRF; GET nhận đúng accountId                                                                    |
| EC11 | Đã giải quyết | POST không phiên, có/không CSRF đều trả 401                                                                            |
| EC12 | Đã giải quyết | Bắt log request thành công/401/403; log có request completed, không có id, cookie, token hoặc khóa                     |
| EC13 | Đã giải quyết | Migration thiếu vai trò lỗi và rollback; không tự tạo vai trò                                                          |
| EC14 | Đã giải quyết | Polling GET lặp lại không đổi hạn; GET auth/session (có query) gia hạn đúng 12 giờ                                     |
| EC15 | Đã giải quyết | Hai lần tính token bằng nhau; cả hai tab POST thành công                                                               |
| EC16 | Đã giải quyết | Vai trò _app thật: A thấy phiên A, B/không context thấy 0; ghi tài khoản khác lỗi RLS                                  |
| EC17 | Đã giải quyết | App mới dùng khóa khác: HTTP POST token cũ 403, handler không chạy, hạn không đổi                                      |
| Mới  | Đã giải quyết | Thu hồi giữa find và renew không hồi sinh phiên; khóa sai không lộ giá trị trong lỗi; cookie không cho chèn thuộc tính |

## 4. Tự kiểm

- [x] Mọi slice đã chạy kiểm tương ứng; S01–S05 đạt trong phạm vi.
- [x] Không có model, agent hay APR trong ticket; không áp dụng quyền quyết định APR.
- [x] Không có state machine nghiệp vụ hoặc provenance trong ticket; DDL giữ nguyên.
- [x] Dữ liệu phiên cách ly theo tài khoản qua helper tenancy và RLS; EC16 kiểm bằng vai trò thật.
- [x] Không import mã hoặc đọc database của service khác; không thêm hợp đồng.
- [x] Không có sự kiện mới; outbox không áp dụng.
- [x] Migration mới, không sửa migration đã có; so schema với DDL tham chiếu đạt.
- [x] Không có UI; kiểm giao diện không áp dụng.
- [x] Đã sửa nhận định Lần 1 về ranh giới: sau YC1 có sửa ngoài luồng; Lần 4 khôi phục spike về main theo H9.
- [x] Đã ghi YC1 ngoài phạm vi bị QC bác và bỏ thay đổi ngoài gateway theo H9.
- [x] Mã runtime không có console.log hoặc TODO không chủ; test đặt theo AC/EC.
- [x] Đã tự QC; sau đó có qc-report.md độc lập Lần 1, giữ nguyên ở lượt sửa này.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

Đọc lại mã, output O1–O5, bước B1–B6, P1–P9 và N1–N10 theo hồ sơ:
migration/journal, lệnh Nx/runtime, module gắn vào AppModule, hai tên file test bắt buộc,
README và migration.* có đúng đường dẫn. DDL và hợp đồng không thay đổi.

| G   | Loại    | Mức  | Mô tả                                                                           | Bằng chứng                                    | Đã xử lý                                                        |
| --- | ------- | ---- | ------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| G1  | partial | HIGH | Chỉ kiểm hash CSRF đã lưu sẽ không vô hiệu token cũ khi đổi khóa (EC17)         | `session.service.ts:requireCsrf`, test EC17   | Đã kiểm thêm HMAC bằng khóa hiện tại; HTTP app đổi khóa trả 403 |
| G2  | partial | HIGH | Gia hạn trước handler có thể kéo dài phiên khi handler từ chối lệnh ghi (P4/H1) | `session.interceptor.ts:intercept`, test EC09 | Đã gia hạn sau thành công; handler ném 403 không đổi hạn        |

Hai nguy cơ trên được xử lý ngay trong thiết kế/triển khai và kiểm lại bằng lượt cuối 29/29 test.
Không còn khoảng trống CRITICAL hoặc HIGH của PID-00014. Lỗi knowledge và cảnh báo cache giấy phép
ở mục 1 là giới hạn kiểm toàn repo, không phải kết luận đã xanh toàn repo. PO cần QC độc lập trước merge.

## Lần 2 — 22/11/2026 · Kiểm nốt và sửa lỗi theo YC1

Phần 1–5 phía trên giữ kết quả của lượt đầu. Kết quả mới nhất thay thế nhận định affected chưa đạt:

| Lệnh / kiểm                                                                                           | Kết quả                                                                         |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Chạy riêng `test_corrupt_never_hangs` trước sửa                                                       | Lỗi tái hiện: worker chết bị phân loại timeout trên Windows                     |
| `uv run pytest spikes/spk_05/test_text_layer.py -q` sau sửa                                           | Exit 0; gồm hai trường hợp hồi quy EOF trước worker exit và EOF rồi worker treo |
| `uv run pytest spikes/spk-08/test_spk08.py -q` sau sửa                                                | Exit 0; bài end-to-end và hai test đường dẫn giấy phép đạt                      |
| Ruff cho bốn file Python đã sửa                                                                       | Đạt                                                                             |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=2 --output-style=static` | Exit 0; 19 project, 72/72 task đạt, 66 task dùng cache                          |
| `knowledge:test` trong lượt cuối                                                                      | 24 đạt, 2 skip, 39.32 giây                                                      |
| `agent-core:test` trong lượt cuối                                                                     | 23 đạt, 47.15 giây                                                              |

Hai test skip không phải test bị vô hiệu hóa để qua kiểm: test scale SPK-04 cần `SPK04_SCALE_DB`,
test PDF mẫu SPK-05 cần bộ dữ liệu tải trước. Không tăng timeout, không hạ assertion hoặc thêm skip.
Browser E2E không nằm trong các target lint/typecheck/test/build của lệnh này.

Tự đối chiếu thêm:

| G   | Loại        | Mức    | Bằng chứng và xử lý                                                                                                                                        |
| --- | ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G3  | contradicts | HIGH   | `knowledge/.../text_layer.py`: EOF đến trước trạng thái exit gây báo timeout sai; đã join trong ngân sách còn lại, có test worker đóng pipe rồi thoát/treo |
| G4  | partial     | MEDIUM | `agent-core/.../spk08_contract.py`: relpath khác ổ Windows ném ValueError; đã fallback URL giấy phép, có test cùng/khác ổ và end-to-end                    |

Không còn G3/G4 mở; không còn CRITICAL/HIGH. Sửa nguồn ngoài gateway được người dùng yêu cầu trực tiếp
qua YC1 trong report mục 5; QC độc lập đã bác căn cứ này và Lần 4 khôi phục spike theo H9.
Tại thời điểm Lần 2 chưa commit; Lần 3 đã đẩy PR. Log cục bộ không được dùng làm bằng chứng hiện tại.

## Lần 4 — 22/11/2026 · Tự đối chiếu sau QC độc lập

Đối chiếu lại AC01, AC02, NFR-AUTH-001-AC01, P1–P9, EC01–EC17, O1–O5,
QC độc lập G1–G7 và H7–H9 ở hồ sơ mới nhất từ main. G trong bảng này dùng mã của QC độc lập.

| G         | Kết quả             | Bằng chứng / việc còn lại                                                                                                                                                                                                            |
| --------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1 HIGH   | Đã sửa theo H9      | Diff với main ở knowledge/agent-core trống; giữ bản race #61                                                                                                                                                                         |
| G2 HIGH   | Còn mở — chặn merge | `migration.spec.ts`: migration chạy bằng migrator/owner thật; owner của hàm không SUPERUSER/BYPASSRLS; `_app` không context nhận 0 dòng thay vì một phiên hợp lệ. Chưa có quyết định mới về DBQ-10; giữ DDL theo yêu cầu trong phiên |
| G3 HIGH   | Đã sửa theo H8      | `session.guard.ts` dùng `routeOptions.url`; HTTP `/api/v1/auth/*`, `/api/v1/events`; ba test unit ngăn URL thô ảnh hưởng công khai/gia hạn. `/health` là probe chart chung                                                           |
| G4 MEDIUM | Chờ PO              | Không tự đổi người làm trong sổ, không sửa hồ sơ hoặc qc-report độc lập                                                                                                                                                              |
| G5 MEDIUM | Đã sửa              | Trạng thái chặn, ghi rõ số liệu cũ và giới hạn fixture superuser; bỏ đường dẫn máy và log hỏng; chân giấy phép ở cuối                                                                                                                |
| G6 LOW    | Đã sửa              | Hai test HTTP: thu hồi trong handler và database lỗi khi renew đều giữ 201 và body; kiểm không hồi sinh phiên, không log bí mật                                                                                                      |
| G7 LOW    | Đã sửa              | README cảnh báo chỉ `drizzle-kit generate --custom`                                                                                                                                                                                  |

| Lệnh / kiểm                                                                                           | Kết quả thực tế                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm nx run-many -t lint typecheck test build -p @sires/gateway --parallel=2 --output-style=static`  | Lint/typecheck/build đạt; lượt test đầu lộ lỗi fixture journal sau rollback và kiểm logger; đã sửa ở lượt sau                                                                                                                                                                                                                                                 |
| `pnpm --filter @sires/gateway test` sau sửa fixture/test                                              | **34 đạt, 1 lỗi / 35**, 5 file, 17.69 giây; duy nhất DBQ-10/G2. Không skip/expected failure                                                                                                                                                                                                                                                                   |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=2 --output-style=static` | Không đạt: chọn 20 project; chỉ `@sires/gateway:test` (DBQ-10) và `agent-core:test` lỗi. Gateway vẫn 34 đạt/1 lỗi; agent-core 20 đạt/1 lỗi, `test_ac02_ec03_read_latency_runs_end_to_end` ném ValueError do relpath giữa D: và C:. Giữ spike như main theo H9, báo PO; knowledge 22 đạt/2 skip theo điều kiện dữ liệu. Các target còn lại đạt hoặc dùng cache |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00014 --result`                 | Kết quả đủ, 0 cảnh báo                                                                                                                                                                                                                                                                                                                                        |
| AC01, AC02, NFR-AUTH-001-AC01 và EC01–EC17                                                            | Test guard/CSRF đạt trong fixture HTTP; không nghiệm thu production do G2. EC13/EC16 và schema/migration chạy lại đạt với migrator thật                                                                                                                                                                                                                       |
| `node scripts/docs/update-index.mjs --check`                                                          | Đạt; không ghi docs/taskboard                                                                                                                                                                                                                                                                                                                                 |
| `node scripts/docs/add-license.mjs --check`                                                           | 14 cảnh báo trên cache/report tự sinh không được Git theo dõi; nguồn sửa và test mới có SPDX                                                                                                                                                                                                                                                                  |
| `check-tracks.mjs --stdin` trên diff main                                                             | Gateway + infra do 12 dòng lockfile importer gateway; không có knowledge/agent-core                                                                                                                                                                                                                                                                           |
| `git diff --check`                                                                                    | Đạt                                                                                                                                                                                                                                                                                                                                                           |

Lần thử đầu thiếu liên kết dependency gateway trong node_modules. `pnpm install --frozen-lockfile`
bị EACCES ở dependency library có sẵn; cài có filter `@sires/gateway...` với frozen lockfile và
ignore-scripts thành công, không đổi lockfile. Không tính lượt thiếu dependency là kết quả đạt.
Không chạy lại production package hoặc staging ở lượt này. G2 HIGH vẫn chặn merge; cần PO/Tech lead
chốt DDL rồi sửa migration, chuyển fixture HTTP sang vai trò thật và QC độc lập lại.

## Lần 5 — 22/11/2026 · Sửa riêng lỗi SPK-08 Windows

- Đã kiểm lại PR #63, #67, tìm DBQ-10 và fetch origin: chưa có quyết định mới. Người dùng
  chọn “Giữ blocker, chưa thay đổi DDL”; G2/H7 tiếp tục chặn merge, G4 chờ PO.
- Nhánh riêng `agent-core/fix-spk08-license-cross-drive` chỉ sửa hai file spike SPK-08,
  không gộp vào PR #63 theo H9. Dùng cùng môi trường Python đã cài để chạy kiểm.
- `python -m pytest apps/agent-core/spikes/spk-08/test_spk08.py -q`: 8 test đạt, gồm
  test end-to-end xuất vào TEMP ở ổ khác và hai test hồi quy footer cùng/khác ổ.
- `python -m ruff check` trên hai file sửa và `git diff --check` ở nhánh riêng: đạt.
- Toàn bộ `python -m pytest -o 'addopts=' -q` ở agent-core nhánh riêng: **23 đạt, không skip**,
  36.58 giây, 2 cảnh báo deprecation có sẵn. Dùng Docker endpoint và `UV_PROJECT_ENVIRONMENT`
  trỏ về môi trường đã cài để subprocess `uv run --no-sync alembic` chạy đúng. Lượt đầu thiếu
  Alembic trong venv mới của worktree đã lỗi; sau cấu hình môi trường, kiểm lại toàn bộ đạt.
- `git diff origin/main --exit-code -- apps/agent-core apps/knowledge` ở nhánh gateway:
  đạt, không đưa sửa ngoài luồng trở lại PR. DDL/migration vẫn nguyên trạng.

## Lần 6 — 23/11/2026 · Kiểm lại sau đồng bộ main / Vitest 4

- Đồng bộ main `f9da4af`, gồm CI PID-00009 và Vitest 4.1.12, cùng commit remote `c3b6983`.
  Frozen lockfile của gateway hợp lệ; không thay catalog hoặc sửa lockfile bằng tay.
- `pnpm --filter @sires/gateway test`: **34 đạt, 1 lỗi / 35**, 5 file, 48.47 giây trên Windows;
  chỉ DBQ-10/G2, không skip hoặc expected failure. HTTP 22 test và guard 3 test đạt.
- Gateway lint, typecheck, build trực tiếp đạt. Nx build local không đạt do EPERM khi
  generator đổi tên thư mục `libs/ts/contracts/src/generated`; đây là giới hạn workspace,
  không dùng kết quả cache để tuyên bố kiểm sạch.
- [CI Linux 45110694858](https://github.com/toilatrung/sires/actions/runs/45110694858):
  TypeScript chỉ lỗi DBQ-10 ở gateway (34 đạt, 1 lỗi, 18.21 giây); image gateway build đạt.
  Python, contracts, contract-test, asyncapi-payload, dependencies, secrets, docs, tracks,
  Terraform và các image khác đạt. Các target có dùng cache; không coi đây là lượt chạy mới
  của mọi test trong monorepo.
- `check-pid --result`: 0 cảnh báo; `update-index --check`, Prettier nguồn TS gateway,
  `git diff --check` đạt. Diff knowledge/agent-core với main trống.
- Người dùng chọn giữ blocker: không sửa DDL/migration, không bỏ assertion lỗi DBQ-10.
  G4 tiếp tục chờ PO; chưa merge, chưa nghiệm thu production.
- Phát hiện thêm Helm smoke CI không cấp cấu hình phiên bắt buộc khi chạy image gateway.
  Sửa `infra/ci/check-helm-images.sh` cấp riêng gateway DSN thử và khóa CSRF ngẫu nhiên;
  không dùng secret production. Các service khác tiếp tục chỉ nhận `PORT` như trước.
- Docker Linux build từ nguồn Git sạch đạt: frozen install, generator hợp đồng, Nx build
  và deploy production. Image chạy với cấu hình thử trả `/health` 200, PID 1 UID 1000.
  `bash -n infra/ci/check-helm-images.sh` đạt. Lần thử PowerShell đầu sinh khóa lỗi quoting,
  đã sửa lệnh kiểm và chạy lại đạt, dọn container; không coi lượt đầu là đạt.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->

SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).
