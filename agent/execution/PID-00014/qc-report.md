# PID-00014 — Báo cáo QC độc lập

**Kết luận mới nhất:** Merge được — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 1 LOW (Lần 4, 27/11/2026). G8 đóng theo PC-05 P32, chốt theo đề xuất (PO ủy quyền 26/11/2026): giữ bản sửa `infra/ci/check-helm-images.sh` trong PR #63, PR chạm hai luồng có chủ đích; nguyên văn ủy quyền ở `report.md` mục 5 (YC4). Còn G11 LOW (fixture HTTP không tự kiểm vai trò thật), làm sau merge theo PC-05 P44. Mã gateway không đổi so với Lần 3; CI đạt trên đầu nhánh `d43618d` đã cập nhật với `main`, test gateway chạy mới 35/35, smoke Helm gateway đạt.

- **Ticket:** [PID-00014](../../../docs/tickets/issues/PID-00014/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 22/11/2026 · spec-converge-skill

Người chạy: QC độc lập do phiên PO giao (không mang kết luận của Dev). Mã nguồn: PR #63, nhánh `gateway/pid-00014-session`, commit `43b85d8` (`43b85d8233cc8b2fd522457e4a0653015e3fdf7e`), kiểm trong một worktree tách riêng, không có thay đổi chưa commit. QC đánh giá file hiện có, không so nhánh; riêng hai file ngoài luồng được so với `main` để xét bản sửa của PR #61.

Đã đối chiếu: `index.html` (AC01, AC02, Gồm, Không gồm, H1–H6, mục 7, 8), `specs/acceptance.html`, `specs/scope.html` (P1–P9, N1–N10, EC01–EC17), `specs/index.html` (O1–O5, mục 4, B1–B6, mục 6, 7), `specs/brief.html`, slice S01–S05, `designs/notes.html`; hợp đồng `docs/api-design/openapi.yaml` (servers, Quy ước chung, `sessionCookie`), `paths/15-settings-and-sign-in.yaml` (`/auth/*`, mô tả `getSession` đã sửa theo H1), `components/parameters.yaml#/CsrfToken`, `components/responses.yaml` (Unauthorized, Forbidden); DDL `docs/database/ddl/00-common.sql`, `gateway.sql`; database 3.2 (`sections/03-topology-and-ownership.html`), 11.1 (`sections/11-security-and-tenancy.html`); kiến trúc 4 (`sections/04-runtime-flows.html`); chart chung `infra/helm/sires-service/templates/migration-job.yaml`; quy tắc 1.4 (`docs/tickets/sections/01-tracks-and-boundaries.html`), `.github/CODEOWNERS`, sổ task-registry; mã `apps/gateway/` và mọi file khác trong diff của PR: `apps/knowledge/spikes/spk_05/text_layer.py`, `test_text_layer.py`, `apps/agent-core/spikes/spk-08/spk08_contract.py`, `test_spk08.py`, `pnpm-lock.yaml`, `agent/execution/PID-00014/`.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | Ticket mục 7 (“Không được sửa: thư mục ngoài luồng gateway”; “Cần sửa luồng khác → dừng, đề xuất PID”), quy tắc 1.4.1 (một PR một luồng), CODEOWNERS (`/apps/knowledge/`, `/apps/agent-core/` là của `toilatrung`); tiền lệ PID-00034 G1 (PR #59, PO quyết tách PR) | contradicts | HIGH | PR sửa `apps/knowledge/spikes/spk_05/text_layer.py:217-225`, thêm `test_text_layer.py:144-164`, sửa `apps/agent-core/spikes/spk-08/spk08_contract.py:119-123`, thêm `test_spk08.py:79-90`. Căn cứ duy nhất là YC1 “Người dùng trong phiên”, nguyên văn “test nốt đi”, “tìm lỗi và sửa luôn” (`report.md:55`); không có lời PO, không có PID của luồng knowledge hay agent-core. `check-tracks.mjs` báo `PR touches 4 tracks (agent-core, gateway, infra, knowledge)`. Không AC nào của PID-00014 cần các thay đổi này. Về PR #61 (`a2e7bf6`, bản sửa race của PO trên `main`): không còn dấu xung đột, nhưng khi đồng bộ `main` (`ac12185`) Dev thay hẳn cách sửa của PO. Bản `main` chờ `proc.join(5)` cố định sau EOF rồi luôn báo `worker exited with code …`. Bản PR chờ phần ngân sách còn lại `timeout_s - đã trôi`, rồi báo `timeout` nếu worker còn sống. Ngữ nghĩa đổi theo hai chỗ: worker đóng pipe rồi treo nay là `timeout`; EOF đến sát hạn chỉ còn vài phần trăm giây để chờ. Test mới `test_eof_before_worker_exit[_close_then_die]` đặt `timeout_s=2`, tính cả thời gian spawn tiến trình con. Trong container Linux của QC (worktree gắn vào container, spawn chậm), test này lỗi 6/6 lần: `'timeout' == 'worker exited with code 3'`. Cùng test chạy với `text_layer.py` của `main` thì đạt 3/3. CI Linux của PR thì đạt. Vậy trên máy chậm, PR làm hỏng đúng trường hợp PR #61 đã sửa: worker thoát sau EOF lại bị báo `timeout`. Chi tiết ở mục Lệnh đã chạy. Ở agent-core: nhánh dự phòng ghi cứng URL `blob/main` của GitHub vào chân giấy phép của báo cáo sinh ra | Dev đưa bốn file trên về như `main` và bỏ YC1 khỏi PR này. Lỗi Windows (EOF trước khi worker thoát; `relpath` khác ổ) thì báo PO để chủ luồng `toilatrung` sửa trong PR riêng. Nếu PO muốn giữ ở PR này: PO ghi lời đồng ý vào `report.md` mục 5 và nới `timeout_s` của test mới cho khỏi phụ thuộc thời gian spawn |
| G2 | P1, P3, P9; S01 “Xong khi … đủ để chạy migration … trong cụm”; database 3.2 (migration đăng nhập bằng `sires_gateway_migrator`, `SET role = owner`; owner không BYPASSRLS); database 11.1 (`FORCE ROW LEVEL SECURITY` “áp cả với owner”; tra phiên trước tenant context bằng hàm `SECURITY DEFINER`); spec mục 7 (“DDL thiếu điều cần dùng → dừng và hỏi”) | partial | HIGH | Test chạy migration bằng superuser của container (`apps/gateway/src/db/database.testkit.ts:37`, `apps/gateway/src/migration.spec.ts:43-49`). Vì vậy `app.find_session` thuộc superuser và bỏ qua RLS. Testkit có tạo `sires_gateway_owner` (`database.testkit.ts:11`) nhưng không dùng. QC dựng lại theo database 3.2 trên `pgvector/pgvector:pg16` (image đã có): tạo owner, migrator (`IN ROLE` owner, `ALTER ROLE … SET role`), `_app`, `_system`, `_purge`; chạy `0000_init.sql` bằng migrator thì đạt. Kết quả: `app.find_session`, `app.session` thuộc `sires_gateway_owner`, `rolbypassrls = false`. Seed một phiên hợp lệ rồi gọi `select count(*) from app.find_session(sha256('sid-1'))` bằng `_app` được **0**. Nguyên nhân: `FORCE ROW LEVEL SECURITY` (`docs/database/ddl/00-common.sql:275`) cộng hàm `SECURITY DEFINER` chạy dưới quyền owner (`gateway.sql:31-39`, chép ở `migrations/0000_init.sql:346`). Trước tenant context, `app.current_account_id()` là NULL nên policy loại mọi dòng. Ở staging và production, mọi request mang cookie hợp lệ sẽ bị 401. Lỗi nằm ở DDL đã duyệt (DEC-57), Dev không tự sửa được. `report.md` không ghi điểm dừng hay DBQ | PO mở DBQ (Tech lead trả lời): cách cho hàm tra trước tenant context đọc được dòng (ví dụ owner BYPASSRLS, policy riêng cho owner, hay cách khác), sửa DDL. Sau đó Dev thêm test chạy migration bằng migrator/owner theo 3.2 và gọi `find_session` bằng `_app`; trước khi có quyết định, test đó sẽ lỗi. PO quyết chặn merge hay merge kèm DBQ mở, vì PH-01 chưa có phiên thật trên staging |
| G3 | P3, P6, EC08, EC14, H1; `docs/api-design/openapi.yaml:48`, `:53` (servers `…/api/v1`), kiến trúc 4 (`04-runtime-flows.html:63-64`, `:86`: `GET /api/v1/auth/login`, `/api/v1/auth/callback`, `/api/v1/events`); PID-00012 S04 (client gốc `/api/v1`) | contradicts | HIGH | `apps/gateway/src/session/session.guard.ts:10`, `:27-28` so `request.url` thô (bỏ query) với `/health`, `/auth/login`, `/auth/callback`; `:35` chỉ gia hạn khi path đúng bằng `/auth/session`. Test chỉ gắn route ở gốc (`session.spec.ts:24-35`). Nếu PID-00038 gắn route theo hợp đồng (`/api/v1/auth/*`), đăng nhập và callback bị 401, còn `GET /api/v1/auth/session` không gia hạn phiên. Lỗi sau không lộ ra: người dùng điều hướng vẫn bị đăng xuất sau 12 giờ. H1, EC14 chỉ đạt với đường dẫn gốc. Spike SPK-02 của chính gateway dùng `/api/v1/auth/callback` (`apps/gateway/spikes/spk-02/flow.spec.ts:23`). Tín hiệu ngược chiều: proxy dev của web chuyển `/api`, `/auth`, `/events` tới gateway (`apps/web/vite.config.ts:15`), và hồ sơ ghi `/auth/…` theo cách viết tương đối của `paths/` | PO chốt gateway phục vụ `/auth/*`, `/events` ở gốc hay dưới `/api/v1` (OQ; ảnh hưởng PID-00038, PID-00039, PID-00012). Dev cho guard so theo gốc API đã chốt, hoặc theo metadata route (ví dụ decorator đánh dấu route công khai) thay vì chuỗi URL, rồi thêm test ở đường dẫn thật. PO chốt “ở gốc” thì G3 đóng, chỉ còn đề xuất dùng metadata |
| G4 | Sổ task-registry (chỉ PO ghi), DEC-58, CODEOWNERS (`/apps/gateway/` là của `T1xNTH`) | quy trình (PO quyết) | MEDIUM | Sổ giao PID-00014 cho `T1xNTH` (`agent/execution/taskboard.html:53`, `:395`). Cả 7 commit và PR #63 do `Vietanhhhhhh2003` làm. `report.md`, hồ sơ ticket và PR không ghi việc PO giao lại; `report.md:55` chỉ ghi “Người dùng trong phiên”. Commit đều có chữ ký hợp lệ (xem Lệnh) | PO xác nhận ai làm PID-00014. Đã giao lại thì PO sửa cột assignee trong sổ. File trong `apps/gateway/` vẫn cần `T1xNTH` duyệt với vai code owner, hoặc PO bypass |
| G5 | Quy tắc báo cáo đúng hiện trạng (`spec-execution-skill`), không ghi đường dẫn máy vào file commit | partial | MEDIUM | `self-qc.md:82-83` ghi “[x] Không sửa … nguồn luồng khác” và “report mục 5 ghi Không có”; cả hai sai từ YC1. `self-qc.md:127-128` xếp lỗi spike knowledge thành G3 HIGH, agent-core thành G4 MEDIUM, như việc của ticket. `report.md:48` ghi “Không có diff knowledge so với origin/main”, sai ở đầu nhánh. `report.md:75`, `self-qc.md:131` ghi “chưa commit”, đã cũ. `report.md:15` ghi đường dẫn worktree trên máy Dev (ổ D, thư mục `.nx`); QC không chép lại ở đây. `report.md:77-78`, `self-qc.md:132` dẫn tới log `.nx/…` không có trong repo, nên liên kết hỏng. Chân giấy phép nằm giữa file (`implement.md:64`, `self-qc.md:102`), trước mục Lần 2. `report.md` mục 6 không nêu G2, G3 | Cập nhật `report.md`, `self-qc.md` theo hiện trạng sau khi xử lý G1. Bỏ đường dẫn máy và liên kết log cục bộ; đưa chân giấy phép về cuối file |
| G6 | P4, H1 (“phiên được gia hạn khi lệnh ghi được chấp nhận”), S02 bước Gia hạn (đặt trong guard, trước handler) | partial | LOW | Dev chuyển bước gia hạn lệnh ghi ra sau handler (`session.interceptor.ts:20-24`, `implement.md` mục 1 bước 3). Vì vậy handler ném lỗi thì không gia hạn, đúng H1. Nhưng nếu phiên bị thu hồi hoặc hết hạn trong lúc handler chạy, `renew()` ném `unauthenticated` (`session.service.ts:99`) sau khi lệnh ghi đã thực hiện. Client nhận 401 cho một lệnh đã có tác dụng. Chỉ có test ở mức service (`session.spec.ts:439-448`), không có test HTTP cho nhánh này | Chọn một cách và ghi `implement.md`: sau handler thành công thì bỏ qua lỗi gia hạn (log không chứa bí mật) và trả kết quả của handler; hoặc giữ 401 nhưng ghi rõ hành vi. Thêm test HTTP cho nhánh thu hồi trong lúc handler chạy |
| G7 | Kiến trúc 6.10 (custom migration), README mục Migration | partial | LOW | `drizzle.config.ts:7` trỏ `schema` tới `session.schema.ts`, trong khi snapshot `migrations/meta/0000_snapshot.json` trống (do migration đầu là custom). Chạy `drizzle-kit generate` không có `--custom` sẽ sinh lại `CREATE TABLE app.session` trùng với `0000_init.sql`. README có hướng dẫn dùng `--custom`, nhưng không cảnh báo điều này | README ghi rõ chỉ dùng `generate --custom`; hoặc bỏ `schema` khỏi `drizzle.config.ts` |

Ghi nhận thêm, không tính là khoảng trống:

1. Migration `0000_init.sql` là bản chép nguyên văn `00-common.sql` cộng `gateway.sql`. QC so bằng `diff`: chỉ khác một dòng `--> statement-breakpoint` ở giữa hai phần, cùng chú thích giấy phép. Test so `pg_dump --schema-only` với database dựng từ DDL tham chiếu đạt. EC13 (thiếu vai trò thì lỗi, rollback) và EC16 (RLS bằng `_app` thật, không SUPERUSER/BYPASSRLS) đạt. Journal có một mục `0000_init`; chạy lại không áp lại.
2. `deploy/values.yaml:11-13`: `migration.enabled: true`, `migration.command: ["node", "dist/migrate.js"]`. Dạng mảng khớp `infra/helm/sires-service/templates/migration-job.yaml:1-6`; CI `check-charts` đạt cho gateway. Lệnh migrate đọc `DATABASE_MIGRATOR_URL`, không in DSN hay lỗi thô (`src/db/migrate.ts:28-39`). `package.json` có `files: [dist, migrations]`; drizzle-kit chỉ ở devDependencies.
3. Bảo mật phiên. Cookie `sires_session` có `HttpOnly; Secure; SameSite=Lax; Path=/; Expires=` bằng hạn tuyệt đối (`session.crypto.ts:42-47`, H3). Session id 32 byte ngẫu nhiên; database chỉ lưu `sha256` của id và của CSRF token. CSRF token = HMAC-SHA256(khóa, session id) (`session.crypto.ts:14-16`, H2). So sánh dùng `timingSafeEqual` trên hai giá trị băm, kiểm cả hash đã lưu lẫn HMAC bằng khóa hiện tại nên EC17 đạt (`session.service.ts:70-79`). Khóa `GATEWAY_CSRF_KEY` bắt buộc 64 hex, không có mặc định; thông báo lỗi không chứa giá trị. Hết hạn 12 giờ không hoạt động do `app.find_session` kiểm (`idle_expires_at > now()`). `renew()` kiểm lại thu hồi và hạn trong UPDATE, dùng `greatest` để hai tab không làm lùi thời gian. Log không chứa cookie, session id, token (EC12 có test; logger nền che `cookie` và trường có đuôi `token`). Không đọc database hay import mã của service khác.
4. `pnpm-lock.yaml` chỉ đổi importer `apps/gateway` (thêm `drizzle-orm`, `pg`, `@types/pg`, `drizzle-kit` qua `catalog:`), đúng quy tắc 1.4.7. Cảnh báo `infra` của `check-tracks.mjs` đến từ file này.
5. Từ PR này, service cần `DATABASE_URL` (vai trò `_app`) và `GATEWAY_CSRF_KEY` lúc khởi động (`session.module.ts:16-19`). Thiếu một trong hai, `pnpm --filter @sires/gateway dev` dừng ngay. README đã ghi. Compose cục bộ chưa tạo vai trò gateway (PID-00159).
6. Commit: 7/7 có chữ ký hợp lệ (`verified: true`), tiếng Việt không hỏng dấu, không có trailer ghi công AI. Mô tả PR không có câu ghi công.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00014-AC01 | đạt (mức Xây), kèm G2, G3 | Testcontainers PostgreSQL 16 + pgvector, Fastify thật qua `inject`, route thử; chưa có staging | `apps/gateway/src/session/session.spec.ts › hết hạn sau 12 giờ không hoạt động (PID-00014-AC01)` | Đạt. Phiên quá 12 giờ: 401 `unauthenticated` problem+json, `last_seen_at` không đổi. Phiên 11 giờ: POST 201, `idle_expires_at − last_seen_at` = 12 giờ |
| PID-00014-AC02 | đạt (mức Xây) | như trên | `session.spec.ts › lệnh ghi thiếu CSRF bị từ chối (PID-00014-AC02), có token đúng đi qua` | Đạt. POST, PUT, PATCH, DELETE thiếu token: 403 `forbidden` problem+json, handler không chạy, không gia hạn; có token đúng thì đi tiếp |
| NFR-AUTH-001-AC01 (phần gateway) | đạt (mức Xây), kèm G3 | như trên | `session.spec.ts › không có phiên (NFR-AUTH-001-AC01, EC02)` | Đạt: 401, không có dữ liệu. Quét toàn bộ endpoint thuộc PID-00039 |

Edge case: EC01–EC17 đều có test và đạt (EC13, EC16 ở `migration.spec.ts`; còn lại ở `session.spec.ts`), với hai giới hạn: EC08, EC14 chỉ kiểm ở đường dẫn gốc (G3); EC03–EC06 chỉ kiểm với `find_session` thuộc superuser (G2). Ô S01–S05: đạt ở mức Xây. Riêng “Xong khi” của S01 (chạy được trong cụm) còn chờ G2.

### Lệnh đã chạy

Máy PO, Windows 11, Node 24, pnpm 10.34.9. Docker Engine 29.8.2 trong WSL Ubuntu-24.04 (`DOCKER_HOST` cổng 2375). Phần Python chạy trong container `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` (đã có), worktree gắn vào `/repo`, `UV_PROJECT_ENVIRONMENT=/venv`. Không pull image mới; image PostgreSQL dùng `pgvector/pgvector:pg16` đã có.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (27 giây) |
| `pnpm nx run @sires/gateway:test --skip-nx-cache` | Đạt: 4 file, **29/29 test** (43 giây). `migration.spec.ts` 4, `session.spec.ts` 20, `app.module.spec.ts` 1, SPK-02 4 |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --exclude=agent-core,knowledge,sires-common,eval --parallel=2 --skip-nx-cache` (15 project TS; 4 project Python chạy riêng ở dòng dưới vì Smart App Control chặn `.venv` trên Windows) | Exit 1: 59 tác vụ, 58 đạt, `@sires/platform:test` lỗi 2/167 test trên Windows: `errors.spec.ts › mã lỗi thuộc danh mục` (`fetch failed`, `ECONNRESET`) và `telemetry.spec.ts › span và log cùng mã yêu cầu` (quá 5 giây). PR không sửa `libs/ts/platform`; project này bị kéo vào affected chỉ vì lockfile. CI Linux đạt 167/167 (run 44933463882), nên QC coi đây là lỗi môi trường Windows, không tính cho PR. Gateway: lint, typecheck, build đạt, 29/29 test |
| `node scripts/development/check-tracks.mjs --base origin/main` | Exit 0, cảnh báo: `PR touches 4 tracks (agent-core, gateway, infra, knowledge); rule 1.4.1 expects one` (G1) |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu, cả trước và sau khi thêm `qc-report.md` này |
| `node scripts/docs/update-index.mjs --check` | Đạt: 159 PID, 15 đợt; taskboard khớp |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00014 --result` | KẾT QUẢ ĐỦ (0 cảnh báo), trạng thái “Xong — chờ QC” |
| Container uv: `uv sync --frozen --all-packages`, rồi `ruff check .`, `mypy src`, `pytest` cho `apps/knowledge`, `apps/agent-core`, `libs/py/sires_common`, `eval` | `uv sync` đạt. Ruff, mypy đạt cả 4 project. **knowledge: 1 failed, 23 passed, 2 skipped**; lỗi là `test_text_layer.py::test_eof_before_worker_exit[_close_then_die]`: `'timeout' == 'worker exited with code 3'` (G1). Hai skip cần `SPK04_SCALE_DB` và bộ PDF mẫu. agent-core: 22 passed, 1 skipped (bài SPK-08 end-to-end cần mã sinh `generate-python`). eval: 20 passed. `sires_common`: không tính, vì QC gọi pytest trực tiếp nên bỏ qua bước Nx `@sires/contracts:generate-python` mà test cần; PR không sửa project này; CI đạt |
| Lặp riêng hai test spike (`-k "eof_before_worker_exit or corrupt_never_hangs"`), 5 lần ở đầu nhánh PR, 3 lần với `text_layer.py` của `main` (chép vào thư mục tạm, không sửa worktree) | Đầu nhánh: **5/5 lần lỗi** `_close_then_die`, còn `test_corrupt_never_hangs` lần nào cũng đạt. Bản `main`: `_close_then_die` 3/3 đạt; `_close_then_hang` lỗi 2/3, vì test này mã hóa ngữ nghĩa mới của PR. Lần đạt duy nhất là khi spawn chậm quá 2 giây nên `poll` hết hạn trước EOF. Kết luận: trên máy spawn chậm, bản PR báo `timeout` cho worker đã đóng pipe rồi thoát, còn bản `main` báo đúng `exited` |
| Dựng vai trò theo database 3.2, chạy `0000_init.sql` bằng `sires_gateway_migrator`, gọi `app.find_session` bằng `_app` (container `pgvector/pgvector:pg16`, đã xóa sau khi chạy) | Migration đạt. `find_session` trả **0 dòng** cho phiên hợp lệ (G2) |
| `diff` `0000_init.sql` với `00-common.sql` + `gateway.sql` | Chỉ khác chú thích giấy phép và một dòng `--> statement-breakpoint` |
| `gh api repos/toilatrung/sires/pulls/63/commits` | 7/7 `verified: true`, reason `valid`; không có trailer ghi công AI, không hỏng dấu |
| `gh pr checks 63` (bằng chứng phụ) | `tracks` pass, `build` pass. Run 44933463882 trên `43b85d8`: affected 19 project đạt trên Linux, gateway 29 passed, knowledge 24 passed 2 skipped, agent-core 23 passed, Helm OK |

### Lệch với Self-QC

- `self-qc.md` mục 4 (`:82-83`) ghi không sửa nguồn luồng khác và “report mục 5 ghi Không có”. QC thấy PR sửa bốn file của knowledge, agent-core (G1), còn `report.md` mục 5 có YC1.
- `self-qc.md` Lần 2 coi lời của “người dùng trong phiên” là đủ để sửa ngoài luồng. Ticket mục 7 và quy tắc 1.4.1 yêu cầu dừng và đề xuất PID; người duyệt là PO (G1).
- `self-qc.md` mục 5 ghi “Không còn khoảng trống CRITICAL hoặc HIGH của PID-00014”. QC thấy G2 (find_session dưới vai trò thật) và G3 (gốc `/api/v1`) chưa được nêu.
- `self-qc.md`, `report.md` ghi `knowledge:test` đạt 24, 2 skip. QC chạy trong container Linux được 1 failed, 23 passed, 2 skipped. Test mới `test_eof_before_worker_exit[_close_then_die]` lỗi 6/6 lần vì phụ thuộc thời gian spawn; bản `main` đạt cùng trường hợp (G1).
- `self-qc.md` mục 1 ghi `affected` đạt 72/72 trên Windows. QC chạy trên Windows thấy `@sires/platform:test` lỗi 2 test (`ECONNRESET`, quá 5 giây). Project này PR không sửa, CI Linux đạt, nên QC không tính cho PR. Lệch này có thể do máy hoặc do cache của Dev; QC chạy với `--skip-nx-cache`.
- Về gateway, kết quả của QC khớp lời khai: 29/29 test, lint, typecheck, build đạt.

### Việc còn lại, theo thứ tự phụ thuộc

1. Đưa `apps/knowledge/spikes/spk_05/text_layer.py`, `test_text_layer.py`, `apps/agent-core/spikes/spk-08/spk08_contract.py`, `test_spk08.py` về như `main`; bỏ YC1 khỏi PR. Lỗi Windows thì báo PO để mở PR riêng của luồng knowledge, agent-core (G1).
2. PO mở DBQ về `SECURITY DEFINER` dưới `FORCE ROW LEVEL SECURITY` với owner không BYPASSRLS. Sau khi có quyết định, Dev thêm test migration bằng migrator/owner theo database 3.2, gọi `find_session` bằng `_app` (G2).
3. PO chốt gốc của `/auth/*`, `/events`. Dev cho guard so theo gốc đã chốt hoặc theo metadata route, thêm test ở đường dẫn thật cho EC08, EC14 (G3).
4. PO xác nhận người làm, sửa sổ nếu đã giao lại; `T1xNTH` duyệt với vai code owner hoặc PO bypass (G4).
5. Xử lý nhánh gia hạn thất bại sau handler, thêm test HTTP (G6); ghi chú hoặc sửa `drizzle.config.ts` (G7).
6. Cập nhật `report.md`, `self-qc.md`, `implement.md` theo hiện trạng (G5).

### Đề xuất cho PO

- **DBQ (G2):** DDL đã duyệt có `FORCE ROW LEVEL SECURITY` trên mọi bảng có `account_id` (00-common.sql), và database 3.2 cho owner không BYPASSRLS. Hai điều đó cùng làm hàm `SECURITY DEFINER` tra trước tenant context không đọc được dòng nào. Lỗi không riêng gateway: `app.find_account_by_identity` của identity (`docs/database/ddl/identity.sql:44-46`, PID-00016) cùng dạng. Nên chốt trước khi PID-00016 và PID-00038 làm tiếp. Spec S01 của các PID migration nên yêu cầu test chạy migration bằng migrator/owner, không bằng superuser.
- **OQ (G3):** chốt gateway phục vụ `/auth/*`, `/events` ở gốc hay dưới `/api/v1`. Hợp đồng, kiến trúc 4 và SPK-02 nói `/api/v1`; proxy dev của web và cách viết trong hồ sơ PID-00014, PID-00038 lại gợi ý gốc. Câu trả lời ảnh hưởng PID-00038, PID-00039, PID-00012.
- **Ngoài luồng (G1):** lỗi spike Windows của knowledge (EOF trước khi worker thoát) và agent-core (`relpath` khác ổ) là có thật trên Windows. Nếu PO muốn sửa, giao chủ luồng trong PR riêng. PR này thay bản sửa của PR #61, và trên máy spawn chậm còn làm hỏng lại đúng trường hợp #61 đã sửa (G1). Bản ở `main` nên giữ tới khi chủ luồng quyết.
- **Ghi chú:** job dọn `app.session` hết hạn (N5) vẫn chưa có PID nhận.

## Lần 2 — 23/11/2026 · spec-converge-skill

Người chạy: phiên QC do PO giao (không mang kết luận của Dev). Mã nguồn: PR #63, nhánh `gateway/pid-00014-session`, commit `44f1a9c` (`44f1a9c35141cc6e8b1b2d7808f2e3fe842512fb`), kiểm trong một worktree tách riêng, không có thay đổi chưa commit. Gốc so ranh giới: `origin/main` = `f9da4af`, khớp `main` trên remote lúc kiểm. PO dặn lần này kiểm kỹ phần database, nên QC dựng PostgreSQL thật để so migration với DDL, thay vì chỉ dựa vào test của Dev.

Đã đối chiếu: trang ticket (mục 1, 3, 7, 8; Làm rõ H1–H9, nhất là phiên 22/11/2026 H7–H9 và mục Còn mở), `specs/acceptance.html`, `specs/scope.html` (P1–P9, N1–N10, EC01–EC17), `specs/index.html` (O1–O5, mục 4–7), slice S01–S05, `designs/notes.html`; DDL `docs/database/ddl/00-common.sql`, `gateway.sql`; database 3.2 (`sections/03-topology-and-ownership.html`), 11.1–11.3 (`sections/11-security-and-tenancy.html`), 13 DBQ-10 (`sections/13-decisions-risks-and-open-issues.html`); hợp đồng `openapi.yaml` (servers `/api/v1`), `paths/15-settings-and-sign-in.yaml` (`/auth/*`, `security: []`); chart chung `infra/helm/sires-service/templates/migration-job.yaml`, `_helpers.tpl`, `infra/docker/node/Dockerfile`; `.github/CODEOWNERS`, `.github/workflows/ci.yml`, sổ task-registry trong `agent/execution/taskboard.html`; issue #83; toàn bộ diff của PR so với `origin/main` (28 file).

### Kiểm lại việc còn lại của Lần 1

| G Lần 1 | Kết quả Lần 2 | Bằng chứng |
| --- | --- | --- |
| G1 HIGH — sửa spike knowledge, agent-core | Đã xử lý (H9) | `git diff origin/main HEAD -- apps/knowledge apps/agent-core docs` trống. `check-tracks.mjs` không còn báo knowledge, agent-core |
| G2 HIGH — `find_session` 0 dòng dưới vai trò thật | **Còn mở**, chặn merge theo H7; DBQ-10 (issue #83) đang mở | Tái hiện ba cách. (1) `apps/gateway/src/migration.spec.ts:124-140` lỗi ở `:139`: `expected [] to deeply equal [ Array(1) ]`. (2) CI run 45117321073 trên `44f1a9c` lỗi đúng test này, 34/35. (3) QC tự dựng vai trò theo 3.2: `_app` gọi `app.find_session(sha256('qc-sid-1'))` khi chưa có tenant context được 0 dòng; cùng lời gọi trong giao dịch đã đặt `app.account_id` được 1 dòng, nên nguyên nhân là policy RLS. `_system` (BYPASSRLS) gọi hàm cũng được 0 dòng, vì hàm chạy bằng quyền owner. Không bị lách: không có `.skip`, `.todo`, `.fails`, `.only` trong `apps/gateway`. Assertion đòi đúng một phiên hợp lệ và không đổi từ commit `76f122d`. Bước test của job `typescript` trong CI không có `continue-on-error`. Phần còn lại sau DBQ-10: fixture HTTP vẫn migrate bằng superuser (`src/db/database.testkit.ts:48-50`), nên EC03–EC06 mới chỉ kiểm với hàm thuộc superuser. H7 yêu cầu chuyển fixture này sang vai trò thật |
| G3 HIGH — guard so URL thô | Đã xử lý (H8) | Guard đọc route đã khớp `request.routeOptions.url` (`src/session/session.guard.ts:27-28`, `:35`); route công khai là `/health`, `/api/v1/auth/login`, `/api/v1/auth/callback` (`:10`), khớp các operation có `security: []` của hợp đồng. Test HTTP gắn controller dưới `api/v1` (`session.spec.ts:19`). Test đơn vị chặn được ba trường hợp: route tham số có URL giống route công khai, query hay mã hóa phần trăm, GET `/api/v1/auth/session?navigation=1` (`session.guard.spec.ts:21-47`). Phần proxy web thuộc PID-00012 |
| G4 MEDIUM — người làm khác sổ | **Còn mở** | Sổ vẫn ghi `T1xNTH` (`agent/execution/taskboard.html:53`, `:392`). 16/17 commit do `Vietanhhhhhh2003` làm; commit còn lại là qc-report Lần 1 của PO. Trang ticket mục Còn mở ghi chờ PO |
| G5 MEDIUM — lời khai sai, đường dẫn máy | Đã xử lý phần chính | Không còn đường dẫn tuyệt đối của máy Dev hay liên kết log `.nx/…` hỏng. Chân giấy phép nằm cuối file; trạng thái ghi “Bị chặn — DBQ-10”. Hai chỗ còn sót được gộp vào G8: `report.md` mục 5 không ghi lần sửa infra; dòng “Cập nhật: 22/11/2026” (`report.md:7`, `implement.md:4`) cũ hơn Lần 7–8 ngày 23/11 |
| G6 LOW — gia hạn lỗi sau handler | Đã xử lý | Interceptor bắt lỗi gia hạn sau handler thành công, giữ kết quả và log câu cố định (`src/session/session.interceptor.ts:28-40`). Có hai test HTTP: thu hồi phiên trong handler, và database lỗi lúc gia hạn (`session.spec.ts:468-512`) |
| G7 LOW — `generate` thiếu `--custom` | Đã xử lý | `apps/gateway/README.md:92-93` |

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G2 | Như Lần 1; H7 (“PR #63 không merge tới khi DBQ-10 được chốt … test DDL chạy migration và gọi hàm bằng vai trò thật”) | partial | HIGH | Xem bảng trên. DDL chưa đổi: `docs/database/ddl/gateway.sql:31-39` giống `main`, DBQ-10 chưa có câu trả lời | Chờ PO, Tech lead chốt DBQ-10 và sửa `gateway.sql`. Sau đó Dev sửa migration theo DDL mới, chuyển fixture HTTP sang migrator/owner và `_app` thật, chạy lại để test `migration.spec.ts:124-140` đạt mà không đổi assertion |
| G4 | Như Lần 1 | quy trình (PO quyết) | MEDIUM | Xem bảng trên | PO xác nhận người làm. Nếu đã giao lại thì PO sửa sổ; `T1xNTH` duyệt với vai code owner `/apps/gateway/`, hoặc PO bypass |
| G8 | Ticket mục 7 (“Không được sửa: … `pnpm-workspace.yaml` và `infra/` (luồng infra)”; “Cần sửa luồng khác → dừng, đề xuất PID”), quy tắc 1.4.1, CODEOWNERS (`/infra/ @congminh1705`) | contradicts | HIGH | Commit `2355737` sửa `infra/ci/check-helm-images.sh:15-21`: cấp `DATABASE_URL` thử (`127.0.0.1:1`) và `GATEWAY_CSRF_KEY` ngẫu nhiên cho container gateway trong Helm smoke. `check-tracks.mjs --base origin/main`: `PR touches 2 tracks (gateway, infra)`; đây là file duy nhất thuộc luồng infra (`pnpm-lock.yaml` nay tính là `repo`). Căn cứ duy nhất là “Người dùng … chọn ‘Giữ blocker, sửa phần còn lại’” (`report.md:157`, `:169-172`), không phải lời PO. Hồ sơ ticket không nhắc file này, `report.md` mục 5 (`:56-58`) cũng không ghi. Lý do sửa là có thật: từ PR này gateway dừng ngay lúc khởi động nếu thiếu hai biến (`src/session/session.module.ts:17-19`, `src/session/session.crypto.ts:50-53`). QC chạy gói production không có cấu hình thì tiến trình thoát với mã 1, nên smoke chỉ cấp `PORT` sẽ lỗi. Nội dung sửa an toàn: không dùng secret thật, `bash -n` đạt, job `helm` của CI đạt | PO quyết một trong hai. (a) Giữ trong PR này: PO ghi lời đồng ý vào `report.md` mục 5, `@congminh1705` duyệt với vai code owner `/infra/`. (b) Tách thành PR của luồng infra, merge trước #63. Dù chọn cách nào, Dev cũng ghi việc này vào `report.md` mục 5 và cập nhật ngày ở `report.md:7`, `implement.md:4` |
| G9 | O2; quy ước build của repo (`libs/ts/platform`, `apps/planning`, `apps/workspace`, `apps/orchestration` loại `*.testkit.ts` khỏi `tsconfig.build.json`) | partial | LOW | `apps/gateway/tsconfig.build.json:3-5` chỉ loại `src/**/*.spec.ts`. Gói `pnpm --filter @sires/gateway deploy --legacy --prod` (cách Dockerfile dựng image) có `dist/db/database.testkit.js`. File này chứa mật khẩu thử `gateway-test` và `require('@sires/testing')`, một gói không có trong bản production: `require` file này thì lỗi. Không mã runtime nào import nó nên service không hỏng, nhưng mã test vẫn vào image. `report.md:39` ghi “gói production không có … @sires/testing”: đúng với `node_modules`, chưa đúng với `dist` | Thêm `"src/**/*.testkit.ts"` vào `exclude` của `tsconfig.build.json` |
| G10 | P2 (“cách chạy migration … vai trò do ai tạo”), S01 Xong khi (“đủ để chạy migration … trong cụm”), database 3.2 (`sires_gateway_migrator`) | partial | LOW | `apps/gateway/README.md:72-74` liệt kê owner, `_app`, `_system`, `_purge`, nhưng thiếu `sires_gateway_migrator`, vai trò mà Job đăng nhập. README cũng không nêu owner phải sở hữu database hoặc có quyền `CREATE` trên database (để `CREATE SCHEMA` và tạo extension trusted). QC thử: database thuộc `postgres`, owner không có `CREATE` thì `node dist/migrate.js` thoát mã 1, lỗi gốc `42501 permission denied for database`. Lệnh chỉ in một câu chung (`src/db/migrate.ts:36-38`), nên người vận hành không biết nguyên nhân. Cấp `GRANT CREATE ON DATABASE` cho owner thì migration đạt, schema giống hệt | README nêu đủ vai trò (cả migrator) và điều kiện `CREATE` trên database cho Terraform và PID-00159. Có thể in thêm SQLSTATE (không in DSN), như lệnh migrate của planning, workspace |

Ghi nhận thêm, không tính là khoảng trống:

1. **Migration so với DDL.** `0000_init.sql` bằng `00-common.sql` nối `gateway.sql`; `diff` chỉ khác một dòng trống và `--> statement-breakpoint` sau dòng 310. QC dựng ba database trên `pgvector/pgvector:pg16` (PostgreSQL 16.15) với vai trò theo 3.2: owner `NOLOGIN NOBYPASSRLS`; migrator `LOGIN`, thành viên owner, `ALTER ROLE … SET role`; `_app`; `_system`, `_purge` `BYPASSRLS`. Database thứ nhất chạy `node dist/migrate.js` bằng migrator. Database thứ hai chạy DDL qua `psql -v ON_ERROR_STOP=1` cũng bằng migrator. Database thứ ba thuộc `postgres`, chỉ cấp `CREATE` cho owner, rồi chạy migration. So `pg_dump --schema-only` cả database, giữ `OWNER TO`, `GRANT`, policy (test của Dev dùng `--no-owner`): ba bản giống hệt, chỉ khác token `\restrict` ngẫu nhiên. Mọi bảng, hàm, schema, cấu hình text search thuộc `sires_gateway_owner`. Extension `pgcrypto`, `unaccent`, `pg_trgm` nằm ở `public`. Migration không có `CREATE ROLE`, `ALTER ROLE` hay `BYPASSRLS`.
2. **RLS và quyền.** `app.session`, `app.sse_event_log`, `app.idempotency_key` bật cả ENABLE lẫn FORCE; `outbox`, `inbox`, `job_lock`, `state_transition` không bật, đúng `00-common.sql`. Bằng `_app` thật: không đặt context thì thấy 0 dòng; ghi dòng cho tài khoản khác bị `new row violates row-level security policy`; `TRUNCATE`, `CREATE TABLE app.…`, đọc `app.outbox` đều bị từ chối. INSERT trong context không truyền `id` sinh UUID phiên bản 7. UPDATE gia hạn kiểu `renew()` trong context cập nhật 1 dòng.
3. **Hàm `SECURITY DEFINER`.** Chỉ có `app.find_session`. Owner là `sires_gateway_owner` (`rolsuper = f`, `rolbypassrls = f`). `proconfig = {search_path=app, pg_temp}`: cố định, `pg_temp` đứng cuối; thân hàm gọi bảng có tên schema đầy đủ; chỉ owner được tạo đối tượng trong `app`. ACL là `{=X/sires_gateway_owner, sires_gateway_owner=X, sires_gateway_app=X}`: **PUBLIC vẫn có EXECUTE**, vì DDL chỉ `GRANT … TO sires_gateway_app` mà không `REVOKE … FROM PUBLIC`. Thực tế chỉ vai trò có `USAGE` trên schema `app` gọi được (owner, migrator, `_app`, `_system`, `_purge`). Vai trò lạ có `CONNECT` mà gọi thì bị `permission denied for schema app`. Đây là điều của DDL, migration chép đúng; xem Đề xuất cho PO.
4. **CHECK trả SQL NULL.** CHECK duy nhất của gateway là `revoke_reason IN (…)`, NULL theo thiết kế vì cột cho phép NULL. Bảng của gateway không dùng hàm kiểm hình dạng jsonb nào. Các hàm chung trong migration (chép từ `00-common.sql`) thì có ca trả NULL, và PostgreSQL coi CHECK = NULL là đạt. QC chạy thử trên database đã migrate:

   | Hàm | Đầu vào | Kết quả |
   | --- | --- | --- |
   | `app.is_actor_ref` | `{"type":"agent","agentRunId":"r1"}` (thiếu `agent`) | NULL |
   | `app.is_actor_ref` | `{"type":"agent","agent":"analysis","agentRunId":"r1"}` (analysis thiếu `instance`, sai luật A/B) | NULL |
   | `app.is_actor_ref` | `{"type":"agent","agent":"discovery","agentRunId":"r1"}` (hợp lệ) | NULL, đạt CHECK do tình cờ; dùng trong `WHERE`, `NOT` thì sai |
   | `app.is_approval_record` | đủ khóa `decidedAt`, `objectType`, `objectId`, `objectVersion` nhưng thiếu `approvedBy`, hoặc `approvedBy` không có `type`, hoặc thiếu `decision`, hoặc thiếu `apr` | NULL (bốn ca) |
   | `app.is_provenance` | `{"createdBy":{"type":"system","component":"c"}}` (thiếu `inputs`) | NULL |
   | `app.is_provenance` | `createdBy` là agent thiếu `agent`, hoặc analysis thiếu `instance`, `inputs: []` | NULL |
   | `app.is_versioned_refs` | `[]`, phần tử thiếu `version`, phần tử là chuỗi hoặc `null`, đầu vào là object | t, f, f, f, f: không có ca NULL |

   Một bảng tạm có `CHECK (app.is_provenance(p))`, `CHECK (app.is_actor_ref(a))`, `CHECK (app.is_approval_record(r))` nhận dòng mang ba giá trị NULL ở trên (INSERT 0 1). Lỗi không ảnh hưởng PID-00014 nên không tính G. Nhưng nó đã có trong các migration trên `main`: `apps/planning`, `apps/workspace`, `apps/orchestration` (`0000_init.sql`, ví dụ `created_by jsonb NOT NULL CHECK (app.is_actor_ref(created_by))`), cùng `apps/agent-core/migrations/versions/0001_initial_schema.sql`. Xem Đề xuất cho PO.
5. **Chạy lại, journal, lệnh production.** `node dist/migrate.js` chạy hai lần đều exit 0. `drizzle.__drizzle_migrations` có đúng 1 dòng, `created_at = 1795279881813`, khớp `when` của `meta/_journal.json`; bảng sổ thuộc owner. Target `pnpm nx run @sires/gateway:migrate` đạt trên database rỗng. Gói `pnpm deploy --legacy --prod` có `migrations/` (SQL, journal), `drizzle-orm`, `pg`; không có `drizzle-kit`, `@sires/testing` trong `node_modules`. Chạy `node dist/migrate.js` từ gói hai lần đều đạt, 1 dòng sổ. Thiếu DSN thì exit 1. Sai mật khẩu thì exit 1, thông báo không chứa mật khẩu. Gói production chạy bằng DSN `_app` thật thì `/health` trả 200, log không chứa mật khẩu DSN.
6. **Helm.** `deploy/values.yaml:11-13` có `migration.enabled: true` và `command: ["node", "dist/migrate.js"]` dạng mảng, khớp `migration-job.yaml:1-7`. Job nhận biến qua `envFrom` của `migration.secretName` (`_helpers.tpl:18-22`). Giống planning, workspace, orchestration, giá trị riêng không đặt `secretName`; môi trường cấp `DATABASE_MIGRATOR_URL` (README `:97-98`). QC không render cục bộ vì máy không có Helm; job `helm` của CI đạt.
7. **Phiên và CSRF.** Session id là 32 byte ngẫu nhiên, base64url chuẩn tắc 43 ký tự (`session.crypto.ts:22-29`); cookie thiếu, trùng hoặc sai định dạng bị 401. Database chỉ lưu `sha256` của session id và của CSRF token (test `session.spec.ts:343-365`; QC kiểm bằng SQL). CSRF token là HMAC-SHA256(khóa, session id) dạng hex (`:14-16`). Khi kiểm, token phải khớp cả hash đã lưu lẫn HMAC tính bằng khóa hiện tại, so sánh bằng `timingSafeEqual`; header lặp thì bị từ chối (`session.service.ts:70-79`). Cookie có `HttpOnly; Secure; SameSite=Lax; Path=/; Expires` bằng hạn tuyệt đối (`session.crypto.ts:42-47`). Hạn 12 giờ do `find_session` kiểm; `renew()` kiểm lại thu hồi và hạn trong UPDATE, dùng `greatest` (`session.service.ts:81-101`). Guard dựa vào route đã khớp (G3). Log không có cookie, session id, token, khóa (EC12, hai test G6). Khóa CSRF bắt buộc 64 hex, không có mặc định; thông báo lỗi không chứa giá trị khóa.
8. Commit: 17/17 commit `verified: true`, reason `valid` (`gh api …/pulls/63/commits`); không có trailer ghi công AI, mô tả PR không có câu ghi công. `pnpm-lock.yaml` chỉ đổi importer `apps/gateway`.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00014-AC01 | Đạt ở mức Xây. Một phần dưới vai trò thật (G2): phiên hợp lệ cũng bị 401 nên nhánh “dưới 12 giờ thì đi tiếp” không đạt | Testcontainers PostgreSQL 16 + pgvector, Fastify thật qua `inject`, route thử dưới `/api/v1`; fixture migrate bằng superuser; chưa có staging | `apps/gateway/src/session/session.spec.ts › hết hạn sau 12 giờ không hoạt động (PID-00014-AC01)` | Đạt. Quá 12 giờ thì 401 `unauthenticated`, `last_seen_at` không đổi. 11 giờ thì POST trả 201, hạn idle = lúc gọi + 12 giờ |
| PID-00014-AC02 | Đạt ở mức Xây. Dưới vai trò thật, request bị 401 ở bước tra phiên trước khi tới bước kiểm CSRF (G2) | như trên | `session.spec.ts › lệnh ghi thiếu CSRF bị từ chối (PID-00014-AC02), có token đúng đi qua` | Đạt. POST, PUT, PATCH, DELETE thiếu token: 403 `forbidden` problem+json, handler không chạy, phiên không được gia hạn. Có token đúng thì đi tiếp |
| NFR-AUTH-001-AC01 (phần gateway) | Đạt ở mức Xây | như trên | `session.spec.ts › không có phiên (NFR-AUTH-001-AC01, EC02)` | Đạt: 401, không có dữ liệu. Quét toàn bộ endpoint thuộc PID-00039 |

Edge case: EC01–EC17 đều có test và đạt. EC13, EC16 chạy bằng migrator/owner và `_app` thật. EC08, EC14 nay kiểm ở đường dẫn `/api/v1`. EC03–EC06 vẫn chỉ kiểm với `find_session` thuộc superuser (G2). Slice: S03–S05 đạt ở mức Xây. S01 đạt phần migration (schema, owner, quyền khớp DDL khi chạy bằng migrator); mục Xong khi “chạy được trong cụm” còn chờ G2 và G10. S02 chờ G2.

### Lệnh đã chạy

Máy PO, Windows 11, Node 24.21.0, pnpm 10.34.9. Docker Engine 29.8.2 trong WSL Ubuntu-24.04 (`DOCKER_HOST` cổng 2375). Container PostgreSQL riêng của QC dùng image `pgvector/pgvector:pg16` đã có, đã xóa sau khi kiểm; không pull image mới.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (34 giây) |
| `pnpm nx run-many -t lint typecheck build -p @sires/gateway --skip-nx-cache` | Đạt cả ba target cùng 4 tác vụ phụ thuộc (sinh và build `@sires/contracts`, build `@sires/testing`, `@sires/platform`), 37 giây; không gặp EPERM |
| `pnpm nx run @sires/gateway:test --skip-nx-cache` | Exit 1: 5 file, **34/35 đạt**. Lỗi duy nhất là DBQ-10 ở `migration.spec.ts:139` (G2) |
| `pnpm exec vitest run --reporter=verbose` trong `apps/gateway` | Như trên. Theo file: `migration.spec.ts` 4/5, `session.spec.ts` 22/22, `session.guard.spec.ts` 3/3, `app.module.spec.ts` 1/1, SPK-02 4/4; không có test skip hay todo |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --exclude=agent-core,knowledge,sires-common,eval --parallel=2 --skip-nx-cache` (16 project TS trong 20 project affected; 4 project Python không chạy, xem dòng Python) | Exit 1: 63 tác vụ, 61 đạt. Hai tác vụ lỗi. `@sires/gateway:test` lỗi 34/35 vì DBQ-10 (G2). `@sires/platform:test` lỗi 167/168: `telemetry.spec.ts › span và log cùng mã yêu cầu` quá 5 giây; chạy riêng lại vẫn lỗi như vậy, giống Lần 1 trên máy này. PR không sửa `libs/` (diff trống) và CI Linux của PR đạt 168/168, nên QC coi đây là lỗi môi trường Windows, không tính cho PR. Mọi target lint, typecheck, build và test của các project còn lại đạt |
| `node scripts/development/check-tracks.mjs --base origin/main` | Exit 0, cảnh báo `PR touches 2 tracks (gateway, infra); rule 1.4.1 expects one`. Theo từng file (`--stdin`): `infra/ci/check-helm-images.sh` thuộc infra (G8); `pnpm-lock.yaml`, `agent/execution/PID-00014/` thuộc `repo` |
| `git diff --stat origin/main...HEAD` | 28 file: `apps/gateway/` (22), `agent/execution/PID-00014/` (4), `pnpm-lock.yaml`, `infra/ci/check-helm-images.sh`. Không còn file của knowledge, agent-core hay `docs/` |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu, cả trước và sau khi thêm mục Lần 2 này |
| `node scripts/docs/update-index.mjs --check` | Đạt: 159 PID, 15 đợt; taskboard khớp |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00014 --result` | KẾT QUẢ ĐỦ (0 cảnh báo), trạng thái “Bị chặn — DBQ-10 (H7), chưa được merge PR #63” |
| `diff` (`00-common.sql` nối `gateway.sql`) với `migrations/0000_init.sql` | Chỉ khác một dòng trống và `--> statement-breakpoint` |
| Dựng vai trò theo 3.2; `node dist/migrate.js` hai lần; `psql` chạy DDL bằng migrator; `pg_dump --schema-only` có owner và ACL; truy vấn `pg_proc`, `pg_class`, `has_function_privilege`; kiểm RLS bằng `_app`; thử các hàm kiểm CHECK (ghi nhận 1–5) | Schema giống hệt DDL. `find_session` bằng `_app` được 0 dòng (G2). PUBLIC còn EXECUTE trên `find_session`. Có ca CHECK trả NULL ở `is_actor_ref`, `is_approval_record`, `is_provenance` |
| Database không cấp `CREATE` cho owner, rồi `node dist/migrate.js` | Exit 1, lỗi gốc `42501 permission denied for database` (G10) |
| `pnpm --filter @sires/gateway deploy --legacy --prod`, chạy `dist/migrate.js` và `dist/main.js` từ gói | Migrate đạt hai lần; `/health` 200 với DSN `_app` thật; thiếu cấu hình thì exit 1. Gói có `dist/db/database.testkit.js` (G9) |
| `DATABASE_MIGRATOR_URL=… pnpm nx run @sires/gateway:migrate` | Đạt trên database rỗng, sổ có 1 dòng |
| `bash -n infra/ci/check-helm-images.sh` | Đạt |
| `gh api repos/toilatrung/sires/pulls/63/commits` | 17/17 `verified: true`, reason `valid`; không có trailer ghi công AI |
| `gh pr checks 63` (bằng chứng phụ, run 45117321073 trên `44f1a9c`) | `typescript` lỗi do đúng test DBQ-10 (34/35); `build` tổng hợp lỗi theo. `helm`, `tracks`, image gateway, `python`, `contracts` và các job còn lại đạt |
| `gh issue view 83` | DBQ-10 đang mở (`OPEN`) |
| Python (`knowledge`, `agent-core`, `sires_common`, `eval`) | Không chạy: PR không còn sửa các project này (diff trống). CI `python` đạt |
| Helm `check-charts.mjs` | Không chạy: máy không có Helm. Dựa vào job `helm` của CI (đạt) |

### Lệch với Self-QC

- `report.md:157`, `:169-172` và `self-qc.md` Lần 6 coi việc sửa `infra/ci/check-helm-images.sh` là nằm “trong phạm vi yêu cầu sửa phần còn lại” của người dùng trong phiên. QC thấy đó là sửa luồng infra, ticket mục 7 cấm, và chưa có lời PO. `report.md` mục 5 cũng không ghi (G8).
- `report.md:39` ghi gói production không có `@sires/testing`. Đúng với `node_modules`, nhưng `dist/db/database.testkit.js` vẫn có trong gói và gọi gói đó (G9).
- `self-qc.md:155` (Lần 4) ghi luồng infra xuất hiện “do 12 dòng lockfile”. Ở đầu nhánh hiện tại, lockfile được tính là `repo`; cảnh báo infra đến từ file script mà Lần 6 mới thêm. Lần 6, Lần 7 chỉ ghi job `tracks` của CI đạt (job này chỉ cảnh báo, không chặn), không nêu rằng cảnh báo infra nay đến từ file script.
- Về gateway, kết quả của QC khớp lời khai: 34/35 test, lỗi duy nhất là DBQ-10; lint, typecheck, build đạt. Dev gặp EPERM khi chạy Nx build trên máy của mình (`self-qc.md` Lần 6); trên máy QC, Nx build đạt. Đây là khác biệt môi trường, không tính là khoảng trống.

### Việc còn lại, theo thứ tự phụ thuộc

1. PO, Tech lead chốt DBQ-10 (issue #83) và sửa `gateway.sql` (cùng `identity.sql`). Dev sửa migration theo DDL mới, chuyển fixture HTTP (`database.testkit.ts:48-50`) sang migrator/owner và `_app` thật, rồi chạy lại để `migration.spec.ts:124-140` đạt mà không đổi assertion (G2, H7).
2. PO quyết G8: giữ trong PR này (ghi lời đồng ý ở `report.md` mục 5, `@congminh1705` duyệt) hay tách thành PR của luồng infra merge trước.
3. PO xác nhận người làm PID-00014 và sửa sổ nếu đã giao lại (G4).
4. Dev loại `*.testkit.ts` khỏi bản build (G9). Dev bổ sung README về vai trò migrator và quyền `CREATE` trên database, có thể in thêm SQLSTATE (G10).
5. Dev cập nhật `report.md` (mục 5, ngày cập nhật) và `implement.md` theo hiện trạng (G8). Sau đó QC độc lập Lần 3.

### Đề xuất cho PO

- **DBQ-10 (G2).** QC xác nhận thêm: gọi hàm bằng `_system` (BYPASSRLS) cũng được 0 dòng, vì hàm `SECURITY DEFINER` chạy bằng quyền owner. Vậy đổi vai trò gọi không giải quyết được; vẫn phải chọn một trong các phương án a–d của DBQ-10. Khi sửa DDL, nên thêm `REVOKE ALL ON FUNCTION app.find_session(bytea) FROM PUBLIC` (tương tự với `app.find_account_by_identity` ở `identity.sql`). Hiện PUBLIC còn EXECUTE; thực tế chỉ được giới hạn nhờ quyền `USAGE` trên schema `app`. PO cũng cần nói rõ cách sửa đi vào `0000_init.sql` hay một migration mới: ticket mục 7 cấm sửa migration đã có, nhưng `0000_init.sql` chưa merge và chưa áp ở môi trường nào.
- **DBQ mới (đề xuất, chưa cấp mã): hàm kiểm CHECK trong `00-common.sql` trả SQL NULL.** Các ca cụ thể ở ghi nhận 4. Hệ quả: CHECK nhận ActorRef agent thiếu `agent` hoặc analysis thiếu `instance`, ApprovalRecord thiếu `approvedBy`, `decision` hay `apr`, Provenance thiếu `inputs`. Ca cuối trái DATA-PROV-001 (“thiếu → từ chối ghi”). Lỗi không ảnh hưởng gateway, vì gateway không dùng các hàm này trong CHECK. Nhưng nó đã nằm trong migration của planning, workspace, orchestration, agent-core trên `main`, và trong DDL của identity, library, knowledge, research, manuscript, audit. Hướng sửa gợi ý: bọc kết quả bằng `coalesce(…, false)` hoặc so `IS TRUE` trong từng hàm. Sửa DDL rồi thêm migration mới cho các service đã merge.
- **Điều kiện hạ tầng (G10).** Terraform (staging, production) và compose (PID-00159) cần cho `sires_<svc>_owner` sở hữu database hoặc có `CREATE` trên database. Thiếu quyền này thì mọi migration theo kiến trúc 6.10 đều lỗi ngay ở `CREATE EXTENSION`, `CREATE SCHEMA`.
- **Ranh giới (G8).** Lần sửa infra là cần thiết để CI Helm smoke đạt, và nội dung an toàn. Chỉ thiếu căn cứ: lời PO cùng duyệt của chủ luồng infra.
- **Ghi chú:** job dọn `app.session` hết hạn (N5) vẫn chưa có PID nhận.

## Lần 3 — 25/11/2026 · spec-converge-skill

Người chạy: QC độc lập do PO `toilatrung` giao, không mang kết luận của Dev. Mã nguồn: PR #63, nhánh `gateway/pid-00014-session`, commit `316fd63` (`316fd63b5a0e4a8a69a43716decb0f5e21546d5e`). QC kiểm trong một worktree tách riêng, không có thay đổi chưa commit. Gốc so ranh giới: `origin/main` = `8c5581d`, cũng là merge-base của nhánh. Nhánh đã gộp #94 (EC09), #100 (`dumpSchema` qua base64), #107 (DBD-14), #108 (`TESTCONTAINERS_TIMEOUTS`).

Đã đối chiếu: trang ticket (mục 1, 3, mục 5 H1–H9, mục 7, 8), `specs/acceptance.html`, `specs/scope.html`, slice S01–S05. DBD-14 và DBQ-10 (`docs/database/sections/13-decisions-risks-and-open-issues.html`). Database 3.2 (vai trò migrator) và 11.1. DDL `00-common.sql`, `gateway.sql` trên `main`. Hợp đồng `openapi.yaml` (servers `/api/v1`) và `paths/15-settings-and-sign-in.yaml` (chỉ `startLogin`, `completeLogin` có `security: []`). Chart chung `infra/helm/sires-service`. `.github/workflows/ci.yml` (job `helm`, `build`), `.github/CODEOWNERS`, sổ task-registry. `report.md`, `implement.md`, `self-qc.md` (Lần 10). Toàn bộ diff của PR so với `origin/main` (30 file).

### Kiểm lại việc còn lại của Lần 2

| G Lần 2 | Kết quả Lần 3 | Bằng chứng |
| --- | --- | --- |
| G2 HIGH: `find_session` trả 0 dòng dưới vai trò thật (DBQ-10, H7) | Đã xử lý | DBQ-10 đã đóng theo DBD-14 (PO, 24/11/2026). `apps/gateway/migrations/0000_init.sql:385` giống `docs/database/ddl/gateway.sql:58`: `CREATE POLICY owner_lookup ON app.session FOR SELECT TO sires_gateway_owner USING (true)`, đặt sau `SELECT app.enable_tenant_rls()` (`0000_init.sql:381`). Test `src/migration.spec.ts:163-181` đạt, assertion `[{ account_id: accountA }]` giữ như Lần 2. Test kiểm thêm `_app` đọc thẳng bảng khi chưa có context thì thấy 0 dòng (`:180`). Cả `migration.spec.ts` (`:63-79`) và fixture HTTP (`src/db/database.testkit.ts:142`) đều migrate bằng `sires_gateway_migrator`. Service trong test kết nối bằng `_app` (`src/session/session.spec.ts:93`). QC tự dựng vai trò, thử đột biến và đối chiếu riêng: xem mục Thử đột biến và Ghi nhận 1–2 |
| G4 MEDIUM: người làm khác người trong sổ | Đã xử lý | Sổ task-registry ghi `toilatrung` (`agent/execution/taskboard.html:53`, `:385`). PO đổi ngày 24/11/2026 (`docs/docs_context.md:227`, PC-04 B1). Code owner của `/apps/gateway/` vẫn là `@T1xNTH` (`.github/CODEOWNERS:26`), nên PO duyệt hoặc bypass khi merge |
| G8 HIGH: sửa `infra/ci/check-helm-images.sh` | Còn mở, chờ PO chốt ở phiếu chốt cuối PH-01 | Xem bảng Khoảng trống và mục Đánh giá bản sửa infra |
| G9 LOW: testkit lọt vào bản build | Đã xử lý | `apps/gateway/tsconfig.build.json:3-6` loại `src/**/*.testkit.ts`. Sau khi build, `dist/db/` chỉ có `migrate.*` |
| G10 LOW: README thiếu migrator và quyền CREATE | Đã xử lý | `apps/gateway/README.md:72-84`. Lệnh migrate in SQLSTATE, không in DSN (`src/db/migrate.ts:55-62`). EC13 kiểm `SQLSTATE 42704` (`migration.spec.ts:203`) |

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G8 | Ticket mục 7 (“Không được sửa: … `infra/` (luồng infra)”), quy tắc 1.4.1, CODEOWNERS (`/infra/ @congminh1705`) | quy trình, **chờ PO**; không tính là lỗi mã | HIGH | `infra/ci/check-helm-images.sh:15-21` cấp `DATABASE_URL` thử và `GATEWAY_CSRF_KEY` ngẫu nhiên cho container gateway trong Helm smoke. `check-tracks.mjs --base origin/main` báo `PR touches 2 tracks (gateway, infra)`; đây là file duy nhất thuộc infra. `report.md` mục 5, YC2 ghi “Chờ PO quyết theo G8; chưa phải lời đồng ý của PO”. Về nội dung, bản sửa cần và đúng (xem mục Đánh giá bản sửa infra) | PO chốt một trong hai. (a) Giữ trong PR này: Dev ghi nguyên văn lời PO vào `report.md` mục 5 và đặt `Xong — chờ QC`; `@congminh1705` duyệt với vai code owner `/infra/`, hoặc PO bypass. (b) Tách thành PR của luồng infra với cùng nội dung, merge trước, rồi bỏ file khỏi #63. Chỉ đổi phần này thì không cần QC chạy lại mã gateway, chỉ cần job `helm` và `build` đạt trên đầu nhánh mới |
| G11 | H7 (“test DDL chạy migration và gọi hàm bằng vai trò thật thay cho superuser”), DBD-14 (“Test của hai hàm chạy bằng vai trò thật”) | partial | LOW | Fixture HTTP không tự kiểm rằng nó chạy bằng vai trò thật. Đột biến M5: đổi `database.testkit.ts:142` sang DSN superuser thì 27/27 test của `migration.spec.ts` và `session.spec.ts` vẫn đạt. Đột biến M6: M5 cộng bỏ `owner_lookup` ở cả migration lẫn DDL thì 13 test HTTP vẫn đạt, chỉ 2 test của `migration.spec.ts` bắt được. Bộ test hiện vẫn chặn được lỗi DBQ-10 nhờ `migration.spec.ts`, nên G11 không chặn merge | Dev làm khi tiện, PR sau cũng được: trong `startGatewayDatabase`, hoặc trong một test HTTP, kiểm owner của `app.find_session` là `sires_gateway_owner` và vai trò service không SUPERUSER/BYPASSRLS, giống `migration.spec.ts:164-169`, `:146-147` |

### Đánh giá bản sửa infra (G8)

- **Có cần không: cần.** Từ PR này gateway dừng lúc khởi động khi thiếu `DATABASE_URL` (`src/session/session.module.ts:18`) hoặc khóa CSRF hợp lệ (`src/session/session.crypto.ts:53`). QC chạy `dist/main.js` đã build chỉ với `PORT` thì tiến trình thoát mã 1, lỗi `DATABASE_URL is required…`. Có DSN mà không có khóa thì thoát mã 1, lỗi `GATEWAY_CSRF_KEY must contain…`. Script trên `main` chỉ cấp `PORT`, nên `curl /health` sẽ hỏng và job `helm` đỏ. Job `build` bắt buộc có `needs: [..., helm, ...]` (`.github/workflows/ci.yml:379`), nên bỏ bản sửa thì CI của #63 đỏ. Để gateway khởi động khi thiếu cấu hình thì trái README (`README.md:34`, “không dùng khóa mặc định”) và H2, nên sửa phía smoke là đúng chỗ.
- **Có đúng không: đúng.** Biến thêm chỉ áp cho `gateway` (`:16`). DSN trỏ `127.0.0.1:1` với tài khoản giả, không phải secret triển khai. Khóa CSRF sinh ngẫu nhiên mỗi lần chạy, không in ra. `/health` không truy vấn PostgreSQL. QC chạy `dist/main.js` với đúng hai biến đó: `/health` trả 200 `{"service":"gateway","status":"ok"}` dù DSN không tới được, log không chứa DSN hay khóa. `bash -n` đạt. Trên CI run 45642767821 (đầu `316fd63`), job `helm` in `OK gateway: /health 200, PID 1 non-root` và `OK Helm gateway`. Job `secrets` đạt. Mở rộng mảng `"${run_env[@]}"` dưới `set -u` không lỗi vì mảng luôn có `PORT`.
- **Gợi ý cho chủ luồng infra, không bắt buộc:** script chung đang ghi riêng tên `gateway`. Khi thêm service khác vào smoke (identity cũng cần DSN), có thể cho script đọc biến smoke từ `apps/<svc>/deploy/` thay vì thêm nhánh `if` cho từng service.

### Thử đột biến

QC sửa tạm file trong worktree, chạy `pnpm exec vitest run src/migration.spec.ts src/session/session.spec.ts` (27 test, PostgreSQL thật), rồi khôi phục bằng `git checkout`. Sau mỗi lần, `git status` sạch. Công cụ sửa giữ nguyên CRLF của checkout Windows, để kết quả không lẫn lỗi xuống dòng.

| Mã | Đột biến | Kết quả |
| --- | --- | --- |
| M1 | Bỏ dòng `owner_lookup` khỏi migration | **15 lỗi/27**: so schema, `DBQ-10 / G2`, 13 test HTTP cần phiên hợp lệ. Khớp lời khai của Dev (15/35 khi tính cả 8 test không chạm database) |
| M4 | Bỏ `owner_lookup` ở cả migration lẫn `gateway.sql` (DDL đổi theo nên phép so `pg_dump` không còn bắt) | **15 lỗi/27**: `DBQ-10 / G2`, 13 test HTTP, và test so schema (lỗi ở kiểm đoạn `CREATE POLICY owner_lookup … TO sires_gateway_owner`, `migration.spec.ts:98`) |
| M2 | Đổi `TO sires_gateway_owner` thành `TO PUBLIC` chỉ ở migration | **3 lỗi/27**: so schema, EC16 (`_app` thiếu context thấy dòng, `:137`), `DBQ-10 / G2` (`_app` đọc thẳng bảng, `:180`) |
| M3 | Đổi `TO PUBLIC` ở cả migration lẫn DDL | **3 lỗi/27**, như M2. Phép so schema không còn tác dụng, nhưng `:98`, `:137`, `:180` vẫn bắt |
| M10 | Đổi `FOR SELECT` thành `FOR ALL` ở cả migration lẫn DDL | 1 lỗi/27: chỉ kiểm đoạn ở `:98` bắt được. Đủ để chặn, nhưng chỉ có một chốt |
| M7 | `migration.spec.ts` migrate bằng superuser | 2 lỗi/27: so schema (owner khác) và kiểm owner của hàm (`:164-169`) |
| M8 | M7 cộng bỏ `owner_lookup` ở cả hai nơi | 15 lỗi/27 |
| M9 | Pool `_app` của `migration.spec.ts` dùng superuser | 2 lỗi/27: EC16 (`rolsuper`, `rolbypassrls`) và `DBQ-10 / G2` |
| M5 | Fixture HTTP migrate bằng superuser | **0 lỗi/27** (G11) |
| M6 | M5 cộng bỏ `owner_lookup` ở cả hai nơi | 2 lỗi/27, chỉ ở `migration.spec.ts`; 13 test HTTP vẫn đạt (G11) |
| M0 | Chỉ đổi migration sang LF (DDL vẫn CRLF trên checkout Windows) | 0 lỗi/27. `normalizeDump` bỏ `\r` (`database.testkit.ts:120`), nên phép so không phụ thuộc kiểu xuống dòng; xem Lệch với Self-QC |

Ghi nhận thêm, không tính là khoảng trống:

1. **Migration so với DDL trên `main`.** Bỏ ba dòng giấy phép đầu mỗi file DDL rồi `diff`: `0000_init.sql` chỉ thêm giấy phép và khối chú thích đầu file (dòng 1–16), một dòng trống, `--> statement-breakpoint` (`:327`) và khối tiêu đề phần `gateway.sql` (`:328-330`). Mọi dòng DDL khác giống nguyên văn, gồm COALESCE của EC09 và `owner_lookup` của DBD-14. QC dựng PostgreSQL 16.15 (`pgvector/pgvector:pg16`, image đã có) với vai trò theo 3.2: owner `NOLOGIN NOBYPASSRLS` sở hữu database; migrator `LOGIN`, `IN ROLE` owner, `SET role` owner; `_app`; `_system` và `_purge` là `LOGIN BYPASSRLS`. Chạy `node dist/migrate.js` của bản build bằng migrator: hai lần đều exit 0, sổ drizzle 1 dòng. Dựng database tham chiếu bằng `psql -f 00-common.sql -f gateway.sql`, cũng bằng migrator. So `pg_dump --schema-only` đầy đủ, giữ owner, ACL, policy: giống hệt sau khi bỏ `\r`. Phần khác duy nhất là `\r` trong thân hàm, vì migration lấy từ checkout Windows; xem ghi nhận 5. Có 24 lệnh `OWNER TO sires_gateway_owner`.
2. **Vai trò thật, không qua test của Dev.** `app.find_session` thuộc `sires_gateway_owner`, `prosecdef = true`. Policy trên `app.session`: `owner_lookup` (SELECT, owner) và `tenant_isolation` (ALL, public). Seed hai phiên ở hai tài khoản. `_app` đăng nhập thật (`rolsuper/rolbypassrls = false/false`) gọi hàm khi chưa có context: 1 dòng. Id không tồn tại: 0 dòng. `_app` đọc thẳng `app.session` khi chưa có context: 0 dòng. `_system` gọi hàm: 1 dòng (Lần 2 là 0). Owner đọc thẳng bảng thấy 2 dòng; `UPDATE` bằng owner được `UPDATE 0`, nên policy chỉ cho đọc. Migrator đăng nhập (`current_user = sires_gateway_owner`) đọc thẳng thấy 2 dòng. Đây là hệ quả đã ghi ở DBD-14 cộng 3.2 (migrator là thành viên owner); xem Đề xuất. Vai trò lạ có `CONNECT` gọi hàm thì bị `permission denied for schema app`, dù PUBLIC vẫn có EXECUTE (`has_function_privilege('public', …) = true`).
3. **Route và guard (H8).** Guard đọc route đã khớp `request.routeOptions.url` (`src/session/session.guard.ts:27`), không đọc URL thô. Route công khai chỉ cho GET, HEAD tới `/health`, `/api/v1/auth/login`, `/api/v1/auth/callback` (`:10`, `:28`). Danh sách này khớp hai operation có `security: []` dưới servers `/api/v1`; `logout` (POST) và `getSession` cần phiên. Chỉ gia hạn ở GET `/api/v1/auth/session` (`:35`). Test HTTP gắn controller dưới `api/v1` (`session.spec.ts:19`). Test đơn vị chặn route tham số có URL giống route công khai, query, mã hóa phần trăm và POST tới route công khai (`session.guard.spec.ts:21-47`). Platform dùng Fastify (`libs/ts/platform/src/bootstrap.ts:63`), không đặt global prefix. Chạy bản build thì `/health` trả 200, `/api/v1/x` trả 404.
4. **Phiên, CSRF, Helm.** Phần mã phiên và CSRF không đổi so với Lần 2, trừ fixture; ghi nhận 7 của Lần 2 vẫn đúng. `alpine/helm:3.19.0` (image đã có) render chart chung với `deploy/values.yaml`: có Job `gateway-migration` (hook `pre-install,pre-upgrade`) chạy `node dist/migrate.js`, non-root, `automountServiceAccountToken: false`.
5. **Xuống dòng.** Migration áp từ checkout Windows (`core.autocrlf=true`) lưu `\r` trong thân hàm (`pg_proc.prosrc`). Image chạy ở cụm được dựng trên CI Linux nên là LF. Không ảnh hưởng chức năng. Đề xuất `*.sql text eol=lf` đã có ở PC-04 mục C.
6. **Journal.** Nội dung `0000_init.sql` đổi trước khi merge nhưng giữ `when` cũ (`migrations/meta/_journal.json`). Database nào đã áp bản cũ sẽ không áp lại. Hiện chỉ có database trên máy Dev, `implement.md` mục 4 đã ghi.
7. **Commit.** 24/24 commit của PR có `verified: true`, reason `valid`. Không có trailer ghi công AI; mô tả PR cũng không có câu ghi công. Diff không chạm `docs/`, `apps/knowledge`, `apps/agent-core`. `pnpm-lock.yaml` so với `main` chỉ đổi importer `apps/gateway` (12 dòng). Không có `.only`, `.skip`, `.todo`, `console.log`, `debugger` trong `apps/gateway`.
8. **Chân giấy phép** của `report.md`, `self-qc.md`, `implement.md` là bản rút gọn, thiếu câu “Sole decision-maker …”, khác khung `PID-Template`. `add-license --check` vẫn đạt; `PID-00018`, `PID-00034` trên `main` cũng dùng bản này. Không tính G.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00014-AC01 | Đạt ở mức Xây, với quyền database thật | Testcontainers PostgreSQL 16 + pgvector; migrate bằng migrator, service bằng `_app`; Fastify thật qua `inject`, route thử dưới `/api/v1`; chưa có staging | `src/session/session.spec.ts › hết hạn sau 12 giờ không hoạt động (PID-00014-AC01)` | Đạt. Quá 12 giờ thì 401 `unauthenticated` và `last_seen_at` không đổi. 11 giờ thì POST trả 201, hạn idle = lúc gọi + 12 giờ. Bỏ `owner_lookup` thì test lỗi (M1, M4), nên test chạy trên quyền thật |
| PID-00014-AC02 | Đạt ở mức Xây, với quyền database thật | như trên | `session.spec.ts › lệnh ghi thiếu CSRF bị từ chối (PID-00014-AC02), có token đúng đi qua` | Đạt. POST, PUT, PATCH, DELETE thiếu token: 403 `forbidden` problem+json, handler không chạy, phiên không được gia hạn. Có token đúng thì đi tiếp |
| NFR-AUTH-001-AC01 (phần gateway) | Đạt ở mức Xây | như trên | `session.spec.ts › không có phiên (NFR-AUTH-001-AC01, EC02)` | Đạt: 401, không có dữ liệu. Quét toàn bộ endpoint thuộc PID-00039 |

Edge case: EC01–EC17 đều có test và đạt. EC03–EC06 nay chạy với `find_session` thuộc owner thật, không còn hàm thuộc superuser như Lần 2. EC13 chạy bằng superuser ở container chưa có vai trò; điều này hợp lý vì chưa có vai trò thì cũng chưa có migrator. EC16 chạy bằng `_app` thật. Slice: S01–S05 đạt ở mức Xây. Mục Xong khi “chạy được trong cụm” của S01 nay chỉ còn phụ thuộc môi trường (Terraform, secret của PID-00035), không còn chờ DDL.

### Lệnh đã chạy

Máy PO, Windows 11, Node 24, pnpm 10. Docker Engine 29.8.2 trong WSL Ubuntu-24.04 (`DOCKER_HOST` cổng 2375). Container PostgreSQL riêng của QC dùng `pgvector/pgvector:pg16`, Helm dùng `alpine/helm:3.19.0`; cả hai image đã có, không pull mới. Container đã xóa sau khi kiểm.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (37 giây) |
| `pnpm nx run-many -t lint typecheck build test -p @sires/gateway --skip-nx-cache` | Đạt cả bốn target và 4 tác vụ phụ thuộc. Test **35/35**, 5 file (30 giây) |
| `pnpm exec vitest run --reporter=verbose` trong `apps/gateway` | 35/35: `migration.spec.ts` 5/5 (gồm `DBQ-10 / G2`, EC13, EC16), `session.spec.ts` 22/22, `session.guard.spec.ts` 3/3, `app.module.spec.ts` 1/1, SPK-02 4/4. Không có test skip hay todo |
| Thử đột biến M0–M10 (mục trên) | Như bảng Thử đột biến. Worktree sạch sau mỗi lần |
| `diff` `0000_init.sql` với `00-common.sql` + `gateway.sql` của `origin/main` (bỏ 3 dòng giấy phép mỗi file) | Chỉ khác khối chú thích đầu, tiêu đề phần, `--> statement-breakpoint` |
| Dựng vai trò theo 3.2; `node dist/migrate.js` hai lần bằng migrator; `psql` dựng database tham chiếu bằng migrator; `pg_dump --schema-only` đầy đủ; gọi `find_session` bằng `_app`, `_system` đăng nhập thật; kiểm owner, migrator, vai trò lạ | Như ghi nhận 1–2: schema giống hệt sau khi bỏ `\r`; `_app` và `_system` tra được phiên; `_app` đọc thẳng thấy 0 dòng; owner chỉ đọc |
| `PORT=… node dist/main.js` (không biến khác; chỉ có DSN; DSN thử cộng khóa ngẫu nhiên như smoke) | Exit 1 `DATABASE_URL is required…`; exit 1 `GATEWAY_CSRF_KEY must contain…`; `/health` 200, log không có DSN hay khóa |
| `bash -n infra/ci/check-helm-images.sh` | Đạt |
| `helm template` (image `alpine/helm:3.19.0`) chart chung với `apps/gateway/deploy/values.yaml` | Render đạt; Job migration chạy `node dist/migrate.js` |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --exclude=agent-core,knowledge,sires-common,eval --parallel=2 --skip-nx-cache` (16 project TS, do lockfile; 4 project Python không chạy, xem dòng Python) | Exit 1 sau 7 phút 20 giây. Chạy 63 tác vụ, 62 đạt. Test đạt hết ở gateway 35, platform 174, testing 16, sample-service 14, workspace 27, planning 41, orchestration 25, research 46, audit 35, library 46, manuscript 23, identity 20, sandbox-runner 1, web 10. Tác vụ lỗi duy nhất là `@sires/contracts:test`, 13/14: ca Python EC06 cần `openapi-python-client`, bị Smart App Control chặn (`os error 4551`). PR không sửa `libs/ts/contracts`; CI Linux đạt. QC coi đây là giới hạn môi trường, không tính cho PR |
| `node scripts/development/check-tracks.mjs --base origin/main` | Exit 0, cảnh báo `PR touches 2 tracks (gateway, infra); rule 1.4.1 expects one` (G8). `pnpm-lock.yaml`, `agent/execution/PID-00014/` tính là `repo` |
| `git diff --stat origin/main...HEAD` | 30 file: `apps/gateway/` (24), `agent/execution/PID-00014/` (4), `pnpm-lock.yaml`, `infra/ci/check-helm-images.sh`. `git diff --check` đạt |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu, cả trước và sau khi thêm mục Lần 3 này |
| `node scripts/docs/update-index.mjs --check` | Đạt: 159 PID, 15 đợt; taskboard khớp |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00014 --result` | KẾT QUẢ ĐỦ (0 cảnh báo), trạng thái “Bị chặn — G8: chờ PO quyết …” |
| `gh api repos/toilatrung/sires/pulls/63/commits` | 24/24 `verified: true`, reason `valid`; không có trailer ghi công AI |
| `gh pr checks 63` (bằng chứng phụ, run 45642767821 trên `316fd63`) | Mọi job đạt: `typescript`, `python`, `contracts`, `contract-test`, `asyncapi-payload`, 12 image, `helm` (`OK gateway: /health 200, PID 1 non-root`), `terraform`, `dependencies`, `secrets`, `docs`, `tracks`, `build`. Log job `typescript` có gateway 35/35. Nx lấy 59/63 tác vụ từ cache. Run 45641867310 trên `4980f6f` (cùng mã gateway) đã chạy mới gateway test |
| Python (`knowledge`, `agent-core`, `sires_common`, `eval`) | Không chạy: PR không sửa các project này (diff trống); Smart App Control chặn công cụ Python trên máy này. CI `python` đạt |

### Lệch với Self-QC

- `self-qc.md` Lần 10 ghi một LOW: “Trên checkout Windows (`core.autocrlf=true`), phép so schema chỉ đạt vì migration và DDL cùng CRLF trong thân hàm”. QC thấy không đúng. `normalizeDump` thay `\r\n` bằng `\n` trước khi so (`database.testkit.ts:120`). Đổi riêng migration sang LF (M0) thì test vẫn đạt. Phần đúng của ghi chú: database migrate từ checkout Windows lưu `\r` trong thân hàm (ghi nhận 5).
- `self-qc.md` Lần 10 ghi bỏ `owner_lookup` thì “15 lỗi / 35”, và fixture HTTP “đã chạy bằng quyền thật”. QC xác nhận cả hai (M1). Nhưng fixture không tự kiểm điều đó, và hồi quy sang superuser không bị test HTTP phát hiện (M5, M6, G11).
- Về gateway, các kết quả còn lại của QC khớp lời khai: 35/35 test; lint, typecheck, build đạt; CI đạt trên đầu nhánh.

### Việc còn lại, theo thứ tự phụ thuộc

1. PO chốt G8 ở phiếu chốt cuối PH-01: (a) giữ trong #63, hoặc (b) tách PR luồng infra merge trước. Chọn (a): Dev ghi nguyên văn lời PO vào `report.md` mục 5, đặt `Xong — chờ QC`; `@congminh1705` duyệt `/infra/` hoặc PO bypass. Chọn (b): Dev bỏ file khỏi #63 sau khi PR infra đã merge, rồi chờ CI `helm`, `build` đạt.
2. Khi merge: PO duyệt hoặc bypass với vai code owner `/apps/gateway/` (`@T1xNTH`).
3. Không chặn merge: Dev thêm kiểm vai trò cho fixture HTTP (G11), trong PR này hoặc PR sau của luồng gateway.

### Đề xuất cho PO

- **G8.** Về kỹ thuật, bản sửa cần và đúng; QC không thấy lý do kỹ thuật để tách. Tách chỉ để giữ quy tắc 1.4.1 và quyền duyệt của chủ luồng infra. Đây là việc PO quyết.
- **Sau khi merge, cập nhật hồ sơ (`docs/`, PO ghi).** Trang ticket PID-00014 mục 3 vẫn ghi “DBQ-10 chặn merge PR #63 (H7)”. Mục 5 “Còn mở” vẫn ghi DBQ-10 và “G4 … chờ PO xác nhận”. Database 13.3, dòng DBQ-10 ghi “PR #63 vẫn chờ DDL và test sửa theo”. Cả ba đã cũ.
- **DBD-14, câu “không cấp owner cho vai trò khác”.** Theo 3.2, `sires_<svc>_migrator` là thành viên owner, nên đọc được mọi dòng `app.session` qua `owner_lookup`; QC đã thử (ghi nhận 2). Điều này hợp với thiết kế vì DSN migrator chỉ cấp cho Job migration. Nên ghi rõ ngoại lệ “trừ migrator” trong DBD-14, để Terraform và PID-00159 không hiểu sai.
- **DDL.** PUBLIC vẫn có EXECUTE trên `app.find_session`; thực tế chỉ bị giới hạn nhờ quyền `USAGE` trên schema `app`. Đề xuất ở Lần 2 vẫn còn: thêm `REVOKE ALL ON FUNCTION app.find_session(bytea) FROM PUBLIC` vào `gateway.sql` (tương tự `find_account_by_identity` ở `identity.sql`), rồi đưa vào migration mới của mỗi service.
- **Ghi chú:** job dọn `app.session` hết hạn (N5) vẫn chưa có PID nhận.

## Lần 4 — 27/11/2026 · spec-converge-skill

Người chạy: phiên QC do PO `toilatrung` giao, không mang kết luận của Dev. Mã nguồn: PR #63, nhánh `gateway/pid-00014-session`, đầu nhánh `d43618d` (`d43618d574142b1d2f12c53eea6f79555ec27af0`), kiểm trong worktree tách riêng. Gốc: `origin/main` = `c9e745b`, cũng là merge-base. Trước lần này, đầu nhánh là `f3319e5` (qc-report Lần 3), chưa cập nhật với `main` (thiếu #109, #110, #111).

Theo chỉ đạo của phiên điều phối, phiên QC thêm hai commit vào nhánh (không ai đẩy lên nhánh này từ 25/11/2026; không force-push):

| Commit | Nội dung |
| --- | --- |
| `7b29d7c` | Merge `origin/main` `c9e745b` (#109–#111, chỉ `docs/`), không xung đột |
| `d43618d` | `report.md`: dòng trạng thái thành `Xong — chờ QC`; mục 1, 4, 6; YC4 ở mục 5 ghi nguyên văn ủy quyền của PO và quyết định PC-05 P32; thêm Lần 11. `self-qc.md`: dòng Kết luận thành `Đạt` (để `check-pid` không báo lỗi “report.md báo Xong nhưng self-qc.md kết luận Chưa đạt”), thêm Lần 11 theo PC-05 P37. Không đổi mã |

Hai commit này do phía PO làm, không phải Dev; phần QC dưới đây vẫn đánh giá trạng thái mã như mọi lần.

Đã đối chiếu: PC-05 P32, P44 (`docs/overview/phieu-chot-cuoi-ph01.html`); việc còn lại của Lần 3; `report.md`, `self-qc.md` Lần 11; diff của PR so với `origin/main` (30 file: `apps/gateway/` 24, `agent/execution/PID-00014/` 4, `pnpm-lock.yaml`, `infra/ci/check-helm-images.sh`, như Lần 3).

### Kiểm lại việc còn lại của Lần 3

| G Lần 3 | Kết quả Lần 4 | Bằng chứng |
| --- | --- | --- |
| G8 HIGH: sửa `infra/ci/check-helm-images.sh` chờ PO | Đã xử lý | PC-05 P32 chốt theo đề xuất (PO ủy quyền 26/11/2026), phương án 1: giữ trong PR #63. `report.md` mục 5 YC4 ghi nguyên văn ủy quyền; YC2 nay có lời đồng ý. Nội dung bản sửa không đổi so với Lần 3 (`git diff 316fd63 d43618d -- infra/` trống), đánh giá “cần và đúng” của Lần 3 giữ nguyên. CI run 45868301935 trên `d43618d`: job `helm` in `OK gateway: /health 200, PID 1 non-root`, `OK Helm gateway` |
| G11 LOW: fixture HTTP không tự kiểm vai trò thật | Còn mở, không chặn | PC-05 P44: PR nhỏ sau khi #63 merge. `report.md` mục 4, 6 ghi đúng |
| Merge: code owner `/apps/gateway/` (`@T1xNTH`), `/infra/` (`@congminh1705`) | Việc của người merge | PO bypass hoặc code owner duyệt |

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G11 | H7, DBD-14 (“test chạy bằng vai trò thật”) | partial | LOW | Như Lần 3: `apps/gateway/src/db/database.testkit.ts:142` | PR sau merge theo PC-05 P44 (luồng gateway): kiểm owner của `app.find_session` và vai trò service không SUPERUSER/BYPASSRLS trong fixture HTTP |

Không có CRITICAL, HIGH, MEDIUM. Không có G mới.

### AC

Mã gateway không đổi so với Lần 3 (`git diff --stat 316fd63 d43618d -- . ':!docs' ':!agent/execution/PID-00014'` chỉ có `agent/execution/taskboard.html`, đến từ `main`). Kết luận AC của Lần 3 giữ nguyên: PID-00014-AC01, AC02, NFR-AUTH-001-AC01 (phần gateway) và EC01–EC17 đạt ở mức Xây với quyền database thật; chưa có staging. CI trên đầu nhánh mới chạy lại test gateway, không lấy cache: 35/35.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `git merge origin/main` (từ `f3319e5`) | Không xung đột; 15 file `docs/` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00014 --result` | Trước khi sửa `self-qc.md`: 1 lỗi (“report.md báo Xong nhưng self-qc.md kết luận Chưa đạt …”); sau: KẾT QUẢ ĐỦ (0 cảnh báo) |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu |
| `node scripts/docs/update-index.mjs --check` | Khớp: 159 PID, taskboard, `docs/index.html` |
| `git diff --check` | Đạt |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: gateway, infra, repo`, cảnh báo 2 luồng: đúng như P32 chấp nhận |
| Thử gộp cả 7 nhánh đang mở (#113–#118, #63) lên `main` | Không xung đột |
| `pnpm nx run-many -t lint typecheck -p @sires/gateway …` trên cây gộp | Đạt |
| `gh api repos/toilatrung/sires/pulls/63/commits` | 27/27 `verified: true`; không có dòng ghi công AI trong commit hay mô tả PR |
| Quét key, host của cổng trung gian (giá trị lấy từ file key của máy, chỉ đếm) trong `git log -p` của nhánh, mô tả và comment PR | 0 |
| `gh pr checks 63` (run 45868301935 trên `d43618d`) | 25/25 đạt, gồm `typescript` (gateway test chạy mới, 35/35), `helm`, `python`, `contracts`, `secrets`, `tracks`, `build` bắt buộc |

### Lệch với Self-QC

Không có. `self-qc.md` Lần 11 do phiên QC viết theo chỉ đạo của điều phối, chỉ ghi quyết định G8 và lệnh hồ sơ; không có kết luận mã mới.

### Việc còn lại, theo thứ tự phụ thuộc

1. Phiên điều phối merge (PO bypass, hoặc `@T1xNTH` duyệt `/apps/gateway/`, `@congminh1705` duyệt `/infra/`). Nếu `main` đổi trước khi merge: gộp `main` lại, chờ CI.
2. Sau merge: chép mục Lần 4 này vào `qc-report.md` (PR sau, hoặc cùng PR G11); PR G11 theo P44 (luồng gateway).
3. PO cập nhật hồ sơ `docs/` như Lần 3 đã đề xuất: trang ticket PID-00014 mục 3, mục 5 “Còn mở” (DBQ-10, G4), database 13.3 dòng DBQ-10; đóng issue #83 khi #63 merge.

### Đề xuất cho PO

- Các đề xuất của Lần 3 còn nguyên: ngoại lệ migrator trong DBD-14 (PC-05 P42), `REVOKE ALL ON FUNCTION app.find_session(bytea) FROM PUBLIC`, PID cho job dọn `app.session` (PC-05 P43).
- Nhánh `gateway/pid-00014-session` cục bộ ở checkout chính còn trỏ `316fd63` (cũ, không worktree nào dùng). Không ảnh hưởng; ai làm tiếp trên máy này nên tạo lại từ `origin`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
