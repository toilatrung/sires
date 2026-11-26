# PID-00160 — Báo cáo QC độc lập

**Kết luận mới nhất:** Hồ sơ đủ để làm — 0 CRITICAL, 0 HIGH, 2 MEDIUM, 3 LOW (Lần 1, 27/11/2026). 10 AC đều có test, slice, kiểm thử được; 17 EC đều có cách xử lý, test hoặc thao tác tay, slice; Output O1–O13 đều có bước. Khớp D-OIDC: mock thay eTroy ở cục bộ và staging, không bao giờ production, đăng xuất tới `end_session_endpoint`. Nên sửa F1 trước khi Dev làm S01: `redirect_uris` của client cục bộ là `…/auth/callback`, trong khi hợp đồng, kiến trúc F-01 và SPK-02 dùng `/api/v1/auth/callback`. F2: H6 dẫn D-BRANCH và PC-06, mà hai thứ này chỉ có ở PR #112.

- **Ticket:** [PID-00160](../../../docs/tickets/issues/PID-00160/index.html)
- **Kết quả của Dev:** chưa có (hồ sơ chưa giao Dev); `report.md`, `implement.md`, `self-qc.md` sẽ nằm trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 27/11/2026 · spec-analyze-skill

Người chạy: phiên QC do PO `toilatrung` giao, theo yêu cầu của phiên điều phối. Nguồn: nhánh `docs/pid-00160-oidc-mock`, đầu nhánh `d4184b0` (`d4184b0e7432d33c46ee40d5e25fa414d7427996`), 1 commit, gốc `origin/main` `c9e745b` (nhánh đã cập nhật với `main`). PR sửa 20 file, đều thuộc `docs/` hoặc taskboard: hồ sơ PID-00160 (11 file), PID-00161 (4 file), `docs/tickets/index.html`, `docs/tickets/issues/index.html`, taskboard, `docs/docs_context.md`.

Căn cứ đối chiếu:
- D-OIDC (PO, 26/11/2026, nguyên văn ở `docs/docs_context.md` nhật ký 27/11/2026: “OIDC viết mockup server để test chứ chưa cần dùng OIDC thật”), ủy quyền “chốt theo đề xuất”.
- PRD INT-OIDC-001–004, ASM-13; kiến trúc F-01 (`04-runtime-flows.html`).
- `docs/api-design/openapi.yaml` (servers `/api/v1`), `paths/15-settings-and-sign-in.yaml`.
- Database 12.2 (retention `gateway.session`), 3.2, `00-common.sql` (`_purge`).
- Kế hoạch 1.4.7 (catalog), `check-tracks.mjs`; AGENT.md (DEC-59).
- Mã hiện có mà spec dẫn: `scripts/development/local-env.mjs`, `infra/local/compose.yaml`, `pnpm-workspace.yaml`, `infra/docker/node/`, `e2e/package.json`, `libs/ts/testing/src/fakes/oidc.fake.ts`, `apps/web/vite.config.ts`, `tsconfig.base.json`, `eslint.config.mjs`.
- Spike SPK-02 (`apps/gateway/spikes/spk-02/flow.spec.ts`); guard gateway ở PR #63.

### Phát hiện

| Mã | Nhóm | Mức | Chỗ | Mô tả | Đề xuất |
| --- | --- | --- | --- | --- | --- |
| F1 | F. Mâu thuẫn | MEDIUM | `specs/index.html` 4.1 (JSON `clients.local.json`: `redirect_uris` `http://localhost:5173/auth/callback`, `http://localhost:3000/auth/callback`); `specs/acceptance.html` AC02 (1); `specs/slices/S05-readme.html`; spec 2.1 ghi hợp đồng là `/auth/login, /auth/callback, /auth/logout` | Hợp đồng đặt `servers: https://{host}/api/v1`, nên callback thật là `/api/v1/auth/callback`. Cùng đường này có ở: kiến trúc F-01 (“eTroy redirect về /api/v1/auth/callback”), SPK-02 (`REDIRECT_URI = 'http://localhost:3000/api/v1/auth/callback'`), guard gateway ở PR #63 (`PUBLIC_PATHS` có `/api/v1/auth/callback`). PID-00014 H8 từng sửa đúng lỗi bỏ gốc `/api/v1` này. Test của mock vẫn đạt với URI nào đã đăng ký, vì openid-client trong test đóng vai gateway. Nhưng khi PID-00038 nối vào, so khớp từng ký tự (K13) sẽ từ chối callback thật. Spec mục 7 cho Dev sửa `clients.local.json` trong luồng infra, nên điểm này không chặn | Trước khi Dev làm S01, PO (hoặc phiên ph02-plan) sửa 3 file thành `http://localhost:5173/api/v1/auth/callback`, `http://localhost:3000/api/v1/auth/callback`, và ghi hợp đồng ở 2.1 là `/api/v1/auth/…`. **Bổ sung sau QC #120:** hợp đồng `POST /auth/logout` ở #120 đặt `post_logout_redirect_uri` là URL `/sign-in` của SIRes (route web của shell). Vì vậy `post_logout_redirect_uris` của client cục bộ phải có `http://localhost:5173/sign-in`, thay hoặc thêm vào `http://localhost:5173/`. AC05 (`post_logout_redirect_uri=http://localhost:5173/`) sửa theo. Gateway của #120 gửi `client_id`, không gửi `id_token_hint`: khớp nhánh “chỉ có `client_id`” (EC10) của mock |
| F2 | F. Mâu thuẫn (tạm thời) | MEDIUM | Trang ticket H6 (“pull request mã vào develop … ngoại lệ ‘chờ mốc’ của DEC-59, D-BRANCH”); “Căn cứ” và “Phải sửa ở nguồn” (PC-06 mục C, G4, B3) | D-BRANCH và PC-06 (`docs/overview/phieu-chot-ph02.html`) chỉ có ở PR #112, chưa merge. Nếu chỉ #121 vào `main`, H6 trái với AGENT.md trên `main` (DEC-59: PR vào `main` tới mốc cổng PH-01; ticket PH-02 xong trước mốc thì chờ mốc), và các tham chiếu PC-06 trỏ tới tài liệu chưa có. #112 chứa commit `d4184b0` của #121; QC thử gộp `main` + #121 + #112: không xung đột | Merge #112 ngay sau #121 (hoặc merge #112 thay #121, vì #112 đã gồm cả #121). Nếu #112 còn chờ lâu, báo phiên local-env-oidc mở PR theo AGENT.md hiện hành cho tới khi D-BRANCH vào `main` |
| B1 | B. Mơ hồ, rủi ro thực hiện | LOW | AC04 (“hai refresh đồng thời … đúng một lần thành công”), EC09 | Kết quả này phụ thuộc việc tiêu thụ refresh token của `oidc-provider` có nguyên tử trên adapter bộ nhớ hay không. Nếu hai yêu cầu cùng qua bước kiểm trước khi một bên tiêu thụ, cả hai có thể thành công. Đây là suy luận của QC, chưa thử. Mục 7 (“oidc-provider không làm được … dừng, Cần PO”) đã có đường xử lý | Dev thử ca đồng thời sớm ở S03. Nếu không bảo đảm được, PO chốt điều kiện “tối đa một lần thành công, hoặc cả family bị thu hồi” |
| C1 | C. Thiếu đặc tả | LOW | O11 (`OIDC_MOCK_ISSUER=http://localhost:9400` trong compose) | Hiện đúng, vì service SIRes chạy trên máy (ngoài compose) và trình duyệt cùng gateway đều tới được `localhost:9400`. Nếu sau này gateway chạy trong compose thì `localhost` trong container không phải mock | README của mock (S05) nên ghi giới hạn này. PID-00035 và PID-00038 dùng tên riêng hoặc issuer https như staging |
| A1 | Câu chữ | LOW | O1 “`pnpm nx show project @sires/oidc-mock` có bốn target” | O1 cũng đòi script `start`, nên Nx sẽ suy ra 5 target. B1 ghi đúng: “có target build, typecheck, lint, test” | Đổi thành “có ít nhất các target build, typecheck, lint, test” |

Không có CRITICAL, HIGH. Không có vi phạm nguyên tắc:
- Một luồng (`infra/`, `pnpm-workspace.yaml` đều là luồng infra theo `check-tracks.mjs`), một `PH-02`.
- Không sửa `apps/`, `libs/`, `local-env.mjs`, `docs/` trong phần Dev làm.
- Không có gọi model, API key, database hay sự kiện.
- Test của service vẫn dùng FakeOidcProvider (1.4.4).
- Không cấp mã toàn cục.

### Đối chiếu với mã, tài liệu hiện có

| Khẳng định của spec | Kết quả |
| --- | --- |
| `local-env.mjs` up = `docker compose up -d --wait`, tham số thêm (`--build`) đi thẳng vào compose | Đúng (`ACTIONS.up`, `...extra`) |
| Compose có postgres, rabbitmq, minio; cổng 9400 không trùng | Đúng (5432, 5672, 15672, 9000, 9001) |
| Workspace `apps/*`, `libs/ts/*`, `e2e`; `openid-client` có trong catalog | Đúng (`openid-client: 6.8.8`) |
| `infra/docker/node/Dockerfile`, `Dockerfile.dockerignore` làm mẫu | Có |
| Web 5173, chuyển `/api`, `/auth`, `/events` tới gateway 3000 | Đúng |
| `oidc.fake.ts`: token 900 giây | Đúng (`accessTokenTtlSeconds ?? 900`) |
| Ghim `oidc-provider` ngoài catalog vì chỉ một package dùng (1.4.7) | Hợp quy tắc (“phiên bản dùng chung khai một chỗ”); có tiền lệ `apps/library` (`@citation-js/*`), `e2e` (`yaml`) |
| `type: module` kế thừa `tsconfig.base.json` | Hợp: base là `module`, `moduleResolution` `NodeNext`; `e2e` cũng `type: module` |
| ESLint: `type:app` chỉ phụ thuộc `type:lib` | Mock không import lib nào, không vướng |
| PID-00161: retention 30 ngày, nhãn Đề xuất (database 12.2); `_purge` có DELETE, BYPASSRLS (`00-common.sql`) | Đúng |

### Độ phủ

| Mục | Số | Thiếu |
| --- | --- | --- |
| AC PID-00160 có test (file › tên) và slice | 10/10 | 0. AC09 thao tác tay (compose, image), đúng tính chất |
| EC có cách xử lý, test hoặc thao tác tay, slice | 17/17 | 0 |
| Output O1–O13 thuộc bước B1–B6 | 13/13 | 0 |
| Slice có AC | 4/5 | S05 là tài liệu, không có AC: hợp lệ, QC đọc theo danh mục 4.5 |
| P1–P7 có slice; N1–N9 có lý do, nơi nhận | 7/7; 9/9 | 0 |

PID-00161 ở mức đề xuất: trang ticket và spec đủ cho bước làm rõ; 3 AC kiểm thử được; còn hỏi thời gian giữ và cách chạy Job. `check-pid` báo 5 lỗi, 2 cảnh báo, đúng với trạng thái “Chưa sẵn sàng”. Đây là trạng thái chờ, không phải lỗi hồ sơ.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00160` | ĐỦ để thực thi (0 cảnh báo): 10 AC có slice, 17 EC, trạng thái Sẵn sàng |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00161` | CHƯA ĐỦ (5 lỗi, 2 cảnh báo), đúng với trạng thái Chưa sẵn sàng |
| `node scripts/docs/update-index.mjs --check` | Khớp: 161 PID, 15 đợt; issues, taskboard, `docs/index.html` khớp |
| `node scripts/docs/add-license.mjs --check` | 0 thiếu |
| `node agent/skills/po/scaffold-docs-skill/scripts/check-docs.mjs docs/tickets` | 928 file, 0 lỗi |
| Kiểm id trùng, liên kết và anchor nội bộ của 16 file HTML đổi (script riêng của QC) | 0 lỗi |
| Thử gộp `main` + #121, rồi + #112 | Không xung đột; `d4184b0` là tổ tiên của đầu #112 (`ac1d5fd`) |
| Sổ `task-registry`, taskboard | PID-00160 `infra`, PH-02, `congminh1705`; PID-00161 `gateway`, PH-02, `T1xNTH`; đăng ký 27/11/2026 |
| Quét key, host cổng trung gian (giá trị đọc từ file key của máy, chỉ đếm) trong `git log -p`, mô tả, comment PR | 0 |
| URL, host trong phần thêm | Chỉ có `localhost`, `127.0.0.1`, `*.test`, `*.invalid`, `example`, và `https://github.com/panva/node-oidc-provider` (thư viện) |
| Giá trị thử | `sires-local` (7), `sires-local-gateway-secret` (3), `CHANGE-ME` (7): đều là giá trị thử của mock cục bộ hoặc chỗ giữ chỗ, spec 4.4 cấm dùng ở staging. Tên tài khoản thử là tên giả, email miền `.test` |
| `gh api repos/toilatrung/sires/pulls/121/commits` | 1/1 `verified: true`; không có dòng ghi công AI trong commit, mô tả |
| `gh pr checks 121` (run 45869983562 trên `d4184b0`) | 25/25 đạt |

### Bước tiếp theo

1. PO merge #121, rồi merge #112 sớm (F2).
2. Trước khi Dev làm S01: sửa F1 trong hồ sơ (3 file `docs/`, PO hoặc phiên ph02-plan), hoặc báo phiên local-env-oidc dùng `/api/v1/auth/callback` và ghi lệch vào `report.md` theo spec mục 7.
3. B1, C1, A1: không chặn. Gửi kèm cho Dev.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
