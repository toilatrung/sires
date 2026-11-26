# PID-00160 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00160](../../../docs/tickets/issues/PID-00160/index.html) · **Luồng:** `infra` · **Giai đoạn:** PH-02
- **Người làm:** phiên do PO `toilatrung` giao, làm thay assignee `congminh1705`
- **Nhánh:** `infra/pid-00160-oidc-mock` (từ `origin/develop` `1aa6a70`) · **PR:** [#130](https://github.com/toilatrung/sires/pull/130) vào `develop` (D-BRANCH; H6)
- **Cập nhật:** 27/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 5/5 xong. Bị chặn: không có. Hồ sơ đọc từ nhánh `docs/pc-06-ph02` (`ac1d5fd`, trạng thái Sẵn sàng), chưa vào `develop`.
- AC: 10/10 đạt — AC01–AC08, AC10 bằng test tự động (33 test), AC09 bằng thao tác tay trên compose của máy.
- Edge case: 17/17 đã giải quyết; 2 lưu ý mới (POST `end_session`; đăng xuất không thu hồi refresh token).
- Yêu cầu thêm: không có ngoài hồ sơ. Phụ thuộc PID-00159 (chặn S04, S05) chưa merge: xem mục 6.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Package, cấu hình, chặn theo môi trường, file client và tài khoản | Xong | tạo: `infra/local/oidc-mock/package.json`, `tsconfig.json`, `tsconfig.build.json`, `src/config.ts`, `src/seed.ts`, `config/clients.local.json`, `config/accounts.local.json`, `config/clients.staging.example.json`, `config/accounts.staging.example.json`, `test/config.spec.ts`, `test/browser.ts`; sửa: `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
| S02 | Discovery, JWKS, đăng nhập, token, userinfo | Xong | tạo: `src/provider.ts`, `src/interactions.ts`, `src/main.ts`, `test/flow.spec.ts` |
| S03 | Refresh xoay vòng, đăng xuất RP-initiated, `/revoke` | Xong | sửa: `src/provider.ts`, `src/interactions.ts`, `src/main.ts` (POST `/session/end`, log thu hồi), `test/flow.spec.ts` |
| S04 | Log, image Docker, service `oidc-mock` trong compose | Xong | tạo: `src/log.ts`, `Dockerfile`, `Dockerfile.dockerignore`; sửa: `infra/local/compose.yaml` |
| S05 | README | Xong | tạo: `infra/local/oidc-mock/README.md`; sửa: `infra/README.md`, `scripts/development/README.md` |

## 3. Kết quả

- `pnpm local:up` có OIDC mock ở `http://localhost:9400` (service `oidc-mock`, healthcheck `/health`); `pnpm local:up --build` build image `sires/oidc-mock:local` (chạy bằng `node`, không có `.sires`, `.env*`, `.git`).
- Discovery, `/authorize` (code, PKCE S256 bắt buộc), `/token` (`client_secret_basic`), `/userinfo`, `/jwks` (một khóa RS256), `/revoke`, `/session/end` (RP-Initiated Logout 1.0). ID token có `nonce`, `sub`, `name`, `email`, `email_verified`, hạn 900 giây; refresh 30 ngày, xoay vòng, dùng lại thì thu hồi family.
- Client `sires-gateway-local`, tài khoản A `sires-mock-a`, B `sires-mock-b` (mật khẩu `sires-local`); file mẫu staging có chỗ giữ chỗ và bị từ chối nguyên trạng.
- Mock thoát mã 1 trước khi mở cổng khi `OIDC_MOCK_ENV` thiếu, khác `local`, `staging`, hay cấu hình staging không an toàn.
- README của mock ghi cách gateway trỏ issuer (biến H7), chạy ở staging, khác biệt với eTroy, giả lập IdP không khả dụng, đổi cổng.

## 4. Việc còn lại

Không có trong phạm vi. Ngoài phạm vi theo hồ sơ: gateway đăng nhập, đăng xuất trên mock (PID-00038); chạy mock trên staging (PID-00035).

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. Thứ tự merge: PID-00160 phụ thuộc PID-00159 (PR #125 vào `main`) ở S04, S05. PID-00159 không sửa `infra/local/compose.yaml`; dòng mới của PID-00160 ở `infra/README.md`, `scripts/development/README.md` đặt xa chỗ PID-00159 sửa, merge thử hai nhánh không xung đột. Đề xuất đồng bộ `develop` theo `main` sau khi #125 merge, rồi merge PR này (hoặc merge PR này trước, không ảnh hưởng mã).
  2. Hồ sơ PID-00038 (khi làm rõ): POST tới `end_session_endpoint` chéo site không mang cookie phiên của mock (`SameSite=Lax`); gateway dùng chuyển hướng GET. Đăng xuất ở mock không thu hồi refresh token; gateway gọi `/revoke` khi đăng xuất nếu muốn refresh token hết dùng ngay.
  3. Hồ sơ PID-00035 (staging): mỗi khóa `OIDC_MOCK_COOKIE_KEYS` ít nhất 32 ký tự; proxy trước mock phải gửi `X-Forwarded-Proto`, `X-Forwarded-Host`.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** không có.
- **Bước tiếp theo:** QC độc lập `spec-converge-skill PID-00160`; PO review PR vào `develop`, merge sau hồ sơ (PR #112).
- **Tài liệu đi kèm:** không có (kết quả lệnh ghi ở `self-qc.md`).

## Lần 2 — 27/11/2026

- **Lý do:** QC độc lập hồ sơ PR #121 nêu F1 (MEDIUM): `redirect_uris` cục bộ `/auth/callback` lệch hợp đồng gateway, nơi `/auth/callback` nằm dưới base `/api/v1`. Phiên điều phối giao sửa #130; phiên ph02-plan sửa hồ sơ.
- **Đã làm:** `redirect_uris` thành `http://localhost:5173/api/v1/auth/callback`, `http://localhost:3000/api/v1/auth/callback` (mẫu staging `https://staging.example.invalid/api/v1/auth/callback`); test, README theo đó; test thêm ca URI cũ bị từ chối. `post_logout_redirect_uris` đã kiểm, giữ nguyên (trang gốc của web, hợp đồng không quy định).
- **Kết quả:** 33/33 test; container build lại, luồng thật đạt với callback mới (`self-qc.md` Lần 2).
- **Cho PID-00038:** `OIDC_REDIRECT_URI` cục bộ là `http://localhost:5173/api/v1/auth/callback` hoặc `http://localhost:3000/api/v1/auth/callback`.

## Lần 3 — 27/11/2026

- **Lý do:** QC hồ sơ #121 F1 (bổ sung sau QC #120): hợp đồng `POST /auth/logout` của #120 (PC-05 P3) gửi `post_logout_redirect_uri` = trang `/sign-in` của SIRes, chỉ kèm `client_id`.
- **Đã làm:** `post_logout_redirect_uris` cục bộ thêm `http://localhost:5173/sign-in`, `http://localhost:3000/sign-in` (giữ trang gốc); mẫu staging `https://staging.example.invalid/sign-in`; test AC05 theo `/sign-in`; README.
- **Kết quả:** 33/33 test (`self-qc.md` Lần 3).
- **Cho PID-00038:** `OIDC_POST_LOGOUT_REDIRECT_URI` cục bộ là `http://localhost:5173/sign-in`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
