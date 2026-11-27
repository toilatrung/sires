# PID-00160 — Báo cáo QC độc lập (mã, PR #130)

**Kết luận mới nhất:** ĐẠT — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 10 LOW (Lần 2, 27/11/2026, head `37a3f53`). F1 đã sửa đủ: `redirect_uris` dưới `/api/v1` (`0a3877c`) và `post_logout_redirect_uris` có `/sign-in` (`37a3f53`); ca chính AC05 chạy đúng; CI 25/25. Kết luận Lần 1 (CHƯA ĐẠT ở `0a3877c`) giữ ở mục Lần 1.

- **Ticket:** PID-00160. Hồ sơ đọc từ `origin/docs/pc-06-ph02` (`00a18c8`; hồ sơ PID-00160 sửa lần cuối ở `b92e821`, H8–H9), chưa vào `develop`.
- **Kết quả của Dev:** `agent/execution/PID-00160/{report,implement,self-qc}.md` trên nhánh PR.
- **Mã QC:** nhánh `infra/pid-00160-oidc-mock`, commit **`0a3877c3715ce07170bc5c87cd3b9aab2346ba5e`** (bằng `origin/infra/pid-00160-oidc-mock`). Gốc của nhánh là `origin/develop` `1aa6a70`, tức `develop` hiện tại, nên nhánh đã cập nhật với đích.

QC chạy độc lập với Dev: không sửa mã, không sửa `docs/`, không push, không comment trên GitHub. Mọi lệnh chạy trong worktree tạm, tách rời (`.claude/worktrees/qc-pid-00160`), xóa khi xong.

## Lần 1 — 27/11/2026 · spec-converge-skill (QC độc lập)

Người chạy: phiên QC do PO `toilatrung` giao. Máy: Windows 11, Node 24.21.0, pnpm 10.34.9; Docker Engine 29.8.2 trong WSL (API `tcp://localhost:2375`).

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-00160-AC05 (ca chính), EC10 · spec 4.1 (JSON `clients.local.json`), H8 · P5 · O8 · hợp đồng `POST /auth/logout` 303 (#120) · F1 bổ sung | contradicts | HIGH | `infra/local/oidc-mock/config/clients.local.json:6` có `["http://localhost:5173/", "http://localhost:3000/"]`, spec đòi `["http://localhost:5173/sign-in"]`. `config/clients.staging.example.json:6` có `https://staging.example.invalid/`, spec đòi `…/sign-in`. QC chạy mock bản build (`dist/`): `client_id` cùng `post_logout_redirect_uri=http://localhost:5173/sign-in` → 400, trang lỗi `invalid_request`, `post_logout_redirect_uri not registered`, log `end_session.error`. Image `sires/oidc-mock:local` đang có trong Docker cũng mang giá trị cũ | Đặt `post_logout_redirect_uris` của client cục bộ là `["http://localhost:5173/sign-in"]` (đúng spec 4.1), file mẫu staging là `["https://staging.example.invalid/sign-in"]`. Build lại image, chạy lại luồng thật vào container với `/sign-in` |
| G2 | PID-00160-AC05, EC10 · acceptance AC05 · S03 Kiểm | partial | MEDIUM | `test/flow.spec.ts:20` đặt `POST_LOGOUT = 'http://localhost:5173/'`. `:318-325`: ca `client_id` luôn kèm `state: 's2'` và không kiểm phải đăng nhập lại sau đăng xuất. Chưa có ca chính của AC05 theo H9: chỉ `client_id` và `post_logout_redirect_uri=/sign-in`, không `id_token_hint`, không `state`, chuyển tới đúng `http://localhost:5173/sign-in` (không query), rồi authorize lại thì form hiện ra. `test/config.spec.ts:188` khóa giá trị sai | Sửa cùng G1: `POST_LOGOUT = 'http://localhost:5173/sign-in'`; thêm ca `client_id` không `state`, kiểm URL chính xác và phải đăng nhập lại; giữ ca `id_token_hint` + `state=s1` → `…/sign-in?state=s1`; sửa `config.spec.ts:188` |
| G3 | S05 · spec 4.5 (`OIDC_POST_LOGOUT_REDIRECT_URI = http://localhost:5173/sign-in`), H7–H8 · O13 | contradicts | MEDIUM | `infra/local/oidc-mock/README.md:47`, `:70` ghi `http://localhost:5173/` hoặc `http://localhost:3000/`. `:49` ghi “hợp đồng không quy định URI này”, trái với hợp đồng logout của #120 (`post_logout_redirect_uri` là URL `/sign-in` của SIRes) và H8. PID-00038 sẽ lấy giá trị từ bảng này | Sửa bảng client, bảng “Gateway trỏ issuer” và câu căn cứ theo H8 |
| G4 | S05 · spec 4.5 (giới hạn issuer localhost khi gateway chạy trong container); C1 của QC hồ sơ | partial | LOW | `README.md:72` chỉ nói gateway chạy trên máy nên gọi `localhost:9400`. README chưa nói rõ khi gateway chạy trong container thì issuer `http://localhost:9400` không đúng, phải dùng tên riêng hay issuer https như staging. QC còn thấy endpoint trong discovery dựng theo host của request: gọi qua `127.0.0.1` thì `end_session_endpoint` là `http://127.0.0.1:…`, khác host của issuer | Thêm một câu giới hạn: endpoint theo `Host`/`X-Forwarded-Host`, gateway trong container cần tên riêng hay issuer https |
| G5 | S05 Làm (dòng `local/` của `infra/README.md`; `pnpm local:up --build` ở `scripts/development/README.md`) · O13 | partial | LOW | `infra/README.md:7` (dòng `local/`) chưa thêm OIDC mock; PR chỉ thêm dòng `local/oidc-mock/` ở `:11`. `scripts/development/README.md:38` có URL và liên kết, nhưng thiếu `pnpm local:up --build` sau khi đổi mã mock | Sửa dòng `local/`; thêm một câu `--build` |
| G6 | PID-00160-AC10 · test | partial | LOW | `test/flow.spec.ts:384`: regex `"s*:` thay vì `"\s*:`. Test vẫn đúng chỉ vì `JSON.stringify` không có khoảng trắng | Sửa thành `"\s*:` |
| G7 | PID-00160-AC04, EC09 | partial | LOW | `test/flow.spec.ts:280-290` vẫn đạt khi bỏ hàng đợi `serialTokenEndpoint` (`src/main.ts:39`): Dev tự ghi ở `self-qc.md` mục 1 và G5 | Giữ hàng đợi. Nếu muốn test bắt được, thêm độ trễ giả trong adapter khi test, không bắt buộc |
| G8 | O1, spec 4.3, 4.4 | unrequested | LOW | `package.json:23` thêm `@types/oidc-provider` 9.15.0 (dev). `src/config.ts:92`, `:96-98`, `:124-127` chặt hơn spec 4.4: khóa cookie ≥ 32 ký tự, từ chối `example.invalid`. Log có thêm `authorization.error`, `userinfo.error`, `server.started` (issuer, kid), `server.stopping` (`src/provider.ts:162-171`, `src/main.ts:155`, `:178`). Dev ghi lý do ở `implement.md` mục 3, nhưng `report.md` mục 5 ghi “Yêu cầu thêm: không có” | Chỉ để PO biết; không đề nghị gỡ |
| G9 | O10, EC16 (an toàn image) · quy tắc 1.4.7 (ghim phiên bản) | partial | LOW | `Dockerfile.dockerignore` không loại `.claude`. Build từ checkout chính đưa `.claude/worktrees/**` (bản sao repo, trừ `node_modules`, `dist`, `.env*`, `.sires`) và `.claude/settings.local.json` vào context và layer `build`. Không vào image cuối (`Dockerfile:20` chỉ chép `/out`), nhưng làm build chậm (Dev ghi khoảng 6 phút) và để file cục bộ trong cache build. `Dockerfile:9`, `:18` dùng `node:22-slim` theo mẫu `infra/docker/node/Dockerfile`, khác `.nvmrc` (24), không ghim digest (cùng tình trạng với mẫu và compose) | Thêm `.claude` vào `Dockerfile.dockerignore`. Node 22 và digest: theo mẫu chung của luồng infra, không chặn |
| G10 | Phụ thuộc PID-00159 (chặn S04, S05) · tham chiếu hồ sơ | partial | LOW | #125 (PID-00159, vào `main`), #112 (hồ sơ `docs/pc-06-ph02`), #120 (hợp đồng logout 303) đều còn OPEN. Liên kết `../../../docs/tickets/issues/PID-00160/` trong `report.md:5` chỉ đúng sau #112. Bundle trên `develop` (`docs/api-design/dist/openapi.bundled.yaml:161-176`) vẫn là `POST /auth/logout` 204 | PO xếp thứ tự merge #112, #120, #125 trước hoặc cùng #130. Sau khi #120 vào, G1 khớp cả hợp đồng trên nhánh đích |

### F1 (MEDIUM, QC hồ sơ) — trạng thái

| Phần của F1 | Trạng thái ở `0a3877c` | Bằng chứng |
| --- | --- | --- |
| `redirect_uris` dưới gốc `/api/v1` (`completeLogin` `GET /auth/callback`, servers `https://{host}/api/v1`) | **Đã sửa** | `config/clients.local.json:5` có `http://localhost:5173/api/v1/auth/callback`, `http://localhost:3000/api/v1/auth/callback`. `config/clients.staging.example.json:5` có `https://staging.example.invalid/api/v1/auth/callback`. `test/flow.spec.ts:19` (`CALLBACK`), `:211` (URI cũ `/auth/callback` và URI sai một ký tự → 400, không chuyển hướng). `test/config.spec.ts:187`, `README.md:46`, `:69` |
| Bổ sung sau QC #120 (nay là H8): `post_logout_redirect_uris` có `http://localhost:5173/sign-in`, AC05 theo đó | **Chưa sửa** | G1, G2, G3 |
| End-session khớp hợp đồng (303 tới `end_session_endpoint` kèm `client_id`, `post_logout_redirect_uri`; không `id_token_hint`, không `state`) | Cơ chế đúng, giá trị URI sai | Mock nhận `client_id` thay `id_token_hint` (EC10, `test/flow.spec.ts:318-321`). `GET` sau 303 chạy được; `POST` cũng được nhờ `postAsGet` (`src/main.ts:70`). Không có `state` thì chuyển tới URI không kèm query (theo oidc-provider). Chỉ URI `/sign-in` chưa đăng ký nên bị 400 |
| Lệch so với spec có ghi trong `report.md` không | Có ghi, căn cứ đã cũ | `report.md:60` (Lần 2): “`post_logout_redirect_uris` đã kiểm, giữ nguyên (trang gốc của web, hợp đồng không quy định)”. `self-qc.md:118` cũng vậy, dựa trên bundle của `develop` (`/auth/logout` 204). Dev đọc hồ sơ ở `ac1d5fd` (`report.md:15`). H8 vào hồ sơ ở `b92e821` (02:00:30), sau commit `0a3877c` (01:59:45). Phần `redirect_uris` thì lệch so với spec bản Dev đọc (`/auth/callback`); spec mục 7 cho phép lệch này và Dev đã ghi ở `report.md` Lần 2. Nay spec đã theo H8, nên phần này khớp |

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00160-AC01 | đạt | stub (mock trong tiến trình); QC chạy thêm bản build và image | `test/flow.spec.ts › discovery và JWKS` (`:119`) | Đạt trong 33/33. Image trong Docker: discovery từ Windows có `issuer` `http://localhost:9400`, `end_session_endpoint` `…/session/end`, PKCE `["S256"]` |
| PID-00160-AC02 | đạt | stub | `› đăng nhập code + PKCE, nonce trong ID token` (`:178`) | Đạt: callback `/api/v1/auth/callback` có state; nonce, `exp − iat = 900`, RS256 + kid, `expires_in` 900, có refresh, userinfo bằng claim |
| PID-00160-AC03 | đạt | stub | `› từ chối yêu cầu sai` (`:199`, `:220`, `:232`) | Đạt cả 7 ca, thêm ca URI cũ thiếu `/api/v1` |
| PID-00160-AC04 | đạt | stub | `› refresh xoay vòng, dùng lại thu hồi family` (`:266`, `:280`) | Đạt (G7: ca đồng thời không phân biệt có hàng đợi hay không) |
| PID-00160-AC05 | **một phần** | stub; QC thử bản build | `› đăng xuất RP-initiated` (`:308`, `:318`, `:327`) | Test đạt nhưng dùng URI `/`. Ca chính của acceptance (`client_id`, `post_logout_redirect_uri=http://localhost:5173/sign-in`, không `state`) bị 400 `post_logout_redirect_uri not registered` (G1, G2). Các ca còn lại đạt: `id_token_hint` + `state`, URI chưa đăng ký không chuyển hướng, không có URI thì trang “Đã đăng xuất khỏi OIDC mock”, POST như GET |
| PID-00160-AC06 | đạt | stub | `› thu hồi refresh token qua /revoke` (`:341`) | Đạt: 200; refresh sau đó `invalid_grant`; sai secret 401 `invalid_client` |
| PID-00160-AC07 | đạt | stub | `› hai tài khoản thử, sub ổn định` (`:361`); `config.spec.ts › file cục bộ hợp lệ` (`:179`) | Đạt |
| PID-00160-AC08 | đạt | stub và tiến trình thật | `config.spec.ts › chặn theo môi trường`, `› quy tắc staging`, `› issuer sai`, `› file mẫu staging…` | Đạt trong 33/33. QC chạy `node dist/main.js` với 5 cấu hình sai (không có `OIDC_MOCK_ENV`; `production`; staging với issuer http; issuer có `/` cuối; staging với nguyên file mẫu): mỗi lần thoát mã 1, in một dòng `oidc-mock: …` |
| PID-00160-AC09 | đạt một phần (phần QC kiểm được) | thao tác tay một phần; phần compose dựa vào ghi chép của Dev | thao tác tay | QC kiểm image `sires/oidc-mock:local` đang có, tạo lúc 2026-11-26T18:59:05Z. Hash `dist/*.js` và 4 file `config/` bằng bản build của QC từ `0a3877c` (sau khi bỏ CRLF). Kết quả: `uid=1000(node)`; `/app` chỉ có `README.md config dist node_modules package.json`; `find` không thấy `.env*`, `.sires`, `.git`, `provider-keys.env`; `NODE_ENV` rỗng. Container chạy như compose (`OIDC_MOCK_ENV=local`, `9400:9400`): discovery từ Windows đúng, lệnh healthcheck của compose trả 0. Chưa chạy `pnpm local:up --build` và `docker compose ps` (xem Lệnh) |
| PID-00160-AC10 | đạt | stub; log container | `› log không chứa token, mật khẩu, secret` (`:376`) | Đạt (G6: regex gõ sai nhưng vô hại). Log container của QC chỉ có `server.started` (issuer, port, kid), `server.stopping` và cảnh báo adapter bộ nhớ |

### Edge case

| EC | Trạng thái | Bằng chứng |
| --- | --- | --- |
| EC01 | đạt | `config.spec.ts:65` (thiếu, rỗng, `production`, `dev`); QC chạy `dist/main.js`, mã 1 |
| EC02 | đạt | `config.spec.ts:137-160`, 7 ca, kiểm thông báo không chứa mật khẩu; `src/seed.ts:66-88` |
| EC03 | đạt | `config.spec.ts:162-176`, gồm metadata bị oidc-provider từ chối; `src/provider.ts:149-155` |
| EC04 | đạt | `config.spec.ts:90-103`; `src/config.ts:49-61`, `:78-80` |
| EC05 | đạt | `config.spec.ts:105-135`; `src/config.ts:90-99`, `:112-129` (G8: chặt hơn spec) |
| EC06 | đạt | `flow.spec.ts:220`; `src/seed.ts:117-122` (SHA-256 + `timingSafeEqual`, băm giả khi email không có) |
| EC07 | đạt | `flow.spec.ts:140`; `src/provider.ts:147` (`proxy = true`) |
| EC08 | đạt | `flow.spec.ts:252` |
| EC09 | đạt (G7) | `flow.spec.ts:280` |
| EC10 | một phần | Nhận `client_id` (`flow.spec.ts:318`), nhưng chỉ với URI `/`; URI `/sign-in` theo hợp đồng bị 400 (G1, G2) |
| EC11 | đạt | `flow.spec.ts:295-306` gửi form của nút bằng fetch; `src/interactions.ts:146-153` có nút “Đăng xuất” và script tự gửi |
| EC12 | đạt | `flow.spec.ts:327-337` |
| EC13 | đạt (mã; thao tác tay của Dev) | `src/provider.ts:45-49`: kid ngẫu nhiên mỗi lần khởi động. Kid lần chạy của QC khác kid Dev ghi. Restart compose do Dev ghi (`self-qc.md:29`) |
| EC14 | đạt | `README.md:109` |
| EC15 | đạt (README; thao tác tay của Dev) | `README.md:100-107`; `self-qc.md:31` |
| EC16 | đạt (QC kiểm image) | `Dockerfile.dockerignore:4-12`; image không có `.env*`, `.sires`, `.git` (xem AC09). G9: context build có `.claude` |
| EC17 | đạt (QC kiểm) | `src/main.ts:177-184`. QC dừng container bằng API `stop` (SIGTERM): 461 ms, mã thoát 0, log `server.stopping` |

### Đầu ra (quy tắc 1.4.13) và an toàn

- Đường dẫn, tên file khớp Đầu ra của ticket và spec mục 3 (O1–O13): đủ 9 file `src/`, `package.json`, hai `tsconfig`, 4 file `config/`, hai test, `Dockerfile`, `Dockerfile.dockerignore`, `compose.yaml`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, ba README. Thêm `test/browser.ts`: spec mục 3 cho phép tách file nhỏ trong `test/`. Không có lệch `contradicts` về đường dẫn.
- Ranh giới: PR không sửa `apps/`, `libs/`, `infra/helm`, `infra/terraform`, `.github/workflows`, `local-env.mjs`, `docs/`. `check-tracks` báo `infra, repo`.
- Bí mật: trong phần thêm chỉ có `localhost`, `127.0.0.1`, `192.168.1.5` (ca test), `*.test`, `*.invalid`, `mock.invalid` và `github.com` (thư viện). Không có khóa, token hay host cổng trung gian. Mật khẩu, secret cục bộ là giá trị thử (`sires-local`, `sires-local-gateway-secret`); staging chặn chúng.
- Cookie key: ở local, thiếu thì sinh ngẫu nhiên 32 byte mỗi lần chạy (`src/config.ts:107`). Staging bắt buộc, mỗi khóa ≥ 32 ký tự (`:95-98`).
- Image: không có `.sires/`, `.env*`, `.git`; chạy bằng `USER node`; không đặt `NODE_ENV=production`. G9 về context build.
- Phiên bản: `oidc-provider` `9.15.0`, `@types/oidc-provider` `9.15.0` ghim chính xác trong package (chỉ package này dùng nên không vào catalog). Đây là cách 1.4.7 cho phép, có tiền lệ ở `apps/library`, `e2e`. Dev dependency còn lại dùng `catalog:`. Lockfile chỉ thêm mục (oidc-provider, koa và `@types/*` đi kèm), không đổi, không bớt mục nào.
- `pnpm-workspace.yaml`: chỉ thêm `infra/local/oidc-mock`. Có căn cứ ở O12, H2 (test chạy trong CI).
- Commit: 6/6 `verified: true` trên GitHub; không có dòng ghi công AI.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `git rev-parse origin/infra/pid-00160-oidc-mock` · `git merge-base HEAD origin/develop` | `0a3877c3715ce07170bc5c87cd3b9aab2346ba5e` · `1aa6a70` (bằng `origin/develop`) |
| `pnpm install --frozen-lockfile` | Đạt, 43,6 s (cảnh báo bỏ qua build script `cpu-features`, `protobufjs`, `ssh2`; có từ trước) |
| `pnpm nx show project @sires/oidc-mock` | root `infra/local/oidc-mock`; target `build`, `typecheck`, `lint`, `test`, `start`; tag `type:app`, `lang:ts`, `scope:infra` |
| `pnpm nx run @sires/oidc-mock:test --skip-nx-cache` | Đạt: 2 file, 33/33 test, 2,7 s |
| `pnpm nx run-many -t lint typecheck build -p @sires/oidc-mock --skip-nx-cache` | Đạt cả ba |
| `node dist/main.js` với 5 cấu hình sai (AC08) | Cả 5 lần thoát mã 1, mỗi lần in đúng một dòng lý do |
| Script QC: mock bản build, `GET /session/end` với `client_id` cùng `/sign-in` và cùng `/` | `/sign-in` → 400 `invalid_request` `post_logout_redirect_uri not registered`; `/` → 200, form tự gửi tới `/session/end/confirm` |
| `pnpm nx affected -t lint typecheck test build --base=origin/develop --exclude=agent-core,knowledge,eval,sires-common` (17 project TS) | Chạy có cache: hỏng giả do cache Nx cục bộ cũ. Lần 1: `contracts:build` không thấy `src/generated`. Lần 2: `@sires/testing`, `@sires/e2e` typecheck lỗi type cũ của contracts. Chạy lại `contracts`, `testing`, `e2e` với `--skip-nx-cache` thì đạt (13 test của testing). Chỉ `@sires/contracts:test` hỏng ở ca Python EC06, vì Smart App Control chặn `openapi-python-client` (os error 4551). PR không chạm `libs/`. Kết quả chạy lại toàn bộ không cache: xem dòng dưới |
| `pnpm nx affected … --skip-nx-cache --parallel=2` (17 project TS) | Mã 1. Hỏng 2 task, cả hai không do PR: `@sires/contracts:test` (ca Python EC06, Smart App Control) và `@sires/platform:test`. Lỗi của `platform:test` không in kết quả vitest, chỉ xảy ra khi chạy song song có tải; chạy riêng thì đạt 21 file, 172/172 test, và Nx đánh dấu task này flaky. Mọi lint, typecheck, build và các test còn lại của 17 project đạt, gồm `@sires/oidc-mock` 33/33 |
| 4 project Python (`agent-core`, `knowledge`, `eval`, `sires-common`) | Không chạy: Smart App Control chặn shim của uv trên máy này. CI `python` đạt |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu |
| `node scripts/development/check-tracks.mjs --base origin/develop` | `tracks touched: infra, repo`, mã 0 |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00160 --result` | KẾT QUẢ ĐỦ, 0 cảnh báo |
| `gh pr checks 130` (run 45880236242, `headSha` `0a3877c`) | 25/25 đạt (`tracks`, `build`, `typescript`, `python`, `contracts`, `secrets`, `images` ×12, …). PR `MERGEABLE`, `BLOCKED` (chờ duyệt) |
| `gh api …/pulls/130/commits` | 6 commit, đều `verified: true` |
| Docker API (WSL): kiểm image `sires/oidc-mock:local` có sẵn; chạy container như compose; lệnh healthcheck; `stop` | Xem AC09, EC16, EC17. QC xóa container tạm sau khi kiểm; image giữ nguyên |
| `pnpm local:up --build`, `docker compose -f infra/local/compose.yaml ps`, `docker compose restart oidc-mock` | Không chạy. Lý do: build image từ ổ Windows mất khoảng 6 phút (Dev ghi) trên máy 16 GB dùng chung, và Docker của máy đang chạy container của dự án khác (một `postgres:16-alpine`, một cụm kind), dễ đụng cổng của compose `sires-local`. Phần compose của AC09 (healthy cùng ba service cũ) dựa vào ghi chép của Dev (`self-qc.md:23-24`, `:111`). QC kiểm thay bằng image có sẵn, nội dung trùng `0a3877c` |

### Lệch với Self-QC

- **AC05.** `self-qc.md:45` ghi “Đạt”, `self-qc.md:118` và `report.md:60` ghi “`post_logout_redirect_uris` đã kiểm, giữ nguyên… hợp đồng không quy định”. QC thấy hồ sơ hiện hành (H8, spec 4.1, acceptance AC05, S05) và hợp đồng logout của #120 đều dùng `http://localhost:5173/sign-in`; mock từ chối URI này (400). Dev đọc hồ sơ `ac1d5fd` và bundle của `develop` (`/auth/logout` 204), trước khi H8 vào hồ sơ (`b92e821`, sau `0a3877c` 45 giây). Phần bổ sung `/sign-in` trong F1 của QC hồ sơ chưa tới được phiên Dev. QC: một phần (G1, G2).
- **Self-QC mục 4** ghi “Không còn khoảng trống CRITICAL, HIGH”. QC: còn 1 HIGH (G1).
- **EC10** Dev ghi “đã giải quyết”. QC: một phần, cùng nguyên nhân G1.
- **S05.** Dev ghi README “đủ”. QC: README sai giá trị sau đăng xuất (G3), thiếu câu giới hạn container (G4), hai README chung thiếu một ý mỗi cái (G5).
- **`report.md` mục 5 “Yêu cầu thêm: không có”.** Các phần thêm ở G8 có ghi ở `implement.md` mục 3 và `self-qc.md` G2, G3, nên không tính là giấu. QC chỉ nêu để PO biết.
- Phần còn lại khớp: 33/33 test, lint, typecheck, build, image (user `node`, không có bí mật), SIGTERM dưới 10 giây, log không lộ bí mật, CI xanh.

### Việc còn lại, theo thứ tự phụ thuộc

1. Sửa `post_logout_redirect_uris` thành `["http://localhost:5173/sign-in"]` (cục bộ) và `["https://staging.example.invalid/sign-in"]` (mẫu staging) (G1; PID-00160-AC05, spec 4.1, H8).
2. Sửa test theo URI mới và thêm ca chính của AC05: chỉ `client_id`, không `state`, chuyển tới đúng `http://localhost:5173/sign-in`, authorize lại phải đăng nhập. Sửa `config.spec.ts:188` (G2; AC05, EC10).
3. Sửa `README.md:47`, `:49`, `:70` theo H8 (G3; S05, spec 4.5).
4. Thêm giới hạn issuer khi gateway chạy trong container và việc endpoint dựng theo `Host` (G4); sửa dòng `local/` của `infra/README.md` và thêm `--build` ở `scripts/development/README.md` (G5).
5. Sửa regex `"\s*:` ở `flow.spec.ts:384` (G6); thêm `.claude` vào `Dockerfile.dockerignore` (G9).
6. Build lại image (`pnpm local:up --build`), chạy lại luồng thật vào container với `post_logout_redirect_uri=http://localhost:5173/sign-in` và chỉ `client_id`, rồi ghi `report.md` và `self-qc.md` Lần 3: bỏ câu “hợp đồng không quy định”, dẫn H8 và #120.
7. PO: xếp thứ tự merge #112 (hồ sơ), #120 (hợp đồng logout), #125 (PID-00159) với #130 (G10). G7, G8 không cần làm.

### Đề xuất cho PO

- Phiên điều phối gửi F1 cho Dev mà thiếu phần bổ sung `/sign-in`, và H8 vào hồ sơ sau commit cuối của Dev. Khi giao sửa theo QC, nên gửi nguyên văn mục phát hiện, gồm phần bổ sung, và chờ hồ sơ sửa xong mới giao Dev.
- Bundle trên `develop` vẫn là `/auth/logout` 204 tới khi #120 vào. Merge #120 (hay đồng bộ `develop`) trước hoặc cùng #130, để Dev và QC sau đọc cùng một hợp đồng.
- Không có đề xuất sửa spec.

## Lần 2 — 27/11/2026 · spec-converge-skill (QC độc lập)

Người chạy: phiên do PO giao (QC độc lập). Mã: **`37a3f53ad28ce3d176e6496983ef00c8c69baa4b`** (head của PR #130, bằng `origin/infra/pid-00160-oidc-mock`), một commit sau `0a3877c`: “OIDC mock đăng ký post_logout /sign-in theo hợp đồng POST /auth/logout (PID-00160 Lần 3)”. Commit này đổi 7 file: `config/clients.local.json`, `config/clients.staging.example.json`, `README.md`, `test/config.spec.ts`, `test/flow.spec.ts`, `agent/execution/PID-00160/{report,self-qc}.md`. Nguồn ý định như Lần 1. Hợp đồng logout đọc từ #120 (`docs/pc05-p1-p6-shell-sources`, vẫn OPEN): `303` tới `end_session_endpoint` kèm `client_id` và `post_logout_redirect_uri` là URL `/sign-in` của SIRes, không có `id_token_hint`.

### Hai thay đổi phiên điều phối yêu cầu kiểm

| Thay đổi | Head | Kết quả QC |
| --- | --- | --- |
| `redirect_uris` = `http://localhost:5173/api/v1/auth/callback`, `http://localhost:3000/api/v1/auth/callback` | `0a3877c` (giữ ở `37a3f53`) | Đúng hợp đồng `15-settings-and-sign-in.yaml` (callback dưới `/api/v1`). F1 phần callback: đã sửa |
| `post_logout_redirect_uris` thêm `http://localhost:5173/sign-in`, `http://localhost:3000/sign-in`; mẫu staging `https://staging.example.invalid/sign-in` | `37a3f53` | Đúng hợp đồng logout của #120 và H8. QC chạy ca chính của AC05 đúng như gateway gửi (chỉ `client_id`, `post_logout_redirect_uri=http://localhost:5173/sign-in`, không `state`): chuyển tới đúng `http://localhost:5173/sign-in`, không có query; lần authorize sau hiện form mật khẩu. Biến thể `:3000/sign-in` cũng đúng. F1 đã sửa đủ |

### Khoảng trống của Lần 1, trạng thái ở `37a3f53`

| G | Mức Lần 1 | Trạng thái | Bằng chứng |
| --- | --- | --- | --- |
| G1 | HIGH | **Đã sửa** | `config/clients.local.json:6` có `/sign-in` cho cả 5173 và 3000; `clients.staging.example.json:6` là `…/sign-in`; ca chính AC05 chạy đúng (bảng trên) |
| G2 | MEDIUM | **Còn một phần, hạ xuống LOW** | `test/flow.spec.ts:21` `POST_LOGOUT = …/sign-in`; `config.spec.ts:188` khóa giá trị mới. Còn thiếu test cho ca chính (chỉ `client_id`, không `state`, kiểm URL chính xác và phải đăng nhập lại): ca EC10 (`:319-328`) vẫn kèm `state: 's2'` và không kiểm đăng nhập lại. Hành vi đúng (QC đã chạy), chỉ thiếu test chặn |
| G3 | MEDIUM | **Đã sửa** | `README.md:47` có `/sign-in` cho cả hai cổng, `:49` dẫn `POST /auth/logout` (PC-05 P3), bỏ câu “hợp đồng không quy định”; `:70` `OIDC_POST_LOGOUT_REDIRECT_URI` = `http://localhost:5173/sign-in` |
| G4, G5, G6, G7, G8, G9 | LOW | Không đổi | Các file liên quan không nằm trong diff. G6: regex ở `flow.spec.ts:388` vẫn là `"s*:`. G9: `Dockerfile.dockerignore` vẫn chưa loại `.claude` |
| G10 | LOW | Không đổi | #120, #125, #112 vẫn OPEN |

### Khoảng trống mới

| G | Nguồn | Loại | Mức | Bằng chứng | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G11 | spec 4.1 (JSON `post_logout_redirect_uris: ["http://localhost:5173/sign-in"]`) | unrequested | LOW | `clients.local.json:6` đăng ký 4 URI: hai `/sign-in` và hai trang gốc (giữ lại cho tương thích, `report.md` Lần 3). URI khớp từng ký tự nên không mở rộng chuyển hướng tùy ý. Hợp đồng không dùng trang gốc | Tùy PO: bỏ hai trang gốc cho khớp spec 4.1, hoặc ghi vào hồ sơ là được giữ |
| G12 | S05, `compose.yaml:44` (“Sửa mã thì chạy pnpm local:up --build”) | partial | LOW | Image chép `config/` vào lúc build (`Dockerfile`, “Image chỉ có dist/, config/…”). Image `sires/oidc-mock:local` dựng trước `37a3f53` vẫn mang `post_logout_redirect_uris` cũ, nên `/sign-in` trả 400 tới khi dựng lại. Dev ghi “không build lại” (`self-qc.md` Lần 3). Ghi chú ở compose chỉ nói “sửa mã” | Ghi ở README (cùng G5) rằng đổi `config/` cũng phải `pnpm local:up --build`; dựng lại image trên máy Dev |

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `git rev-parse origin/infra/pid-00160-oidc-mock` | `37a3f53ad28ce3d176e6496983ef00c8c69baa4b` |
| `pnpm install --frozen-lockfile` (worktree tạm tách rời ở `37a3f53`) | Đạt, 16 s |
| `pnpm nx run @sires/oidc-mock:test --skip-nx-cache` | Đạt: 2 file, 33/33 test |
| `pnpm nx run-many -t lint typecheck build -p @sires/oidc-mock --skip-nx-cache` | Đạt cả ba |
| Spec tạm của QC (bản sao `flow.spec.ts` thêm một ca, không commit, đã xóa): chỉ `client_id` + `/sign-in`, không `state`; rồi `client_id` + `:3000/sign-in` | 1/1 đạt: `Location` đúng `http://localhost:5173/sign-in` và `http://localhost:3000/sign-in`; authorize lại hiện form mật khẩu |
| `gh pr view 130` (`statusCheckRollup`) | **25/25 SUCCESS** ở head `37a3f53`; `MERGEABLE`, `BLOCKED` (chờ duyệt) |
| `gh api …/commits/37a3f53` | `verified: true` |
| Image và container (`pnpm local:up --build`, luồng thật vào container) | Không chạy: build image khoảng 6 phút trên máy 16 GB dùng chung. Xem G12 |

Worktree QC tạm đã xóa. QC không sửa mã, không push, không comment trên GitHub.

### Kết luận Lần 2

**ĐẠT** ở `37a3f53`: 0 CRITICAL, 0 HIGH, 0 MEDIUM; còn 10 LOW (G2 hạ mức, G4–G12). F1 đã sửa đủ: callback ở `0a3877c`, URI sau đăng xuất ở `37a3f53`. Nên làm trước khi merge, không chặn: test ca chính AC05 (G2) và câu `--build` khi đổi `config/` (G12). Thứ tự merge với #120, #125, #112 vẫn chờ PO (G10).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See LICENSES.md.
