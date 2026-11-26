# PID-00014 — Self-QC của Dev

**Kết luận:** Đạt — G8 đóng ở Lần 11 theo PC-05 P32 (chốt theo đề xuất, PO ủy quyền 26/11/2026: giữ sửa `infra/ci/check-helm-images.sh` trong PR #63); còn G11 LOW làm sau merge theo PC-05 P44. Mọi AC, EC01–EC17 đạt với migration bằng vai trò thật; G2 (DBQ-10, theo DBD-14) và G4 đã đóng ở Lần 10. Phần trước Lần 10 là lịch sử.

- **Ticket:** [PID-00014](../../../docs/tickets/issues/PID-00014/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 25/11/2026

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

## Lần 7 — 23/11/2026 · Báo lỗi và kiểm phạm vi bàn giao SIRes

- Gateway kiểm lại: **34 đạt, 1 lỗi / 35**, 5 file, 20.91 giây; chỉ DBQ-10.
  Không skip hoặc đánh dấu expected failure.
- [CI 45111435549](https://github.com/toilatrung/sires/actions/runs/45111435549) xác nhận bản sửa Helm:
  gateway và agent-core `/health` 200, PID 1 non-root; chỉ job TypeScript lỗi DBQ-10 và
  `build` tổng hợp báo lỗi theo. Không tuyên bố CI xanh.
- [Issue #83](https://github.com/toilatrung/sires/issues/83) ghi bước tái hiện, expected/actual,
  vai trò database thật và quyết định cần PO/Tech lead chốt; liên kết PR #63.
- Spike SIRes với provider eTroy One chỉnh local: 14/14 kiểm tra đạt; provider chưa commit/push.
  Không dùng kết quả đó để đóng DBQ-10 hoặc kết luận tương thích provider trên remote.
- Theo yêu cầu mới nhất, chỉ bàn giao hồ sơ và issue của SIRes. Không đưa bản sửa eTroy One
  vào commit hoặc push. DDL/migration giữ nguyên; G4 và yêu cầu QC độc lập vẫn còn.

## Lần 8 — 24/11/2026 · Tự đối chiếu sửa QC Lần 2

| Mã        | Kết quả tự kiểm          | Bằng chứng / việc còn lại                                                                                                                                                    |
| --------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G2 HIGH   | Còn mở                   | Issue #83 chưa có phản hồi; H7 và DDL trên origin/main chưa đổi. Test migrator/owner thật vẫn lỗi tại `migration.spec.ts:139`; không sửa assertion                           |
| G4 MEDIUM | Còn mở                   | Chờ PO xác nhận người làm và cập nhật sổ; không sửa taskboard                                                                                                                |
| G8 HIGH   | Còn mở; đã sửa hồ sơ Dev | `report.md` mục 5 ghi YC2 và phần chờ PO; ngày cập nhật, nguồn cảnh báo tracks trong `implement.md` đã đúng. Giữ hay tách infra vẫn cần PO quyết và code owner duyệt         |
| G9 LOW    | Đã sửa                   | `tsconfig.build.json` loại `src/**/*.testkit.ts`; tsc listFilesOnly không có testkit/spec; build mới có 36 file, quét không có spec/testkit hoặc tham chiếu `@sires/testing` |
| G10 LOW   | Đã sửa                   | README nêu năm vai trò, migrator tự SET role owner, quyền sở hữu hoặc CREATE trên database, SQLSTATE 42501 khi thiếu quyền                                                   |

- `pnpm --filter @sires/gateway... install --frozen-lockfile`: đạt, lockfile không đổi.
- `NX_DAEMON=false pnpm nx run-many -t build lint typecheck test -p @sires/gateway
--output-style=static --skip-nx-cache`: build/lint/typecheck đạt;
  test **34 đạt, 1 lỗi / 35**, 5 file, 44.43 giây, Vitest 4.1.12.
  Chỉ lỗi DBQ-10; lệnh tổng thoát lỗi. Không coi toàn bộ CI là xanh.
- AC01, AC02, NFR-AUTH-001-AC01 (gateway): test HTTP hiện có đạt ở mức Xây;
  fixture HTTP vẫn migrate bằng superuser, chưa chứng minh quyền production hoặc staging.
  Lượt này không đổi logic phiên/CSRF hay xử lý EC01–EC17.
- `add-license --check`, `update-index --check`, `git diff --check`: đạt.
  Diff lượt này: gateway + repo (hồ sơ Dev); toàn PR: gateway + infra + repo,
  cảnh báo hai luồng do G8. Không ghi `docs/` hoặc `qc-report.md`.

## Lần 10 — 25/11/2026 · Gộp main, DBD-14, vai trò thật (report Lần 10)

Đánh số theo `report.md` (Lần 9 ở report ứng với Lần 8 ở file này). Người làm: phiên do PO `toilatrung` giao.
Mã kiểm: đầu nhánh sau khi gộp `origin/main` `8c5581d` (#106, #107, #108) cộng thay đổi của lượt này.

### Lệnh

Windows 11, Node 24.21.0, pnpm 10.34.9, Vitest 4.1.12, uv 0.13.7; Docker Engine 29.8.2 trong WSL Ubuntu-24.04
(`DOCKER_HOST=tcp://localhost:2375`), PostgreSQL 16 + pgvector (`pgvector/pgvector:pg16`) qua Testcontainers.

| Lệnh                                                                                                                                 | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                     | Đạt (sau mỗi lần gộp `main`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pnpm nx run-many -t lint typecheck test build -p @sires/gateway --skip-nx-cache`                                                    | Đạt cả bốn target; test **35/35**, 5 file, không skip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm exec vitest run --reporter=verbose` (gateway)                                                                                  | `migration.spec.ts` 5/5 (gồm `DBQ-10 / G2`, EC13, EC16), `session.spec.ts` 22/22, `session.guard.spec.ts` 3/3, `app.module.spec.ts` 1/1, SPK-02 4/4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Thử đột biến: xóa dòng `CREATE POLICY owner_lookup` khỏi migration, chạy lại test gateway, rồi khôi phục (md5 trùng bản sinh)        | **15 lỗi / 35**: schema khớp DDL, `DBQ-10 / G2` và 13 test HTTP cần phiên hợp lệ lỗi; các ca không cần phiên hợp lệ (EC02–EC06, EC08, EC11, EC12, thuộc tính cookie) vẫn đạt. Chứng minh fixture HTTP đã chạy bằng quyền thật                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` (20 project do lockfile)                                          | Exit khác 0: 75 tác vụ, **64 đạt** (5 từ cache), 10 lỗi, 1 không chạy. Mọi tác vụ TypeScript đạt; test: gateway 35/35, platform 174/174, testing 16/16, sample-service 14/14, workspace 27/27, planning 41/41, orchestration 25/25, research 46/46, audit 35/35, library 46/46, manuscript 23/23, identity 20/20, sandbox-runner 1/1, web 10/10. Python test đạt: agent-core 20 đạt 1 skip, knowledge 38 đạt 2 skip, eval 20 đạt. Lỗi đều do môi trường Windows: `@sires/contracts:generate-python`, `@sires/contracts:test` (`uv tool run openapi-python-client` bị Smart App Control chặn, os error 4551); ruff, mypy của 4 project Python (`uv run` song song đồng bộ lại `.venv` chung nên thiếu ruff, mypy; shim `mypy.exe` bị chặn). `sires-common:test` không chạy vì phụ thuộc `generate-python` |
| `uv sync --frozen --all-packages` rồi `pnpm nx run-many -t lint typecheck -p agent-core knowledge sires-common eval --skip-nx-cache` | ruff đạt cả 4 project; `sires-common:typecheck` (python -m mypy) đạt; mypy của agent-core, knowledge, eval lỗi vì Windows chặn `mypy.exe` (os error 4551)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `uv run --frozen python -m mypy src` trong agent-core, knowledge, eval                                                               | Đạt cả ba (27, 8, 8 file) — cùng công cụ, gọi dạng module                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `@sires/contracts:test`, `sires-common:test`                                                                                         | Không chạy được trên máy này (SAC chặn `uv tool run`); PR không sửa hai project này. Trên CI Linux (dòng dưới) đạt, trúng cache Nx vì đầu vào không đổi so với `main`; `sires-common:test` 133 đạt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [CI run 45641867310](https://github.com/toilatrung/sires/actions/runs/45641867310) trên `4980f6f`                                    | Mọi job đạt: `typescript` (gateway chạy mới 35/35), `python`, `contracts`, `contract-test`, `asyncapi-payload`, 12 image, `helm`, `terraform`, `dependencies`, `secrets`, `docs`, `tracks`, `build`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `node scripts/development/check-tracks.mjs --base origin/main`                                                                       | Cảnh báo `PR touches 2 tracks (gateway, infra)`: `infra/ci/check-helm-images.sh` (G8); `pnpm-lock.yaml`, `agent/execution/` tính là `repo`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `node scripts/docs/add-license.mjs --check`                                                                                          | 0 file thiếu (sau khi xóa cache `.pytest_cache`, `.ruff_cache`, `.mypy_cache` do lệnh Python sinh, đều bị Git bỏ qua)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `node scripts/docs/update-index.mjs --check`                                                                                         | Đạt: 159 PID, 15 đợt; taskboard khớp                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `git diff --check`                                                                                                                   | Đạt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Prettier (`--end-of-line auto`) cho `apps/gateway/src`, `README.md`, `vitest.config.ts`                                              | Đạt; không có `--end-of-line auto` thì chỉ báo CRLF của checkout Windows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `check-pid.mjs PID-00014 --result`                                                                                                   | KẾT QUẢ ĐỦ, 0 cảnh báo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### AC → test (Lần 10)

| AC                               | Test                                                                                      | Kết quả                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| PID-00014-AC01                   | `session.spec.ts › hết hạn sau 12 giờ không hoạt động (PID-00014-AC01)`                   | Đạt với migration bằng migrator và service bằng `_app`: quá 12 giờ 401, `last_seen_at` không đổi; 11 giờ thì POST 201 và hạn idle = lúc gọi + 12 giờ |
| PID-00014-AC02                   | `session.spec.ts › lệnh ghi thiếu CSRF bị từ chối (PID-00014-AC02), có token đúng đi qua` | Đạt: POST, PUT, PATCH, DELETE thiếu token 403, handler không chạy, không gia hạn; token đúng đi tiếp                                                 |
| NFR-AUTH-001-AC01 (phần gateway) | `session.spec.ts › không có phiên (NFR-AUTH-001-AC01, EC02)`                              | Đạt: 401, không có dữ liệu                                                                                                                           |

EC01–EC17: đạt như bảng mục 3, nay mọi EC chạy trên `find_session` thuộc owner thật (trước đây EC03–EC06 chỉ
kiểm với hàm thuộc superuser). EC13: container riêng chưa có vai trò, lệnh migrate trả 1 và in `SQLSTATE 42704`,
không còn schema `app`, `replica`. EC16: `_app` thật, A thấy 1, B và thiếu context thấy 0, ghi chéo tài khoản lỗi.

### Tự đối chiếu (spec-converge-skill, chế độ Dev)

Đối chiếu O1–O5, B1–B6, P1–P9, N1–N10, EC01–EC17, AC ở `acceptance.html`, H1–H9 và việc còn lại của QC độc
lập Lần 1–2 với mã hiện tại. G dưới đây dùng mã của QC độc lập.

| G          | Mức         | Kết quả Lần 10          | Bằng chứng                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ----------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1         | HIGH        | Đã đóng (Lần 4, H9)     | Diff với `main` ở `apps/knowledge`, `apps/agent-core` trống                                                                                                                                                                                                                                                                                                                            |
| G2         | HIGH        | **Đã đóng** theo DBD-14 | `0000_init.sql` chép `gateway.sql` có `CREATE POLICY owner_lookup ON app.session FOR SELECT TO sires_gateway_owner USING (true)`; `migration.spec.ts › DBQ-10 / G2` đạt, assertion `[{ account_id: accountA }]` không đổi, thêm kiểm `_app` đọc thẳng bảng vẫn 0 dòng. Fixture HTTP (`startGatewayDatabase`) migrate bằng migrator, không còn superuser (H7). Thử đột biến ở bảng Lệnh |
| G3         | HIGH        | Đã đóng (Lần 4, H8)     | Guard dùng `routeOptions.url`; test dưới `/api/v1`                                                                                                                                                                                                                                                                                                                                     |
| G4         | MEDIUM      | **Đã đóng**             | PO giao PID-00014 cho `toilatrung` ngày 24/11/2026 (sổ `task-registry`, PC-04 B1). Code owner `/apps/gateway/` là `T1xNTH`: PO duyệt hoặc bypass khi merge                                                                                                                                                                                                                             |
| G5, G6, G7 | MEDIUM, LOW | Đã đóng (Lần 4)         | Như QC Lần 2 đã xác nhận                                                                                                                                                                                                                                                                                                                                                               |
| G8         | HIGH        | **Còn mở — chờ PO**     | `infra/ci/check-helm-images.sh` vẫn trong PR. Job `build` bắt buộc `needs: [..., helm, ...]` (`.github/workflows/ci.yml:379`); gateway dừng lúc khởi động nếu thiếu DSN và khóa CSRF, nên bỏ sửa này mà chưa có PR infra thì CI đỏ. Dev không tự quyết                                                                                                                                 |
| G9, G10    | LOW         | Đã đóng (Lần 9)         | `tsconfig.build.json` loại `*.testkit.ts` (`dist/db` chỉ có `migrate.*`); README nêu migrator, quyền CREATE; lệnh migrate nay in SQLSTATE                                                                                                                                                                                                                                              |

Khoảng trống mới phát hiện ở lượt này: không có CRITICAL, HIGH, MEDIUM. Ghi nhận LOW, không chặn:

- Migration đầu đổi nội dung trước khi merge nhưng giữ mục journal `0000_init` (`when` cũ). Database ở máy Dev đã
  áp bản cũ sẽ không áp lại; cần dựng lại (ghi `implement.md` mục 4). Chưa có môi trường nào ngoài máy Dev.
- Trên checkout Windows (`core.autocrlf=true`), phép so schema chỉ đạt vì migration và DDL cùng CRLF trong thân hàm;
  CI Linux dùng LF. Đề xuất `*.sql text eol=lf` đã nằm ở phiếu PC-04 mục C.

Mã gỡ lỗi: không có `console.log`, `debugger`, `.only`, `.skip`, `.todo` trong `apps/gateway/src`.
Ranh giới: thay đổi của lượt này chỉ trong `apps/gateway/` và `agent/execution/PID-00014/`; không sửa `docs/`,
`qc-report.md`, file sinh tự động. Còn G8 HIGH nên chưa đặt `Xong — chờ QC`.

## Lần 11 — 27/11/2026 · PC-05 P32 (report Lần 11)

Người chạy: phiên QC do PO `toilatrung` giao, theo chỉ đạo của phiên điều phối; ghi theo PC-05 P37 (PR sửa theo QC
thêm mục “Lần N”). Lượt này không đổi mã: gộp `origin/main` `c9e745b` (#109–#111, chỉ `docs/`) và ghi quyết định
G8 vào `report.md`.

| G | Mức | Kết quả Lần 11 | Bằng chứng |
| --- | --- | --- | --- |
| G8 | HIGH | **Đã đóng** | PC-05 P32 chốt theo đề xuất (PO ủy quyền 26/11/2026, nguyên văn ở `report.md` mục 5, YC4): giữ bản sửa `infra/ci/check-helm-images.sh` (`2355737`) trong PR #63, PR chạm hai luồng có chủ đích. QC độc lập Lần 3 đánh giá bản sửa cần và đúng |
| G11 | LOW | Để sau merge | PC-05 P44: PR nhỏ của luồng gateway thêm chốt vai trò cho fixture HTTP (`database.testkit.ts`) sau khi #63 merge; không chặn merge |

| Lệnh | Kết quả |
| --- | --- |
| `git merge origin/main` (`c9e745b`) | Không xung đột; chỉ `docs/` đổi |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00014 --result` | KẾT QUẢ ĐỦ (0 cảnh báo); trước khi sửa dòng Kết luận ở đầu file thì báo lỗi “report.md báo Xong nhưng self-qc.md kết luận Chưa đạt” |
| `node scripts/docs/add-license.mjs --check`, `node scripts/docs/update-index.mjs --check`, `git diff --check` | 0 file thiếu giấy phép; 159 PID, taskboard khớp; không lỗi khoảng trắng |
| CI trên đầu nhánh mới | Ghi ở QC độc lập Lần 4 |

Không có CRITICAL, HIGH, MEDIUM mới. Đặt `Xong — chờ QC` trong `report.md`.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->

SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).
