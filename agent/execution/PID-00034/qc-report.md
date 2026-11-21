# PID-00034 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể merge — 0 CRITICAL, 0 HIGH. G1 đóng theo quyết định PO 22/11/2026 (“Tách ra PR platform”): thay đổi `errors.spec.ts` đã bỏ khỏi PR ở `fafa1b6`, chuyển sang PR #64 của luồng platform. Còn 4 MEDIUM (G2 người làm khác người được giao, PO xác nhận; G3 media type upload; G4, G5 chờ PO quyết) và 4 LOW (G6–G9), không chặn merge. Mã e2e đạt 4/4 AC ở mức khung, chạy cục bộ (Lần 2, 22/11/2026)

- **Ticket:** [PID-00034](../../../docs/tickets/issues/PID-00034/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 22/11/2026 · spec-converge-skill

Người chạy: QC độc lập do phiên PO giao (không mang kết luận của Dev). Mã nguồn: PR #59, nhánh `e2e/pid-00034-playwright-fixtures`, commit `3fb7ca6`, kiểm trong một worktree tách riêng, không có thay đổi chưa commit. QC đánh giá file hiện có, không so nhánh.

Đã đối chiếu: `index.html` (AC01–AC04, Gồm, Không gồm, mục 7, 8), `specs/acceptance.html`, `specs/scope.html` (P1–P4, N1–N3, EC01–EC03), `specs/index.html` (O1–O7, mục 2.5, 4.4, 4.7, B1–B5, mục 6, 7), `specs/brief.html`, slice S01, S02, `designs/notes.html`; PRD 19 (Dữ liệu chuẩn, Ngôn ngữ, quy ước mã `TS-NN-MM`), NFR-SCALE-001, NFR-SCALE-002 (16.4), UX-I18N-001; hợp đồng `docs/api-design/openapi.yaml`, `paths/07`, `paths/08`, `paths/10`, `paths/15`, `components/parameters.yaml`, `components/schemas/library.yaml`, `account.yaml`; quy tắc 1.3, 1.4 (`docs/tickets/sections/01-tracks-and-boundaries.html`), `.github/CODEOWNERS`, sổ task-registry; mã `e2e/` và mọi file khác trong diff của PR: `libs/ts/platform/src/errors/errors.spec.ts`, `pnpm-lock.yaml`, `agent/execution/PID-00034/`.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | Ticket mục 7 (“Không được sửa: thư mục ngoài luồng `e2e`”; “Cần sửa luồng khác → dừng, đề xuất PID”), quy tắc 1.4.1 (một PR một luồng), 1.3 (luồng service không sửa trực tiếp thư mục dùng chung), CODEOWNERS (`/libs/ts/platform/` là của `T1xNTH`) | contradicts | HIGH | `libs/ts/platform/src/errors/errors.spec.ts:162-184` thêm ca 413 chạy bằng `app.inject()`, đồng thời bỏ ca 413 qua HTTP thật trong vòng `fetch` (ở `main` là `errors.spec.ts:150-156`). Căn cứ duy nhất là YC1 “Người dùng trong phiên”, nguyên văn “sửa đi” (`report.md:43`); không có lời PO, không có PID của luồng platform. `check-tracks.mjs` báo `PR touches 3 tracks (e2e, infra, platform)`. Không AC nào của PID-00034 cần thay đổi này. CI Linux đạt với cả test cũ trên `main` lẫn test mới (run 44926629056: platform 168 passed, `errors.spec.ts` 5 test). Thay đổi chỉ ở test, không ở runtime, nhưng làm mất phần kiểm 413 qua socket thật, chỉ còn kiểm qua inject; giữ hay bỏ là việc của chủ luồng platform | Dev đưa `errors.spec.ts` về như `main` và bỏ YC1 khỏi PR này. Lỗi `ECONNRESET` trên Windows thì báo PO để mở PID hoặc PR riêng của luồng platform cho `T1xNTH`. Nếu PO muốn giữ trong PR này: PO ghi lời đồng ý vào `report.md` mục 5 và `T1xNTH` duyệt với vai code owner |
| G2 | Sổ task-registry (chỉ PO ghi), DEC-58, CODEOWNERS (`/e2e/` là của `congminh1705`) | quy trình (PO quyết) | MEDIUM | Sổ giao PID-00034 cho `congminh1705` (`agent/execution/taskboard.html:73`, `:421`, cả bản trên `origin/main`). PR #59 và cả 8 commit do `Vietanhhhhhh2003` làm. `report.md`, hồ sơ ticket và PR (không có comment hay review) không ghi việc PO giao lại. `report.md:43` chỉ ghi “Người dùng trong phiên”, không nói là ai | PO xác nhận ai làm PID-00034. Đã giao lại thì PO sửa cột assignee trong sổ; chưa giao thì PO quyết số phận PR. Dù trường hợp nào, file trong `e2e/` vẫn cần `congminh1705` duyệt với vai code owner, hoặc PO bypass |
| G3 | P4, O3 (“Bộ nạp qua API công khai”), S02 “Xong khi: PID-00055 dùng được bộ sinh và bộ nạp” | partial | MEDIUM | `e2e/fixtures/load.ts:52-54`: lời gọi `uploadReferenceDocument` mang body JSON tự đặt `{ file: { fileName, mimeType, base64 } }`. Hợp đồng yêu cầu `multipart/form-data` với phần `file` là PDF nhị phân (`docs/api-design/paths/10-academic-discovery-and-trusted-library.yaml:485-500`). `LoadCall` (`load.ts:13-21`) không có trường media type. Riêng body của lời gọi này không kiểm bằng type `JsonBody<…>` từ `@sires/contracts`, khác các lời gọi còn lại. TS-00-05 chỉ đối chiếu operationId, method, path và header CSRF nên vẫn đạt. AC04 (operationId đúng) đạt | Thêm media type vào `LoadCall` (ví dụ `contentType: 'multipart/form-data'` và phần `file` kiểu `application/pdf`), mô tả cách PID-00055 dựng multipart. TS-00-05 đối chiếu thêm `requestBody.content` của từng operation với OpenAPI |
| G4 | P1, spec 4.4 (“Mọi kịch bản E2E chạy ít nhất một lần ở tiếng Việt và một lần ở tiếng Anh”, PRD 19 Ngôn ngữ), UX-I18N-001 (ngôn ngữ theo Preferences; chỉ lần đầu theo trình duyệt) | partial | MEDIUM | Project `vi`/`en` chỉ đặt `locale` của trình duyệt (`e2e/playwright.config.ts:17-18`). Fixture đặt cứng `uiLanguage: 'vi'` cho cả A và B (`e2e/fixtures/generate.ts:34`), và khung không có tùy chọn nào để chọn ngôn ngữ giao diện theo project. Khi A, B đã đăng nhập và có Preferences, project `en` vẫn ra giao diện tiếng Việt. Thêm vào đó web đặt cứng `lng: 'vi'` (`apps/web/src/shell/i18n.ts:24`, luồng web, Dev đã báo ở `report.md:47-49`). AC01 (“chạy ở cả vi và en”) đạt ở mức khung | PO quyết, ghi thành OQ: khung PID-00034 cần tùy chọn ngôn ngữ theo project (ví dụ option `uiLanguage` của project, fixture ghi đè Preferences), hay để PID-00055 hoặc PID web làm. Dev làm theo quyết định đó |
| G5 | PRD 19 (“`TS-NN-MM`, NN là số tiểu mục 19.NN … Mã không tái sử dụng”), PRD 1.6, `AGENT.md` (“Không tự chốt thay PO”) | unrequested | MEDIUM | Dev tự đặt dải `TS-00-01`–`TS-00-07` cho test khung (`e2e/README.md:21`, `e2e/tests/*.spec.ts`). PRD không có tiểu mục 19.00. Mã TS là mã ID của PRD, do PO cấp. Lý do có ghi ở `implement.md` mục 3, nhưng không có lời PO. `conventions.spec.ts:18` buộc mọi test, kể cả test không phải kịch bản PRD (smoke, kiểm thử bảo mật, k6 sau này), phải mang mã TS | PO chốt: (a) nhận `TS-00-*` làm dải cho test khung và ghi vào PRD 19 hoặc kế hoạch e2e; hoặc (b) chỉ test kịch bản PRD mang mã TS, test khung đặt tên khác, `conventions.spec.ts` chỉ kiểm nhóm kịch bản |
| G6 | P2, PID-00034-AC02 | partial | LOW | `e2e/tests/conventions.spec.ts:15` chỉ lấy `suite.specs` ở cấp file. Test nằm trong `test.describe` thuộc `suite.suites` lồng nhau, nên lọt qua bước kiểm tên `TS-NN-MM` ở `:18`. Tiến trình con ở `:12-13` không truyền `--config`, nên chỉ chạy đúng khi thư mục hiện hành là `e2e/` | Duyệt đệ quy `suites`; truyền `--config` lấy từ `testInfo.config.configFile` |
| G7 | Quy tắc báo cáo đúng hiện trạng (`spec-execution-skill`) | partial | LOW | `report.md:3` ghi “Xong — chờ QC”, trong khi `:18` ghi “Chưa đặt Xong”, `:32` ghi “chưa commit”, `:51-55` ghi “Còn mở: G1 HIGH”. Dòng `:10-12` có nói mục 1–6 là lịch sử, nhưng người đọc mục 6 vẫn thấy việc còn mở đã không còn. Chân giấy phép nằm giữa file (`:60-61`), trước mục Lần 2, Lần 3 | Cập nhật mục 1–6 theo hiện trạng, hoặc chuyển nội dung cũ thành “Lần 1”; đưa chân giấy phép về cuối file |
| G8 | Không ghi đường dẫn máy vào file commit | partial | LOW | `agent/execution/PID-00034/validation.md:27`: lệnh `docker run` mount thư mục checkout theo đường dẫn tuyệt đối trên máy Dev (ổ `/mnt/…`), QC không chép lại ở đây | Thay bằng biến (ví dụ `$(wslpath -a <repo>)`) hoặc `<repo>` |
| G9 | Quy tắc 1.4.7 (phiên bản dùng chung khai một chỗ, pnpm catalog do luồng infra giữ) | unrequested | LOW | `e2e/package.json:20` khai `"yaml": "2.9.0"` riêng. `package.json:30` ở gốc cũng khai `yaml` 2.9.0, nên đây là phụ thuộc dùng chung nhưng không nằm trong catalog | Luồng infra thêm `yaml` vào catalog, e2e dùng `catalog:`; hoặc PO chấp nhận ghim riêng |

Ghi nhận thêm, không tính là khoảng trống:

1. `pnpm-lock.yaml` chỉ đổi importer `e2e` (thêm `@sires/contracts`, `yaml`). CODEOWNERS không gán chủ cho lockfile, và quy tắc 1.4.7 cho mọi luồng sinh lại. Cảnh báo `infra` của `check-tracks.mjs` đến từ cách công cụ phân loại file này.
2. `e2e/fixtures/documents.ts` (tạo PDF mẫu) và `e2e/fixtures/cli.ts` (chạy thử) là file phụ. O2 `generate.ts` và O3 `load.ts` vẫn ở đúng đường dẫn và giữ hàm chính, nên QC không coi là “tách” Output theo quy tắc 1.4.13. Tên test trong `acceptance.html` được thêm tiền tố mã TS, phần tên còn lại giữ nguyên (xem G5).
3. EC03 được làm chặt hơn spec: `loadFixtures` từ chối mọi lời gọi `dryRun: false` (`load.ts:83-85`), không riêng production. Điều này khớp N2 (nạp thật ngoài phạm vi). PID nào làm nạp thật sẽ phải tự viết bước chặn production.
4. Dữ liệu chuẩn khớp PRD 19: A, B; P1 (tiếng Anh), P2 của A; PDF có lớp văn bản, PDF chỉ có ảnh, reference không có toàn văn, thuộc ba lĩnh vực; ba kết nối Claude, OpenAI, Gemini chỉ lưu tên biến môi trường của key, và một key sai tổng hợp. Dữ liệu quy mô khớp đủ số của NFR-SCALE-001, NFR-SCALE-002. Diff không có key thật, storage state, đường dẫn hay tên máy, ngoài G8.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00034-AC01 | đạt (mức khung), kèm G4 | cục bộ: web dev thật của worktree, Chrome hệ thống; chưa có staging | `e2e/tests/smoke.spec.ts › TS-00-01 web shell loads and redirects to the dashboard` | Đạt ở cả `vi` và `en`, `navigator.language` khớp locale của project. Có `e2e/playwright-report/index.html` và `e2e/test-results/junit.xml` (`tests="14" failures="0" skipped="0" errors="0"`, 3 suite mỗi project) |
| PID-00034-AC02 | đạt, kèm G6 | cục bộ | `e2e/tests/conventions.spec.ts › TS-00-02 lọc theo mã TS` | Đạt. QC chạy thật `--grep TS-00-05`: 2 test chạy (vi, en), không test nào khác |
| PID-00034-AC03 | đạt | cục bộ, cộng chạy tay hai lần | `e2e/tests/fixtures.spec.ts › TS-00-03 dữ liệu xác định`, `› TS-00-04 dữ liệu quy mô 16.4` | Đạt. QC chạy CLI hai tiến trình riêng với seed `qc`: bản chuẩn (22 dòng) và bản `--scale` (7.042 dòng) giống hệt từng byte giữa hai lần (`cmp`); seed `other` cho kết quả khác |
| PID-00034-AC04 | đạt, kèm G3 | cục bộ | `e2e/tests/fixtures.spec.ts › TS-00-05 chạy thử bộ nạp` | Đạt. Kế hoạch chuẩn có 22 lời gọi, 9 operationId; operationId, method, path đều có trong `openapi.yaml` công khai; 0 lời gọi mạng. Key hợp lệ in dưới dạng `${env.E2E_*_API_KEY}` |

Edge case: EC01 đạt (QC chạy với `E2E_BASE_URL=http://127.0.0.1:59999`: 1 failed, exit khác 0, thông báo `Không mở được môi trường E2E: http://127.0.0.1:59999`; các test không cần trình duyệt vẫn đạt nhưng lượt chạy vẫn fail, không báo đạt giả). EC02 đạt (TS-00-06). EC03 đạt (TS-00-07, xem mục ghi nhận 3).

### Lệnh đã chạy

Máy PO, Windows 11, Node 24.21.0, pnpm 10.34.9, Playwright 1.64.1. Kiểm trong worktree tách riêng tại commit `3fb7ca6`. Web chạy bằng `vite --host 127.0.0.1 --port 5180 --strictPort` trong `apps/web` của worktree, vì cổng 5173 đang bận.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt (31 giây); lockfile khớp `package.json` |
| `pnpm nx run-many -t lint typecheck -p @sires/e2e --skip-nx-cache` | Đạt, kèm 2 tác vụ phụ thuộc (build `@sires/contracts`) |
| `pnpm --filter @sires/e2e e2e` với `E2E_BASE_URL=http://127.0.0.1:5180`, `E2E_CHROMIUM_EXECUTABLE` = Chromium có sẵn trong thư mục trình duyệt của Playwright (revision 1255) | 12 passed, 2 failed (smoke vi, en). Lỗi do môi trường máy QC: Smart App Control chặn `chrome.dll` của bản Chromium này (`0x11C7`). Bản Playwright 1.64.1 cần (revision 1248) không có trên máy; QC không tải |
| Cùng lệnh, `E2E_CHROMIUM_EXECUTABLE` = Google Chrome 157 đã cài trên máy | **14 passed (14,6 giây)**; tạo báo cáo HTML và JUnit |
| `pnpm --filter @sires/e2e e2e --grep TS-00-05` | 2 passed (vi, en); không chạy test khác |
| `E2E_BASE_URL=http://127.0.0.1:59999 pnpm --filter @sires/e2e e2e --project vi --grep TS-00-01 --reporter=line` | 1 failed, đúng EC01, có báo URL |
| `node --experimental-strip-types fixtures/cli.ts --seed qc` (và `--scale`), chạy hai lần, `cmp` | Giống hệt từng byte; bản chuẩn có 22 lời gọi, bản scale 7.042 (5.000 `createReferenceManually`, 2.001 `uploadReferenceDocument`, 25 `decideReferences` ≤ 200 mỗi lô) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main --parallel=2` (19 project) | **Lượt 1** (Git Bash): exit 1, toàn lỗi môi trường. Git Bash đổi `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE` thành đường dẫn Windows nên Testcontainers không tạo được container. **Lượt 2** (PowerShell, `DOCKER_HOST=tcp://127.0.0.1:2375`, `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`): lint, typecheck, test, build của 15 project TS (gồm e2e) đều đạt, trừ `@sires/platform:test` 167/168. Test lỗi là `telemetry.spec.ts › span và log cùng mã yêu cầu`, quá 5 giây khi chạy song song; PR không chạm file này. Chạy lại riêng `telemetry.spec.ts` và `errors.spec.ts`: 11/11 đạt. `errors.spec.ts` (file của G1) đạt 5/5 ở cả hai lượt. `@sires/testing` 13/13; `@sires/orchestration` 21 passed, 4 todo. **Python** (`agent-core`, `knowledge`, `sires-common`): không chạy được. Lý do: `ruff`, `mypy` chưa có trong `.venv` của worktree (chưa `uv sync --all-packages`), Smart App Control chặn DLL của `knowledge` (spk_05), và đường dẫn worktree dài làm thiếu module sinh của `sires_common`. PR không đổi mã Python; CI đạt cho các project này |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: e2e, infra, platform, repo`; `warning: PR touches 3 tracks (e2e, infra, platform); rule 1.4.1 expects one.` (exit 0, chỉ cảnh báo) — xem G1 |
| `node scripts/docs/add-license.mjs --check` | Trước khi chạy test: `0 file chưa có thông báo giấy phép.` Sau khi chạy test và tạo file này: `qc-report.md` không bị báo thiếu; 6 file bị báo là file sinh trong lúc QC chạy test (`.pytest_cache/`, `e2e/playwright-report/`, `e2e/test-results/`), đều đã Git ignore và không commit |
| `node scripts/docs/update-index.mjs --check` | Khớp (159 PID, taskboard 159 task) |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00034 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| `git diff --check origin/main...HEAD` | Sạch |
| `gh api repos/toilatrung/sires/pulls/59/commits` | 8/8 commit `verified: true`, `reason: valid`, tác giả `Vietanhhhhhh2003`. Thông điệp commit và mô tả PR giữ đúng dấu tiếng Việt, không có trailer `Co-Authored-By` hay dòng ghi công AI |
| `gh pr checks 59` (CI, bằng chứng phụ) | `build` pass (2 phút 57 giây), `tracks` pass (7 giây), run 44926629056, headSha `3fb7ca6`. Log build: `Successfully ran targets lint, typecheck, test, build for 19 projects and 2 tasks they depend on`; platform 168 passed. CI chỉ chạy lint, typecheck của e2e, không chạy Playwright |

### Lệch với Self-QC

- Self-QC Lần 2 và `report.md` Lần 2 coi việc sửa platform là “được người dùng cho phép ở YC1”. QC thấy không có lời PO, nên đây là vi phạm ranh giới (G1), không phải mục “Yêu cầu thêm” đã được duyệt. Mục 4 của self-qc vẫn ghi “[x] Không sửa … service khác”; điều đó đúng ở Lần 1 nhưng không còn đúng với PR hiện tại.
- Dev xếp lockfile là G3 LOW. QC không coi là khoảng trống (xem mục ghi nhận 1).
- Dev chạy 14/14 bằng Chromium của Playwright. Trên máy PO, bản Chromium đó bị Smart App Control chặn; QC đạt 14/14 bằng Chrome hệ thống. Kết quả giống nhau, môi trường khác nhau.
- Dev không nêu G3–G6 (media type khi upload, ngôn ngữ theo Preferences, dải mã TS-00, kiểm tên chưa duyệt `describe` lồng nhau).
- Bằng chứng CI của Dev là cho commit `5e1c897`. HEAD `3fb7ca6` có run riêng (44926629056) và cũng đạt.

### Việc còn lại, theo thứ tự phụ thuộc

1. PO quyết G1. Mặc định: Dev đưa `libs/ts/platform/src/errors/errors.spec.ts` về như `main` và bỏ YC1 khỏi PR; sửa platform, nếu cần, đi bằng PR hoặc PID riêng của `T1xNTH` (G1, ticket mục 7, quy tắc 1.4.1).
2. PO xác nhận người làm PID-00034 và cập nhật sổ task-registry nếu đã giao lại; `congminh1705` duyệt phần `e2e/` hoặc PO bypass (G2).
3. Dev thêm media type cho `uploadReferenceDocument` vào `LoadCall` và kiểm `requestBody.content` trong TS-00-05 (G3, P4, O3).
4. PO quyết cơ chế chọn ngôn ngữ giao diện theo project, rồi Dev làm theo (G4, P1, spec 4.4).
5. PO chốt dải mã cho test khung; Dev đổi tên test hoặc phạm vi kiểm của `conventions.spec.ts` theo quyết định (G5, P2).
6. Dev: duyệt đệ quy `suites` và truyền `--config` (G6); cập nhật `report.md` theo hiện trạng (G7); bỏ đường dẫn máy trong `validation.md` (G8).
7. Luồng infra hoặc PO: `yaml` vào catalog (G9).

### Đề xuất cho PO

- Câu hỏi đề xuất (chưa cấp mã; lấy mã OQ tiếp theo ở `docs/docs_context.md`): (1) Ngôn ngữ giao diện của kịch bản E2E chọn theo Preferences của tài khoản kiểm thử hay theo project Playwright, và PID nào làm cơ chế đó (G4)? (2) Test khung, smoke và test không phải kịch bản PRD 19 có mang mã `TS-NN-MM` không; nếu có thì dùng dải nào (G5)?
- Spec mục 2.5 ghi `pnpm install`, `pnpm local:up`, `pnpm --filter @sires/e2e e2e`. Nhưng `local:up` không khởi động web, nên smoke sẽ fail nếu không chạy `pnpm --filter @sires/web dev` riêng (`e2e/README.md:7` có ghi bước này). Nên bổ sung spec khi làm `spec-clarify-skill` cho PID-00055.
- CI không chạy Playwright: e2e không có target `test`, nên TS-00-02 đến TS-00-07 (không cần trình duyệt) không được CI kiểm hồi quy. Có thể đưa vào PID infra hoặc e2e sau, khi có staging (kiến trúc 11.3).

## Lần 2 — 22/11/2026 · kiểm G1 sau quyết định PO

Người chạy: phiên do PO giao; cũng là phiên đã tách thay đổi theo lệnh PO, nên lần này chỉ kiểm G1 và ghi quyết định, không chạy lại các phép kiểm của Lần 1. Mã nguồn: nhánh `e2e/pid-00034-playwright-fixtures`, commit `fafa1b6` (so với `d49cec6` của Lần 1 chỉ đổi `libs/ts/platform/src/errors/errors.spec.ts` về như `main`).

Quyết định PO áp dụng: trả lời câu hỏi “G1 của #59: xử lý thay đổi ở errors.spec.ts thế nào?” bằng “Tách ra PR platform” (22/11/2026).

| G Lần 1 | Trạng thái | Kiểm |
| --- | --- | --- |
| G1 | Đóng | `git diff origin/main...HEAD` không còn file nào dưới `libs/ts/platform/`; `errors.spec.ts` trùng `main`. Thay đổi chuyển sang PR #64 (nhánh `platform/errors-spec-413-inject`, tác giả giữ là Dev, nhờ code owner `T1xNTH` duyệt); `vitest run src/errors/errors.spec.ts` trên nhánh đó 5/5 đạt |
| G2 | Còn mở (MEDIUM) | PO xác nhận người làm PID-00034 và cập nhật sổ task-registry nếu đã giao lại |
| G3–G5 | Còn mở (MEDIUM) | Như Lần 1; G4, G5 chờ PO quyết |
| G6–G9 | Còn mở (LOW) | Không xử lý ở lần này |

YC1 trong `report.md` (sửa test platform theo “sửa đi” của người dùng trong phiên Dev) không còn hiệu lực trong PR này; `report.md` là file của Dev nên QC không sửa (G7).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
