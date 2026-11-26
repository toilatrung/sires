# PID-00160 — Self-QC của Dev

**Kết luận:** Đạt

- **Ticket:** [PID-00160](../../../docs/tickets/issues/PID-00160/index.html) · **Báo cáo:** [report.md](report.md) · **Triển khai:** [implement.md](implement.md)
- **Cập nhật:** 27/11/2026

Chỉ ghi kết quả thật của lệnh đã chạy. Không chạy được thì ghi “không chạy — lý do”. Test lỗi là lỗi, không ghi “đạt”. Lần chạy sau cập nhật kết luận và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Máy: Windows 11, Node 24.21.0, pnpm 10.34.9; Docker Engine 29.8.2 trong WSL `Ubuntu-24.04`. Hồ sơ đọc từ `origin/docs/pc-06-ph02` (`ac1d5fd`), chưa vào `develop`.

## 1. Lệnh

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install`, `pnpm install --frozen-lockfile` | Đạt; `pnpm-lock.yaml` sinh lại bằng `pnpm install`, không sửa tay |
| `pnpm nx show project @sires/oidc-mock` | root `infra/local/oidc-mock`; target `build`, `typecheck`, `lint`, `test`, `start`; tag `type:app`, `lang:ts`, `scope:infra` |
| `pnpm nx run-many -t lint typecheck test build -p @sires/oidc-mock --skip-nx-cache` | Đạt; test 2 file, 33/33 |
| Đột biến: `pkce.required` → `false` | `flow.spec.ts › thiếu PKCE…` đỏ (bắt được) |
| Đột biến: bỏ hàng đợi `POST /token` | `› hai refresh đồng thời…` vẫn đạt 3/3 lần (test không phân biệt; xem `implement.md` mục 3) |
| `pnpm nx affected -t lint typecheck test build --base=origin/develop` | 21 project affected (`pnpm-workspace.yaml`, `pnpm-lock.yaml` là input chung). Trên máy này: Python (`agent-core`, `knowledge`, `eval` test, typecheck; `@sires/contracts:generate-python`) **không chạy được** — Smart App Control chặn shim của uv (`openapi-python-client`, `pytest`: “An Application Control policy has blocked this file”); `@sires/contracts:generate-ts` lần đầu `EPERM` vì Nx daemon của worktree giữ `libs/ts/contracts/src/generated` |
| `NX_DAEMON=false pnpm nx run-many -t lint typecheck test build --exclude=agent-core,knowledge,eval,sires-common` (sau `nx daemon --stop`) | Mọi project TypeScript đạt (gồm `@sires/oidc-mock` 33/33), trừ `@sires/contracts:test`: ca Python EC06 sinh client bằng `openapi-python-client` bị Smart App Control chặn; PR không chạm `libs/ts/contracts`. Phần Python để CI (Linux) chạy |
| `pnpm local:up --build` (AC09) | Mã 0; `minio`, `oidc-mock`, `postgres`, `rabbitmq` Healthy; build lần đầu khoảng 6 phút (chuyển context từ ổ Windows, cài phụ thuộc trong image) |
| `docker compose -f infra/local/compose.yaml ps` | `oidc-mock Up (healthy)` cùng ba service cũ |
| `curl http://localhost:9400/.well-known/openid-configuration` (từ Windows) | `issuer` `http://localhost:9400`, `authorization_endpoint` `…/authorize`, `end_session_endpoint` `…/session/end`, `code_challenge_methods_supported` `["S256"]` |
| `docker run --rm --entrypoint id sires/oidc-mock:local` | `uid=1000(node) gid=1000(node)` |
| `docker run --rm --entrypoint sh sires/oidc-mock:local -c "ls -a /app; find / -name provider-keys.env -o -name '.env*' -o -name .sires -o -name .git"` (EC16) | `/app`: `README.md config dist node_modules package.json`; `find` không in gì |
| Luồng thật vào container (script tạm: authorize → đăng nhập B → `/token` Basic → `/userinfo` → `/session/end`) | Callback `http://localhost:5173/auth/callback`, state khớp; ID token `iss` `http://localhost:9400`, `aud` `sires-gateway-local`, `sub` `sires-mock-b`, nonce khớp, `exp − iat` 900; `expires_in` 900, có refresh token; userinfo đúng claim; đăng xuất về `http://localhost:5173/?state=z9` |
| `docker compose restart oidc-mock` (EC13) | kid trước `XMlyiNpoow4r3q4U`, sau `oB4XEh89OnE8VuOs` |
| `docker compose stop oidc-mock` (EC17) | 1,59 s; log `server.stopping` SIGTERM |
| `stop` rồi `start` (EC15) | Discovery khi dừng: không kết nối được; sau `start`: 200 |
| `docker compose logs oidc-mock` | Chỉ dòng JSON sự kiện (`server.started`, `interaction.ended`, `grant.success`, `end_session.success`, `server.stopping`) và cảnh báo adapter bộ nhớ của oidc-provider; không có token, code, mật khẩu |
| `node scripts/docs/add-license.mjs --check` | 0 file thiếu |
| `check-tracks.mjs --stdin` trên file đã đổi | `infra, repo` — một luồng |
| `check-ui.mjs`, preview | Không áp dụng: trang của mock không phải màn của SIRes (spec 4.5) |

## 2. AC → test

| AC | Test | Kết quả |
| --- | --- | --- |
| PID-00160-AC01 | `test/flow.spec.ts › discovery và JWKS` | Đạt |
| PID-00160-AC02 | `test/flow.spec.ts › đăng nhập code + PKCE, nonce trong ID token` | Đạt |
| PID-00160-AC03 | `test/flow.spec.ts › từ chối yêu cầu sai` (3 test, 7 ca) | Đạt |
| PID-00160-AC04 | `test/flow.spec.ts › refresh xoay vòng, dùng lại thu hồi family` (2 test) | Đạt |
| PID-00160-AC05 | `test/flow.spec.ts › đăng xuất RP-initiated` (3 test: id_token_hint; client_id và POST; URI chưa đăng ký, không có URI) | Đạt |
| PID-00160-AC06 | `test/flow.spec.ts › thu hồi refresh token qua /revoke` | Đạt |
| PID-00160-AC07 | `test/flow.spec.ts › hai tài khoản thử, sub ổn định`; `test/config.spec.ts › file cục bộ hợp lệ` | Đạt |
| PID-00160-AC08 | `test/config.spec.ts › chặn theo môi trường`, `› quy tắc staging`, `› issuer sai`, `› file mẫu staging bị từ chối khi chưa thay chỗ giữ chỗ` | Đạt (8 ca của AC, kèm kiểm cổng không nghe) |
| PID-00160-AC09 | Thao tác tay ở mục 1 | Đạt |
| PID-00160-AC10 | `test/flow.spec.ts › log không chứa token, mật khẩu, secret`; log của container ở mục 1 | Đạt |

## 3. Edge case

| # | Trạng thái | Cách giải quyết (test) hoặc lưu ý (vì sao, ai xử lý) |
| --- | --- | --- |
| EC01 | đã giải quyết | `config.spec.ts › chặn theo môi trường` |
| EC02 | đã giải quyết | `config.spec.ts › file tài khoản sai` (7 ca) |
| EC03 | đã giải quyết | `config.spec.ts › file client sai` (JSON, rỗng, thiếu, trùng; metadata oidc-provider từ chối) |
| EC04 | đã giải quyết | `config.spec.ts › issuer sai` |
| EC05 | đã giải quyết | `config.spec.ts › quy tắc staging`, `› file mẫu staging…` |
| EC06 | đã giải quyết | `flow.spec.ts › sai mật khẩu, email không có…` |
| EC07 | đã giải quyết | `flow.spec.ts › sau proxy https…` (staging, `X-Forwarded-Proto`, `X-Forwarded-Host`) |
| EC08 | đã giải quyết | `flow.spec.ts › phiên mock dùng lại` |
| EC09 | đã giải quyết | `flow.spec.ts › hai refresh đồng thời…`; hàng đợi `POST /token` |
| EC10 | đã giải quyết | `flow.spec.ts › chỉ có client_id; POST cho kết quả như GET` |
| EC11 | đã giải quyết | `endSession()` trong `flow.spec.ts` gửi form bằng fetch như khi tắt JS; trang có nút “Đăng xuất” |
| EC12 | đã giải quyết | `flow.spec.ts › post_logout_redirect_uri chưa đăng ký…` |
| EC13 | đã giải quyết | Thao tác tay: kid khác sau restart; README ghi |
| EC14 | đã giải quyết | README mục “Giả lập IdP không khả dụng, đổi cổng” |
| EC15 | đã giải quyết | Thao tác tay stop/start; README ghi |
| EC16 | đã giải quyết | `Dockerfile.dockerignore`; thao tác tay `find` |
| EC17 | đã giải quyết | Thao tác tay: stop 1,59 s |
| Mới | cần lưu ý | oidc-provider 9 tắt POST cho `end_session` trừ khi cookie `SameSite=None`; mock chuyển POST thành GET. POST chéo site ở staging không mang cookie phiên của mock: gateway dùng GET |
| Mới | cần lưu ý | Đăng xuất ở mock không thu hồi refresh token đã cấp (refresh 30 ngày không gắn phiên, giống FakeOidcProvider); README ghi gateway gọi `/revoke` |

## 4. Tự kiểm

- [x] Mọi slice đã chạy lệnh ở mục “Kiểm”, kết quả ở trên.
- Agent đề xuất, System kiểm soát, Researcher quyết định: không áp dụng.
- Chuyển trạng thái PRD 18.2: không áp dụng.
- Context cách ly theo project và task: không áp dụng.
- Gọi model qua Model Gateway: không áp dụng.
- [x] Không import mã, không đọc database của service khác: mock không phụ thuộc package nào của workspace.
- Sự kiện qua outbox: không áp dụng.
- Migration: không áp dụng.
- Giao diện theo `docs/ui-design/design.md`: không áp dụng (spec 4.5: trang của mock không theo design system).
- [x] Không sửa `apps/`, `libs/`, `infra/helm`, `infra/terraform`, `.github/workflows`, `scripts/development/local-env.mjs`, `docs/`; không ghi tên miền, URL staging thật, secret staging, key provider vào repo.
- [x] Không làm việc ngoài phạm vi; thay đổi ngoài hồ sơ ở `report.md` mục 5.
- [x] Không còn mã gỡ lỗi; `process.stdout.write` là log sự kiện.
- [x] Đã tự chạy `spec-converge-skill` trên ticket này (mục 5); không còn khoảng trống CRITICAL, HIGH.

## 5. Tự đối chiếu (spec-converge-skill, DEC-58)

| G | Loại | Mức | Mô tả | Bằng chứng (file:dòng, lệnh) | Đã xử lý |
| --- | --- | --- | --- | --- | --- |
| G1 | partial | LOW | Phụ thuộc PID-00159 (chặn S04, S05) chưa merge khi làm; S04, S05 làm trên `develop` hiện tại | `infra/local/compose.yaml`; hai README | PID-00159 không sửa `compose.yaml`; dòng mới ở hai README đặt xa chỗ PID-00159 sửa, merge thử nhánh `infra/pid-00159-local-roles` vào nhánh này không xung đột |
| G2 | unrequested | LOW | `@types/oidc-provider` 9.15.0 (dev) ngoài danh sách dev của O1 | `infra/local/oidc-mock/package.json` | Cần để typecheck strict; ghi `implement.md` mục 3 |
| G3 | unrequested | LOW | Staging: khóa cookie ≥ 32 ký tự, từ chối issuer hay URI `example.invalid` | `src/config.ts` | Chặt hơn spec 4.4 để file mẫu không chạy nguyên trạng; README ghi |
| G4 | partial | LOW | `Dockerfile.dockerignore` thêm `**/dist`, `docs`, `agent`, `assets` ngoài “như mẫu, thêm .sires” | `infra/local/oidc-mock/Dockerfile.dockerignore` | Chỉ bớt context (không cần để build); build lại đạt |
| G5 | partial | LOW | Test EC09 không phân biệt có hay không hàng đợi `POST /token` | Đột biến ở mục 1 | Giữ hàng đợi; ghi `implement.md` mục 3 |
| G6 | partial | LOW | Liên kết từ `agent/execution/PID-00160/` tới `docs/tickets/issues/PID-00160/` chỉ đúng khi hồ sơ (PR #112, nhánh `docs/pc-06-ph02`) vào `develop` | `report.md` dòng Ticket | PO merge hồ sơ |

## Lần 2 — 27/11/2026

Sửa theo QC độc lập hồ sơ (PR #121, F1 MEDIUM, phiên điều phối chuyển): `redirect_uris` theo hợp đồng gateway `docs/api-design/paths/15-settings-and-sign-in.yaml` — `/auth/callback` dưới base `/api/v1` của `openapi.yaml` (`servers: https://{host}/api/v1`; web chuyển `/api` sang gateway). Mục này theo PC-05 P37.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm exec tsc -p tsconfig.json`, `pnpm exec eslint .` (trong `infra/local/oidc-mock`) | Đạt |
| `pnpm exec vitest run` | 2 file, 33/33 đạt; `› thiếu PKCE, PKCE plain, redirect_uri chưa đăng ký` thêm ca URI cũ `http://localhost:5173/auth/callback` (thiếu `/api/v1`) → trang lỗi 400, không chuyển hướng |
| `docker compose -f infra/local/compose.yaml up -d --wait --build oidc-mock` | Mã 0, 80 s, Healthy; `config/clients.local.json` trong container có URI mới |
| Luồng thật vào container (authorize → đăng nhập B → `/token` → `/userinfo` → `/session/end`) | Callback `http://localhost:5173/api/v1/auth/callback`, state khớp; ID token, userinfo như Lần 1; đăng xuất về `http://localhost:5173/?state=z9` |

| Mục | Đã xử lý |
| --- | --- |
| `redirect_uris` cục bộ | `http://localhost:5173/api/v1/auth/callback`, `http://localhost:3000/api/v1/auth/callback` (`config/clients.local.json`, `test/flow.spec.ts`, `test/config.spec.ts`, README) |
| `redirect_uris` mẫu staging | `https://staging.example.invalid/api/v1/auth/callback` (`config/clients.staging.example.json`) |
| `post_logout_redirect_uris` | Đã kiểm, giữ `http://localhost:5173/`, `http://localhost:3000/`: sau đăng xuất trình duyệt về trang gốc của web, không phải route API; hợp đồng `/auth/logout` (POST, 204) không quy định URI này. README ghi căn cứ |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
