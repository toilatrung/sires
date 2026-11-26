# PID-00006 — Báo cáo QC độc lập

**Kết luận mới nhất:** Merge được PR #116 — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 4 LOW (Lần 4, 27/11/2026). G9 đóng theo PC-05 P38: bỏ 14 timeout tại chỗ thấp hơn và 3 timeout bằng `TESTCONTAINERS_TIMEOUTS` ở `@sires/platform`, `@sires/sample-service`; thêm test chặn tái phát (đọc AST), đột biến thêm lại `{ timeout: 30_000 }` thì đỏ. Còn G5, G6, G10 (như trước) và G12 mới (test chặn chép nguyên ở hai project), đều LOW.

- **Ticket:** [PID-00006](../../../docs/tickets/issues/PID-00006/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 22/11/2026 · spec-converge-skill

Người chạy: QC độc lập do phiên PO giao (không mang kết luận của Dev). Mã nguồn: nhánh `platform/pid-00006-sample-service`, commit `a619e512fcf035f1928f324a9a54418babb178a0` (PR #62, tác giả GitHub `Vietanhhhhhh2003`), base so sánh `origin/main` `8275263`. Phạm vi đọc: `docs/tickets/issues/PID-00006/` (index, `specs/` brief, scope, acceptance, index, bảy slice S01–S07, `designs/notes.html`), quy tắc 1.4 (`docs/tickets/sections/01-tracks-and-boundaries.html`, gồm 1.4.7, 1.4.13), `docs/database/ddl/` (12 file), `docs/api-design/events/asyncapi.yaml` (`task.activated`), toàn bộ `libs/ts/sample-service/`, phần `libs/ts/platform/src` mà mẫu gọi (`outbox`, `inbox/consumer.ts`, `service-auth`), `nx.json`, `eslint.config.mjs`, diff `pnpm-lock.yaml`, mọi file Dev ghi trong `agent/execution/PID-00006/` (kể cả `spk10/`, script và stdout), lịch sử commit và PR #62 trên GitHub.

Rà nguyên tắc: không có agent, APR hay gọi model; mẫu chỉ import API công khai của `@sires/platform` (bản build `dist`) và `@sires/testing`, không import service khác (luật `@nx/enforce-module-boundaries` đạt); trạng thái, sự kiện domain và Audit Event ghi qua `writeEvent`/`emitAudit` trong cùng `withAccountTransaction` (`sample.service.ts:23-38`), không tự ghi bảng outbox; consumer dùng `EventConsumer` công khai, inbox do platform ghi cùng giao dịch (`sample.service.ts:43-57`); bảng mẫu bật và ép RLS bằng `app.enable_tenant_rls()`, cấp quyền bằng `app.grant_standard('sample')` (`migrations/0000_init.sql:326-327`); migration không tạo vai trò; lỗi lệnh migrate không in DSN (`migrations.ts:33-36`). Phần chung của migration chép nguyên văn `00-common.sql` (QC so từng dòng: chỉ khác phần ghi chú giấy phép đầu file và một dòng trống trước `--> statement-breakpoint`). Diff PR so `main` chỉ có `libs/ts/sample-service/`, `agent/execution/PID-00006/` và `pnpm-lock.yaml`; lockfile chỉ thêm importer `libs/ts/sample-service` (49 dòng, không đổi phiên bản gói nào), hợp quy tắc 1.4.7; `pnpm-workspace.yaml` không đổi. Evidence không có secret, đường dẫn máy hay tên máy (chuỗi `hostname` trong `validation-offline.txt` là mã container, `runnerName` trong JSON là tên runner GitHub-hosted). Không có file ngoài luồng `platform` ngoài lockfile.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | B3, S07, EC11, H1, H5; brief “Thuật ngữ” (“PR chạm một service NestJS” = PR mà `nx affected` chỉ chọn một project service) | partial | MEDIUM | `report.md:66-73`, `report.md:174-176`; `spk10/README.md:28-30`. QC chạy lại `nx show projects --affected --base=origin/main --head=HEAD`: 20 project, bằng đúng tổng số project của workspace (20), nguyên nhân là `pnpm-lock.yaml` (`nx affected --files=libs/ts/sample-service/package.json` chỉ chọn `@sires/sample-service`). Dev đã ghi danh sách, không đổi PR hay cách đo (đúng EC11), nhưng “báo PO trước khi kết luận” chỉ có lời khai “đã báo trong chat” của phiên Dev; PR #62 không có comment hay review của PO, hồ sơ không có quyết định | PO quyết EC11: (a) nhận năm số đo này làm kết quả SPK-10 với ghi chú “PR chọn toàn bộ 20 project, là cận trên của PR một service”, hoặc (b) yêu cầu đo thêm trên một PR chỉ chạm `libs/ts/sample-service/src` (không chạm lockfile) sau khi merge. Không phải việc của Dev tới khi PO chọn (b) |
| G2 | Spec mục 2.3 (“Không dùng hợp đồng hay bảng của service thật”), mục 4.3; ticket mục 7 (gặp điều spec không nói tới → “Cần PO”); hợp đồng `asyncapi.yaml` `taskActivated` | contradicts | MEDIUM | `libs/ts/sample-service/src/sample.service.ts:15`, `:28-31` ghi sự kiện `type: 'task.activated'` với `producer: 'planning'`, `aggregate.type = 'sample_record'`, `data: { taskId }`; hợp đồng yêu cầu `data` có `taskId, activationId, planVersionId, executionLabel` (`docs/api-design/events/asyncapi.yaml:763`) và là sự kiện orchestration dùng để tạo workflow. Test dựng cùng vỏ này (`sample.spec.ts:80-83`). Danh tính `planning` là bắt buộc vì `producer` và service-auth chỉ nhận `ServiceName` (`libs/ts/platform/src/outbox/envelope.ts:93`, `service-auth/guard.ts:21`), nhưng `type` chỉ cần khớp mẫu chữ (`envelope.ts:86`), nên dùng một `type` riêng của mẫu là làm được. Dev tự quyết, ghi `implement.md:46-48` và README `:27-30`, không ghi “Cần PO” | PO chọn: giữ như hiện có (mẫu không deploy, README đã cảnh báo) hoặc yêu cầu Dev đổi sang `type` riêng của mẫu (ví dụ `sample_record.activated`, routing key và consumer theo) để mẫu không ghi vào outbox một sự kiện lệch hợp đồng thật; danh tính `planning` giữ, ghi rõ là bắt buộc do `ServiceName` |
| G3 | PID-00006-AC04, EC10 (“S05 chưa xong tới khi PO sửa docs/database/ddl/” — tức phải chạy lại test sau khi sửa DDL), O4 | partial | MEDIUM | `libs/ts/sample-service/src/ddl-pg16.spec.ts:12` đọc `docs/database/ddl/` ngoài thư mục project; target `test` dùng input mặc định (`nx.json:6-9`, `:48-53`: `{projectRoot}/**/*` + `sharedGlobals`), `package.json:35-38` không khai thêm `inputs`; `nx show project @sires/sample-service` xác nhận target `test` không có `inputs` riêng. Hệ quả (suy từ cấu hình Nx, QC không sửa DDL để thử): sửa một file DDL không làm `@sires/sample-service` thành affected trong CI và không làm mất cache cục bộ, nên `pnpm nx run @sires/sample-service:test` có thể trả kết quả đạt cũ mà không chạy lại AC04 | Thêm vào `package.json` của project `nx.targets.test.inputs` gồm `default`, `^production` và `{workspaceRoot}/docs/database/ddl/**/*`; kiểm bằng `nx show project @sires/sample-service` |
| G4 | Quy trình: sổ `task-registry` giao PID-00006 cho `T1xNTH` (`agent/execution/taskboard.html`, cả `main` và nhánh); DEC-58 phân công theo luồng (`platform` thuộc `T1xNTH`) | quy trình | MEDIUM | Mọi commit của PR #62 do `Vietanhhhhhh2003` làm tác giả; `report.md`, `self-qc.md`, hồ sơ ticket, `docs/docs_context.md` và PR #62 không có lời PO giao lại PID-00006 (lời “Người dùng yêu cầu ‘triển khai nốt’” ở `report.md:106` là của phiên Dev, không nêu PO). Tiền lệ có ghi rõ: PID-00158 “PO giao một phiên làm thay T1xNTH” | PO xác nhận giao lại (và đổi `assignee` trong sổ nếu muốn) hoặc yêu cầu `T1xNTH` nhận PR trước khi merge |
| G5 | NFR-MAINT-004-AC01, EC06 | partial | LOW | `linux-qc.sh:36-48` chặn mạng ra trong namespace của container chạy test; Docker daemon và container PostgreSQL vẫn có mạng, nên bằng chứng không loại trừ được việc Testcontainers kéo image trong lúc chạy (image đã chuẩn bị trước ở bước `prepare`, `validation-offline.txt` không có dòng kéo image). Lần chạy là trước khi merge `main` vào `d900765`; QC kiểm `libs/ts/platform`, `libs/ts/testing` không đổi trong khoảng `ae1ac60..281a022`, nên bằng chứng vẫn áp được | Không chặn. Nếu PO muốn chặt hơn: ghi thêm danh sách image có sẵn trước lần chạy và log Testcontainers trong `validation-offline.txt` |
| G6 | S01 (README đủ để luồng khác chép), kiến trúc 6.10 (custom migration) | partial | LOW | `libs/ts/sample-service/drizzle.config.ts:7` trỏ `schema: './src/schema.ts'`, còn `migrations/meta/0000_snapshot.json:6-8` rỗng (`tables: {}`, `schemas: {}`) vì migration đầu là custom SQL. Suy từ cơ chế snapshot của drizzle-kit (QC không chạy `generate` để không ghi file): `drizzle-kit generate` không có `--custom` sẽ sinh lại `CREATE TABLE app.sample_record`. README `:42-46` chỉ dạy lệnh `--custom`, không cảnh báo điều này | Thêm một câu cảnh báo trong README: chỉ dùng `generate --custom`; hoặc ghi lý do giữ `schema` trong `drizzle.config.ts` |
| G7 | Báo cáo của Dev (kết quả thật, ghi đúng) | partial | LOW | `self-qc.md:25` dẫn log cục bộ `.nx/pid00006-affected.log` không có trong repo; `self-qc.md:55` bảng EC Lần 1 vẫn ghi EC07 “Chưa xử lý — S07” dù Lần 2 đã đóng (`self-qc.md:125-131`); `report.md:19` câu “Worktree `.nx/pid00006` giữ nguyên workspace PID-00034” không rõ nghĩa với PID này | Không chặn. Dev sửa khi chạy lần sau: bỏ dẫn log không commit hoặc ghi rõ là cục bộ, cập nhật dòng EC07, bỏ câu không liên quan |

Không có CRITICAL, HIGH.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00006-AC01 | đạt | stub (PostgreSQL 16 + pgvector thật của Testcontainers, schema dựng bằng migration mẫu) | `sample.spec.ts › trạng thái, Audit Event và outbox cùng một giao dịch (PID-00006-AC01)`; `› lỗi giữa giao dịch không để lại dòng nào (EC01)` | QC chạy: đạt. Test so `xmin` của dòng trạng thái và hai dòng outbox (`kind = audit`, `audit.recorded`; `kind = event`, có aggregate); EC01 gây lỗi bằng constraint trigger deferred lúc COMMIT, sau cả ba lần ghi: trạng thái giữ `Created`/1, outbox rỗng |
| PID-00006-AC02 | đạt | stub (FakeBroker gửi trùng vào `EventConsumer.handle` thật, inbox trên PostgreSQL thật) | `sample.spec.ts › inbox › sự kiện trùng tác động đúng một lần (PID-00006-AC02)`; `› sự kiện trùng đến sau (EC02)`; `› sự kiện trùng xử lý đồng thời (EC03)` | QC chạy: đạt; `effects = 1`, `app.inbox` đúng một dòng `(sample-service, event_id)`, kết quả `applied`/`duplicate`. Xem G2 về vỏ sự kiện |
| PID-00006-AC03 | đạt | stub | `sample.spec.ts › RLS chặn đọc chéo tài khoản (PID-00006-AC03)`; `› thiếu ngữ cảnh tenant thấy 0 dòng (EC04)`; `› ghi chéo tài khoản bị từ chối (EC05)` | QC chạy: đạt; kiểm vai trò đang dùng là `sires_sample_app`, không superuser, không BYPASSRLS; INSERT chéo trả SQLSTATE 42501, UPDATE chéo 0 dòng |
| PID-00006-AC04 | đạt (lần chạy hiện tại); xem G3 về chạy lại | stub (Testcontainers) | `ddl-pg16.spec.ts › dựng 11 database từ DDL tham chiếu (PID-00006-AC04)` | QC chạy: đạt trên PostgreSQL 16.15, pgvector 0.8.7 (image `pgvector/pgvector:pg16` có sẵn trên máy QC; Dev ghi 16.16 — tag image trôi theo bản vá, không ảnh hưởng AC). 11 database, mỗi database `00-common.sql` rồi file service; knowledge có `vector(1536)` và index HNSW. Test kiểm đủ đúng 12 file trong thư mục DDL |
| PID-00006-AC05 | đạt | stub (HTTP Fastify thật qua `createServiceApp`) | `sample.spec.ts › endpoint nội bộ kiểm token nội bộ (PID-00006-AC05)` | QC chạy: đạt; token hợp lệ của `workspace` (bên gọi khai bằng `@InternalCallers`) → 200; thiếu header, hết hạn, sai chữ ký → 401 `application/problem+json`, `code = invalid_service_token`; handler không chạy thêm |
| NFR-MAINT-004-AC01 (phần ticket) | đạt theo bằng chứng của Dev, QC không tái lập | thao tác tay | Cả 13 test trong container chặn mạng ra (`linux-qc.sh offline`) | Không chạy — cần dựng image từ `node:22-bookworm-slim` và cài `iptables` qua mạng, ngoài danh sách image của test. Bằng chứng phụ: `validation-offline.txt` (13/13 đạt, kiểm kết nối Internet bị chặn trước test). Xem G5 |

Output: O1 `libs/ts/sample-service/` (package `@sires/sample-service`, private, tag `type:lib`, `lang:ts`, `scope:platform`, không project nào phụ thuộc — `nx affected --files=libs/ts/sample-service/package.json` chỉ chọn chính nó), O2 `src/sample.spec.ts`, O3 `migrations/` (custom SQL `0000_init.sql`, `meta/_journal.json`, `meta/0000_snapshot.json`) và `src/migration.spec.ts`, O4 `src/ddl-pg16.spec.ts`, báo cáo SPK-10 trong `report.md` — đều đúng tên và đường dẫn của ticket mục 1 “Đầu ra” và spec mục 3 (quy tắc 1.4.13). README theo S01, S06 có đủ cách thêm migration, chạy target `migrate`, ai tạo vai trò, cách gắn guard.

Edge case: EC01–EC05, EC08, EC09 có test đúng tên trong `scope.html`, QC chạy đạt; EC06 xem NFR ở trên; EC07 không phát sinh (năm lần đều dưới 600 giây); EC10 không phát sinh (12 file đều chạy, lỗi được bọc kèm service, file, dòng và đoạn SQL ở `ddl-pg16.spec.ts:17-28`; xem G3); EC11 xem G1.

Bước: B1, B2, B4, B5, B6 kiểm bằng `pnpm nx run @sires/sample-service:test` (đạt); B4 thêm target Nx `migrate` chạy thật (xem Lệnh đã chạy); B3 kiểm bằng báo cáo — QC tính lại từ dữ liệu thô và đối chiếu GitHub (dưới đây).

SPK-10, tính lại: `gh api …/actions/runs/44929131563/attempts/1..5` cho cùng SHA `d900765`, sự kiện `pull_request` của PR #62, workflow `.github/workflows/ci.yml` (blob `a618df9…` giống `main`), cả năm `success`; hiệu `updated_at − run_started_at` là 186 / 203 / 143 / 177 / 204 giây, khớp `run_duration_ms` trong JSON 185 / 203 / 143 / 177 / 203 giây (lệch tối đa 1 giây do độ phân giải). Job `build` 183 / 199 / 138 / 172 / 199 giây, `tracks` 5 / 11 / 6 / 6 / 6 giây; trong `build`: `pnpm install` 4 / 3 / 2 / 4 / 3, `uv sync` 2 / 3 / 2 / 2 / 3, `nx affected` 163 / 171 / 117 / 153 / 174 giây — khớp bảng `report.md:166-170`; QC so job attempt 1 và 5 với API, khớp từng giây. Log attempt 5: “Successfully ran targets lint, typecheck, test, build for 20 projects and 2 tasks they depend on”, `@sires/platform` 167/167, `@sires/sample-service` 13/13. Bộ khảo sát run `44927856447` (SHA `a1ab738`) khớp 200 / 153 / 139 / 144 / 160 giây, kết quả failure / success / success / failure / failure như Dev ghi, và được tách khỏi kết luận. `nx.json` giữ `neverConnectToCloud: true`. Kết luận số: chậm nhất 203 giây, cả năm dưới 600 giây; phạm vi đo xem G1.

### Lệnh đã chạy

Môi trường QC: worktree tách riêng tại đầu nhánh `a619e51`, Windows, Node 24.21.0, pnpm 10.34.9, Docker Engine 29.8.2 trong WSL. Không kéo image mới: `pgvector/pgvector:pg16`, `testcontainers/ryuk` đã có trên máy.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (lockfile khớp) |
| `pnpm nx run @sires/sample-service:test --skip-nx-cache` | Đạt: 3 file, 13 test; Nx chạy thêm 4 tác vụ build phụ thuộc. `vitest run --reporter=verbose` liệt kê đủ 13 tên test như bảng AC |
| `pnpm nx run-many -p @sires/sample-service -t lint typecheck build --skip-nx-cache` | Đạt |
| `node agent/execution/PID-00006/check-migrate.cjs` | Đạt: target Nx `migrate` (phụ thuộc `build`, `cache: false`) chạy hai lần mã 0, “journal vẫn đúng một migration” |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --head=HEAD` | Không đạt toàn bộ trên máy QC, lỗi đều ngoài mã của PR: (1) mọi tác vụ Python (`sires-common`, `agent-core`, `knowledge` lint, typecheck, test; `eval:test`) không chạy — Application Control của máy chặn `pytest`, `mypy`, `ruff` trong `.venv`; (2) `@sires/platform:test` 166/167 (một test HTTP của telemetry quá hạn 5 giây khi chạy song song); (3) `@sires/orchestration:test` một hook quá hạn 10 giây khi chạy song song. Phần của PR: `@sires/sample-service` lint, typecheck, build, test (13/13) đạt trong cùng lượt. Chạy lại riêng từng project (`--parallel=1`): orchestration 21/21 đạt (4 todo); platform 165/167 (telemetry và một test `errors.spec.ts` “fetch failed”) — PR không đổi file nào trong `libs/ts/platform`, nên lỗi này có sẵn trên mã của `main` khi chạy trên Windows. Bằng chứng phụ: CI Linux run `44929131563` attempt 5 đạt cả 20 project, platform 167/167; check-run `build` trên đầu nhánh `a619e51` success |
| `nx show projects --affected --base=origin/main --head=HEAD` | 20 project (toàn bộ workspace) — G1 |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: infra, repo`, exit 0. `infra` do `pnpm-lock.yaml`; `libs/ts/sample-service/` tính là `repo` vì script chưa gắn vào luồng `platform` (N13, việc của PO); không có cảnh báo nhiều luồng |
| `node scripts/docs/add-license.mjs --check` | Trước `nx affected`: “0 file chưa có thông báo giấy phép.” Sau `nx affected` và sau khi thêm file này: 4 file thiếu, đều là `.pytest_cache/` do lượt chạy cục bộ sinh ra (bị `.gitignore:37` bỏ qua, không commit); `qc-report.md` có ghi chú giấy phép |
| `node scripts/docs/update-index.mjs --check` | Đạt: 159 PID, issues và taskboard khớp, `docs/index.html` khớp |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00006 --result` | “PID-00006: KẾT QUẢ ĐỦ (0 cảnh báo).” |
| `gh api repos/toilatrung/sires/pulls/62/commits` | 8 commit, tất cả `verification.verified = true`, `reason = valid`; thông điệp tiếng Việt không hỏng dấu, không có trailer ghi công AI; mô tả PR cũng không có |
| `gh api …/commits/a619e51…/check-runs` | `tracks` success, `build` success trên đầu nhánh |
| `git merge-tree --write-tree HEAD origin/main` | Sạch; nhánh đang sau `main` một commit (`8275263`, PID-00034, có sửa `pnpm-lock.yaml`) |

### Lệch với Self-QC

- `self-qc.md` mục 5 Lần 2 kết luận không còn khoảng trống ngoài N13. QC thấy thêm G2 (dùng hợp đồng `task.activated` thật trái spec 2.3, Dev tự quyết không ghi “Cần PO”), G3 (AC04 đọc DDL ngoài project mà không khai input Nx) và G6, G7.
- EC11: Dev coi là “lưu ý nghiệm thu” đã đóng phần Dev; QC ghi G1 vì chưa có bằng chứng PO đã nhận và quyết.
- `self-qc.md:25` (Lần 1) ghi `pnpm nx affected` cục bộ không đạt toàn bộ; lần chạy của QC cũng không đạt toàn bộ, nhưng mọi lỗi nằm ở project PR không chạm (Python bị Application Control chặn, test HTTP của platform và hook của orchestration quá hạn trên Windows). Kết luận “đạt toàn bộ 20 project” của Dev dựa trên CI, QC xác nhận bằng log CI attempt 5.

### Việc còn lại, theo thứ tự phụ thuộc

1. PO quyết G1 (EC11) và G4 (giao lại). Không có việc Dev cho tới khi PO chọn.
2. Nếu PO chọn sửa G2: Dev đổi `type` sự kiện mẫu sang loại riêng của mẫu, sửa consumer, test và README theo (G2, spec 2.3).
3. Dev khai `inputs` cho target `test` gồm `docs/database/ddl` (G3, PID-00006-AC04, EC10).
4. Dev bổ sung cảnh báo README về `generate --custom` (G6) và dọn các dòng báo cáo ở G7; G5 tùy PO.
5. Cập nhật nhánh theo `main` (`8275263`; lockfile chạy lại `pnpm install`, không sửa tay theo 1.4.7), để ruleset có `tracks`, `build` đạt trên nhánh đã cập nhật, rồi PO merge. Việc 2–4 sửa thì Dev ghi “Lần 2” trong `report.md` theo `spec-execution-skill`; đổi mã sau phép đo không làm mất giá trị số đo SPK-10 nếu chỉ chạm `libs/ts/sample-service/`, nhưng PO nên ghi SHA đã đo khi chép kết quả.

### Đề xuất cho PO

- SPK-10 (kiến trúc 12.2): năm lần 185 / 203 / 143 / 177 / 203 giây trên PR #62, SHA `d900765`, `ci.yml` blob `a618df9`, không Nx remote cache; PR chọn cả 20 project vì lockfile, nên đây là phép đo toàn repo — mọi PR thêm gói mới cũng sẽ như vậy, nên PID-00009 cần biết. Cách ghi theo G1.
- Database 12.4: 12 file DDL dựng xong 11 database trên PostgreSQL 16 (Dev 16.16, QC 16.15) + pgvector 0.8.7; knowledge có `vector(1536)`, HNSW. Không có DBQ.
- N13: gắn `libs/ts/sample-service` vào luồng `platform` ở bảng 1.4 và `scripts/development/check-tracks.mjs` (vẫn còn mở).
- PID-00001 H7 (“test trên bản build chuyển PID-00006”, `docs/docs_context.md` còn mở “ghi H7 vào hồ sơ PID-00006”) chưa có trong hồ sơ PID-00006, nên QC không đối chiếu. Trên thực tế test của mẫu dùng `@sires/platform` qua `dist` (package `exports` trỏ `dist/index.js`), tức đã chạy trên bản build cho các API mẫu dùng; PO quyết có cần ghi H7 vào hồ sơ không.

## Lần 2 — 22/11/2026 · ghi quyết định PO

Người chạy: phiên do PO giao; lần này chỉ ghi quyết định PO, không chạy lại các phép kiểm của Lần 1. Mã nguồn: nhánh `platform/pid-00006-sample-service` sau khi cập nhật theo `main` (`ab32bfb`, merge `main` `8275263`; không đổi mã của PR).

Quyết định PO: trả lời câu hỏi về G1, G2, G4 của Lần 1 bằng “Merge, ghi việc sau” (22/11/2026).

| G Lần 1 | Trạng thái | Quyết định PO |
| --- | --- | --- |
| G1 | Đóng | Nhận số đo SPK-10 khi PR chọn cả 20 project (do `pnpm-lock.yaml`) làm cận trên của EC11 |
| G2 | Chuyển việc sau | Dev đổi sự kiện mẫu sang `type` riêng của mẫu (không dùng `task.activated` của planning) ở PR tiếp theo |
| G3 | Còn mở (MEDIUM) | Nên sửa Nx `inputs` trước khi chép kết quả DDL vào database 12.4 |
| G4 | Đóng | Xác nhận `Vietanhhhhhh2003` làm thay `T1xNTH` cho PID-00006 |
| G5–G7 | Còn mở (LOW) | Không xử lý ở lần này |

## Lần 3 — 25/11/2026 · spec-converge-skill

Người chạy: QC độc lập do PO `toilatrung` giao (không mang kết luận của Dev, không sửa mã). Mã nguồn: PR #108 (tác giả `T1xNTH`), nhánh `platform/testcontainers-timeouts-g2`, commit `a61cf79a19bed86c8af4f4780bcebd2bfe02a210`; base `origin/main` `a367f0b`. PR có 2 commit, cả hai có chữ ký (`verified: true`): `f43344d` (PC-04 A6: `libs/ts/testing/` `src/vitest/timeouts.ts`, `timeouts.spec.ts`, `src/vitest/index.ts`, `src/index.ts`, `package.json` (đường dẫn con `./vitest`), `vitest.config.ts`; `libs/ts/platform/vitest.config.ts`; `libs/ts/sample-service/vitest.config.ts`) và `a61cf79` (G2: `sample.service.ts`, `sample.spec.ts`, `index.ts`, `package.json`, `README.md` của `libs/ts/sample-service`). PR không đổi `pnpm-lock.yaml`. Lúc QC, `main` đã có thêm `74f25d1` (#105, chỉ `report.md`, `self-qc.md`); `git merge-tree` không xung đột.

Căn cứ (`docs/overview/phieu-chot-ph01.html` trên `main`):
- **PC-04 A4** (G2 của Lần 1): “Sửa trong PH-01: service mẫu dùng loại sự kiện riêng, không dùng `task.activated` hay hợp đồng thật; nếu CI kiểm hợp đồng không nhận sự kiện ngoài hợp đồng thì dừng và báo PO, không sửa hợp đồng.”
- **PC-04 A6** (quy ước, không thuộc PID nào; PO giao ghi ở file này): “`testTimeout` 60 s, `hookTimeout` 180 s; khai một lần ở `@sires/testing`, mỗi project dùng trong `vitest.config.ts` của mình; luồng platform áp cho project của luồng mình, luồng khác áp khi chạm tới.”

Hồ sơ `docs/tickets/issues/PID-00006/` chưa ghi A4 (PC-04 ghi “chưa làm”), nên QC đối chiếu với phiếu chốt và spec 2.3.

Phạm vi đã đọc: toàn bộ diff của PR; `libs/ts/sample-service/src/` (`sample.service.ts`, `sample.spec.ts`, `sample.module.ts`), README; `libs/ts/platform/src/outbox/envelope.ts:80–111` (kiểm `type` chỉ theo mẫu chữ, routing key), `audit/audit.ts`; `docs/api-design/events/asyncapi.yaml` (mọi `type: { const: … }`, `auditRecorded`), `components/schemas/orchestration.yaml#/AuditEvent` (`action`, `objectType` là chuỗi tự do); `.github/workflows/ci.yml` job `contract-test`, `asyncapi-payload`, `infra/ci/run-project-target.mjs`, `infra/ci/asyncapi_payload.py`; `nx.json` (`test` phụ thuộc `^build`); mọi `vitest.config.ts` và timeout khai tại chỗ trong `libs/ts/{platform,testing,sample-service}`; `scripts/development/check-tracks.mjs:20–40`; Lần 1, Lần 2 của file này; `self-qc.md` Lần 3 trên `main` (#105); mô tả PR #108.

Lưu ý đánh số: `self-qc.md` Lần 3 có “QC-G8” (trạng thái `report.md`) chép từ bản rà PR #85 mà PO không nhận làm QC độc lập (PC-04 A7). Để không dùng lại mã, khoảng trống mới của file này bắt đầu từ G9.

### Kiểm các G còn mở

| G | Mức | Kết luận Lần 3 | Bằng chứng |
| --- | --- | --- | --- |
| G2 | MEDIUM | Đóng theo PC-04 A4 | `sample.service.ts:18` `SAMPLE_EVENT_TYPE = 'sample_record.activated'`, dùng cho `writeEvent` (`:31`, data `{ sampleRecordId }` ở `:33`), `action` của Audit Event (`:36`) và `routingKeys` của consumer (`:49`); không còn `task.activated` hay `taskId` trong mã, test, README của mẫu (chỉ còn chú thích chép từ DDL ở `migrations/0000_init.sql:180`). `producer` vẫn mượn `planning` (`:16`) vì `producer` và service-auth chỉ nhận `ServiceName` — đúng điều Lần 1 đã nêu là bắt buộc, có ghi chú ở `:13–15` và README `:27–32`. Audit Event vẫn là `audit.recorded` thật, đúng AC01 (`action`, `objectType` của `AuditEvent` là chuỗi tự do nên hợp lệ). Test `sample.spec.ts:53–66` (AC01: dòng outbox `sample_record.activated`, `data.sampleRecordId`, `action` của audit), `:68–74` (loại của mẫu không có trong `asyncapi.yaml`, có đối chứng `const: task.activated`), `:92–95`, `:118` (inbox qua `FakeBroker` với loại mới). `asyncapi.yaml` thêm vào `inputs` của target `test` (`package.json:40`), nên đổi hợp đồng làm test chạy lại. **Điều kiện dừng của A4 không xảy ra:** `writeEvent` chỉ kiểm `type` theo mẫu chữ (`envelope.ts:85–91`); hai job CI kiểm hợp đồng (`contract-test`, `asyncapi-payload`) chỉ chạy target cùng tên của project bị ảnh hưởng, mà `nx show projects --with-target asyncapi-payload` và `--with-target contract-test` đều trả `[]`; log CI của PR #108: “Không có project bị ảnh hưởng khai target asyncapi-payload.” Không sửa hợp đồng. Đột biến QC M6, M7 đều đỏ |
| G3 | MEDIUM | Đóng (sửa ở PR #86, có trên `main`) | `package.json:40` có `{workspaceRoot}/docs/database/ddl/*.sql` trong `inputs` của `test` |
| G5 | LOW | Còn mở, không đổi | Như Lần 1 |
| G6 | LOW | Còn mở, không đổi | Như Lần 1 (README chưa cảnh báo `drizzle-kit generate` thường) |
| G7 | LOW | Đóng trên `main` (#105) | `self-qc.md:164` (Lần 3) ghi chú lệch cho dòng dẫn log cục bộ và dòng EC07 của Lần 1, không ghi đè Lần 1; `report.md:19` sửa câu về worktree |
| A6 | — | Đạt | `testing/src/vitest/timeouts.ts:21–24` `TESTCONTAINERS_TIMEOUTS = Object.freeze({ testTimeout: 60_000, hookTimeout: 180_000 })`, khai một lần, export ở gốc gói (`src/index.ts:10`) và đường dẫn con `@sires/testing/vitest` (`package.json:13–16`, `src/vitest/index.ts:6`). Dùng trong `vitest.config.ts` của cả ba project luồng platform có test Testcontainers: `libs/ts/platform/vitest.config.ts:6`, `:12`; `libs/ts/sample-service/vitest.config.ts:6`, `:11`; `libs/ts/testing/vitest.config.ts:6`, `:12` (đọc từ `src` vì gói chưa build khi tự test). `libs/py/sires_common` dùng pytest, không thuộc quy ước vitest. Probe QC: một hook 11 s và một test 6 s đạt ở cả ba project khi có config, đỏ đúng “Hook timed out in 10000ms”, “Test timed out in 5000ms” khi bỏ config (mục Lệnh). Đột biến M8, M9 làm `timeouts.spec.ts` đỏ. Dựng phụ thuộc: target `test` phụ thuộc `^build` (`nx.json`) nên `@sires/testing` được build trước khi `vitest.config.ts` của hai project kia nạp `dist/vitest/index.js` — như cách test các project này vốn nạp `@sires/testing` từ `dist` |

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G9 | PC-04 A6 (“test dùng Testcontainers: `testTimeout` 60 s, `hookTimeout` 180 s … luồng platform áp cho project của luồng mình”) | partial | LOW | Config mới đặt trần cho cả project, nhưng timeout khai tại chỗ thấp hơn vẫn đè lên: `describe(…, { timeout: 30_000 })` ở `libs/ts/platform/src/audit/audit.spec.ts:39`, `idempotency/idempotency.spec.ts:47`, `inbox/inbox.spec.ts:84`, `outbox/outbox.spec.ts:33` (mọi test Testcontainers trong bốn khối này chỉ có 30 s); `afterAll(…, 60_000)` dừng container ở `audit.spec.ts:58`, `idempotency.spec.ts:81`, `inbox.spec.ts:175`, `jobs/jobs.spec.ts:39`, `outbox.spec.ts:61`, `state-machine/ddl.pg.spec.ts:120`, `tenancy/concurrency.spec.ts:107`, `tenancy/tenancy.spec.ts:35`; `beforeAll(…, 120_000)` dựng container ở `libs/ts/sample-service/src/sample.spec.ts:45`, `migration.spec.ts:18`. Các test này đều đạt ở mọi lượt QC chạy; rủi ro chỉ xuất hiện khi runner tải rất cao | Không chặn. Bỏ các timeout tại chỗ thấp hơn hằng chung (hoặc nâng lên bằng hằng), giữ những chỗ lớn hơn (`beforeAll` 300 s, test 120 s, 180 s); có thể làm cùng PR đưa planning, workspace sang hằng chung |
| G10 | DEC-58 (Dev tự QC trước khi mở PR, ghi `self-qc.md`) | partial | LOW | PR #108 không chạm `agent/execution/PID-00006/`; lượt sửa G2 và A6 chỉ có trong mô tả PR (kể cả câu “QC độc lập đạt” — lời khai của phía Dev, không phải QC độc lập của PO). `self-qc.md` Lần 3 trên `main` (#105) vẫn ghi G2 “đang sửa, chưa vào `main`” | Không chặn. Dev thêm mục self-QC cho lượt G2, A6 sau khi cập nhật nhánh theo `main`, hoặc PO nhận mô tả PR #108 làm bản tự QC |

Không có CRITICAL, HIGH, MEDIUM.

### AC

Mức kiểm: ô Xây, PostgreSQL 16 + pgvector và RabbitMQ 4 thật qua Testcontainers (Docker Engine trong WSL), QC tự chạy.

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00006-AC01 | đạt | Xây · thật | `sample.spec.ts › trạng thái, Audit Event và outbox cùng một giao dịch (PID-00006-AC01)`; `› lỗi giữa giao dịch không để lại dòng nào (EC01)` | Đạt trong `@sires/sample-service:test` 14/14 (3 file, 27 s) |
| PID-00006-AC02 | đạt | stub (FakeBroker gửi vào `EventConsumer.handle` thật, inbox trên PostgreSQL thật) | `sample.spec.ts › inbox › sự kiện trùng tác động đúng một lần (PID-00006-AC02)`, `› sự kiện trùng đến sau (EC02)`, `› sự kiện trùng xử lý đồng thời (EC03)` | Như trên |
| PID-00006-AC03, AC05 | đạt | Xây · thật | `› RLS chặn đọc chéo tài khoản (PID-00006-AC03)`, `› endpoint nội bộ kiểm token nội bộ (PID-00006-AC05)` | Như trên |
| PID-00006-AC04 | đạt | Xây · thật | `ddl-pg16.spec.ts › dựng 11 database từ DDL tham chiếu (PID-00006-AC04)` | Như trên; 11 database “đạt”, knowledge có pgvector 0.8.7 |
| Spec 2.3 (không dùng hợp đồng thật) — G2, PC-04 A4 | đạt | Xây | `sample.spec.ts › loại sự kiện riêng của mẫu, không có trong hợp đồng thật (spec 2.3; QC G2)` | Như trên |
| NFR-MAINT-004-AC01 (phần ticket) | không chạy lại | — | Thao tác tay ở S04 (G5) | QC không chạy lần này |

### Lệnh đã chạy

Worktree riêng (detached ở `a61cf79`) trong scratchpad của phiên QC, Windows 11, Node 24.21.0, pnpm 10.34.9, `DOCKER_HOST=tcp://localhost:2375` (Docker Engine 29.8.2 trong WSL `Ubuntu-24.04`).

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (1 phút 1 giây) |
| `pnpm nx run-many -t lint typecheck build test -p @sires/testing @sires/platform @sires/sample-service --skip-nx-cache` | Đạt cả 12 tác vụ (kèm 2 tác vụ phụ thuộc), 1 phút 52 giây: `@sires/testing:test` 5 file, 16/16 (23 s); `@sires/sample-service:test` 3 file, 14/14 (27 s); `@sires/platform:test` 21 file, 172/172 (74 s) |
| Probe A6 của QC (file tạm `src/qc-a6-probe.spec.ts`: `beforeAll` ngủ 11 s, một test ngủ 6 s; chép vào từng project, chạy `npx vitest run src/qc-a6-probe.spec.ts`, xóa sau khi chạy) | Có config: 2/2 đạt ở cả `testing`, `platform`, `sample-service`. Đổi tên tạm `vitest.config.ts` (trả lại ngay sau lượt): cả ba project đỏ đúng “Hook timed out in 10000ms” và “Test timed out in 5000ms”. Sau probe `git status` sạch |
| Đột biến QC (sửa tạm, `git checkout` lại sau mỗi ca) | **M6** `SAMPLE_EVENT_TYPE` về `task.activated`: 2 test đỏ (AC01; `loại sự kiện riêng của mẫu, không có trong hợp đồng thật`). **M7** data về `{ taskId }`: AC01 đỏ. **M8** `testTimeout` 30 s: `timeouts.spec.ts › test 60 s, hook 180 s` đỏ. **M9** bỏ `Object.freeze`: `› không sửa được lúc chạy` đỏ. Sau khi trả lại mã, `git status` sạch |
| `NX_DAEMON=false npx nx show projects --with-target asyncapi-payload --json`; `--with-target contract-test --json` | `[]`; `[]` |
| `npx nx show project @sires/sample-service --json` (`targets.test`) | `inputs` có `docs/database/ddl/*.sql` và `docs/api-design/events/asyncapi.yaml`; `dependsOn: ["^build"]` |
| `gh run view 45537621409 --log --job 138948109323` (job `asyncapi-payload` của PR #108) | “Không có project bị ảnh hưởng khai target asyncapi-payload.” |
| `git merge-tree --write-tree` PR #108 với `origin/main` (`74f25d1`) và với PR #106 (`platform/qc-g5-g8`) | Không xung đột; hai PR không chung file nào |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: platform, repo` — `repo` do `libs/ts/sample-service` chưa được map vào luồng nào trong `check-tracks.mjs:20–40` (mô tả PR đã nêu) |
| `node scripts/docs/add-license.mjs --check`; `node scripts/docs/update-index.mjs --check` | `0 file chưa có thông báo giấy phép.`; khớp 159 PID, taskboard khớp |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00006 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| `gh pr view 108`, `gh pr checks 108`, `gh api …/pulls/108/commits` | `OPEN`, base `main`, `MERGEABLE`, `BLOCKED` (chưa có review); mọi check CI đạt trên `a61cf79`; 2 commit tác giả `T1xNTH`, `verified: true`, không có trailer ghi công AI |

### Lệch với Self-QC

- PR #108 không có mục self-QC trong `self-qc.md` (G10); QC đối chiếu với mô tả PR.
- Mô tả PR ghi testing 16/16, platform 172/172, sample-service 14/14: khớp lượt QC (16/16, 172/172, 14/14).
- Mô tả PR ghi “bỏ `vitest.config.ts` thì đỏ `Test timed out in 5000ms` ở mọi project”: khớp probe QC (QC thêm cả hook 11 s, đỏ “Hook timed out in 10000ms”).
- Mô tả PR không nêu các timeout tại chỗ thấp hơn hằng chung (G9).

### Việc còn lại, theo thứ tự phụ thuộc

Không còn việc chặn merge PR #108.

1. G9: bỏ hoặc nâng các timeout tại chỗ thấp hơn hằng chung trong `platform`, `sample-service`.
2. G10: Dev bổ sung self-QC của lượt G2, A6, hoặc PO nhận mô tả PR #108.
3. Sau khi PR #108 vào `main`: planning, workspace chuyển sang `@sires/testing/vitest` ở PR của luồng mình (A6 “luồng khác áp khi chạm tới”; mô tả PR #108 đã hẹn).

### Đề xuất cho PO

- **Merge được PR #108 theo DEC-58:** 0 CRITICAL, 0 HIGH, 0 MEDIUM; G5, G6, G9, G10 LOW. G2 (MEDIUM) đã đóng; điều kiện dừng của A4 không xảy ra (không CI nào kiểm sự kiện của mẫu với hợp đồng), hợp đồng không bị sửa. PR đang `BLOCKED` vì chưa có review; commit đã ký, CI đạt.
- PR #106 và PR #108 độc lập, merge theo thứ tự nào cũng được (`git merge-tree` sạch cả hai chiều với `main` và với nhau).
- Ghi PC-04 A4 vào mục 5 hồ sơ PID-00006 (PC-04 ghi “chưa làm”); A6 là quy ước chung, PO quyết ghi ở đâu (ví dụ `docs/tickets` quy tắc chung hoặc README của `@sires/testing`).
- `check-tracks.mjs` chưa map `libs/ts/sample-service` vào luồng nào (ra `repo`): việc của luồng infra nếu PO muốn PR của mẫu tính vào luồng platform.

## Lần 4 — 27/11/2026 · spec-converge-skill

Người chạy: phiên QC do PO `toilatrung` giao, không mang kết luận của Dev. Mã nguồn: PR #116, nhánh `platform/drop-local-timeouts`, đầu nhánh `b65d5ae` (`b65d5ae304ff0a8065c4cf646638dfa3475e8f80`), 2 commit, gốc `origin/main` `c9e745b` (nhánh đã cập nhật với `main`).

Đã đối chiếu: G9 của Lần 3; PC-05 P38 (phương án 1 “Có, PR nhỏ của luồng platform”; điều phối 25/11/2026 chốt bỏ cả timeout bằng hằng chung), PC-04 A6; `self-qc.md` Lần 4; toàn bộ diff (13 file).

### Kiểm lại việc còn lại của Lần 3

| G Lần 3 | Kết quả Lần 4 | Bằng chứng |
| --- | --- | --- |
| G9 LOW: timeout khai tại chỗ thấp hơn hằng chung vẫn đè config | Đã xử lý | Bỏ `describe { timeout: 30_000 }` ở `audit.spec.ts`, `idempotency.spec.ts`, `inbox.spec.ts`, `outbox.spec.ts`; `afterAll(…, 60_000)` ở 8 file platform; `beforeAll(…, 120_000)` ở `sample-service/src/migration.spec.ts`, `sample.spec.ts`; ba chỗ bằng hằng chung (`jobs.spec.ts` describe 60 s, `inbox.spec.ts` hai `it` 60 s). Giữ chỗ lớn hơn: `beforeAll(…, 300_000)`, `it` 120 s, 180 s. Mọi chỗ bỏ đều là nâng trần (30→60 s, 60/120→180 s), không làm test chặt hơn. Test chặn `libs/ts/platform/src/local-timeouts.spec.ts`, `libs/ts/sample-service/src/local-timeouts.spec.ts` |
| G5, G6 LOW | Còn mở, không đổi | Như Lần 1 |
| G10 LOW: PR #108 chưa có self-QC | Còn mở | `self-qc.md` Lần 4 chỉ phủ G9 của PR này, chưa phủ lượt G2/A6 của #108 |

### Khoảng trống

| Mã | Nguồn | Loại | Mức | Bằng chứng | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G5, G6 | Như Lần 1 | partial | LOW | Như Lần 1 | Như Lần 1 |
| G10 | DEC-58 | partial | LOW | Như Lần 3 | Như Lần 3; hoặc PO nhận mô tả PR #108 làm bản tự QC |
| G12 | Tính dễ bảo trì (không có AC) | unrequested | LOW | `libs/ts/platform/src/local-timeouts.spec.ts` và `libs/ts/sample-service/src/local-timeouts.spec.ts` giống nhau 71 dòng, chỉ khác tên describe. Test chỉ xét số viết trực tiếp (hằng hay biến thì bỏ qua), như chú thích đầu file đã nêu | Không chặn. Khi project thứ ba cần (planning, workspace, identity có `beforeAll(…, 60_000)` hay `180_000` tại chỗ, xem ghi nhận 2), đưa hàm `localTimeoutsNotAboveShared` vào `@sires/testing/vitest` và gọi từ mỗi project |

Không có CRITICAL, HIGH, MEDIUM.

Ghi nhận, không tính G:

1. Commit 2 (`b65d5ae`) đổi import của hai test chặn từ `@sires/testing/vitest` sang gốc `@sires/testing`, vì `nx run @sires/contracts:check-drift` chỉ trỏ gốc `@sires/<tên>` vào `src/index.ts`. `vitest.config.ts` vẫn import đường dẫn con (không thuộc phạm vi check-drift), như #108.
2. Ngoài phạm vi P38 (chỉ platform, sample-service): `apps/workspace/src/auth/service-auth.spec.ts:47` còn `beforeAll(…, 60_000)`, thấp hơn `hookTimeout` 180 s mà #115 vừa áp cho workspace. Có từ trước; đề xuất mở rộng test chặn sang workspace, planning, identity ở PR sau của các luồng đó.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` (cây gộp 7 nhánh đang mở lên `main`) | Đạt (1 phút 16 giây) |
| `pnpm exec vitest run src/local-timeouts.spec.ts` ở platform và sample-service, trên cây gộp (có cả #117) | Đạt 1/1 mỗi project: test mới của #117 không khai timeout tại chỗ |
| Đột biến: thêm lại `{ timeout: 30_000 }` cho describe `audit.spec.ts:39` | Đỏ: `audit\audit.spec.ts:39 describe 30000 ≤ 60000`; đã trả lại |
| `pnpm nx run-many -t lint typecheck -p @sires/platform @sires/sample-service …` trên cây gộp | Đạt |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00006 --result` | KẾT QUẢ ĐỦ (0 cảnh báo) |
| `node scripts/docs/add-license.mjs --check` | 0 thiếu |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: platform, repo` |
| `gh api repos/toilatrung/sires/pulls/116/commits` | 2/2 `verified: true`; không có dòng ghi công AI |
| `gh pr checks 116` (run 45656365271 trên `b65d5ae`) | 25/25 đạt. Log job `typescript`: platform chạy mới 175/175, sample-service 15/15, `contracts` (check-drift) đạt |
| Test Testcontainers đầy đủ của platform | Không chạy lại cục bộ (máy dùng chung); dựa vào CI chạy mới ở trên |

### Lệch với Self-QC

Không có. Số liệu `self-qc.md` Lần 4 (175/175, 15/15, test chặn đỏ trước khi sửa) khớp CI và đột biến của QC.

### Việc còn lại

1. Phiên điều phối merge #116. #116 và #117 cùng sửa `libs/ts/platform/src/inbox/inbox.spec.ts` ở chỗ khác nhau; QC đã thử gộp, không xung đột. Merge một PR thì PR kia phải cập nhật với `main` và chờ CI.
2. G12, ghi nhận 2: PR sau, không chặn.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
