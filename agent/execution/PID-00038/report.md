# PID-00038 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC (phạm vi bật endpoint và kiểm local theo yêu cầu)

- **Ticket:** [PID-00038](../../../docs/tickets/issues/PID-00038/index.html) · **Luồng:** `gateway` · **Giai đoạn:** PH-02
- **Nhánh:** `gateway/pid-00038-etroy-integration` · **PR:** chưa mở
- **Cập nhật:** 22/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

Người dùng yêu cầu trực tiếp “nối đi mà test”, sau đó “bật nốt mà chạy” cho đủ bốn endpoint.
Thực thi trực tiếp theo yêu cầu phiên; hồ sơ docs hiện thiếu phần làm rõ (check-pid ban đầu có 5 lỗi),
không tự đổi trạng thái docs thành Sẵn sàng hoặc ghi lại các quyết định PO.

Đã bật login/callback/session/logout trong AppModule. Gateway thật + eTroy One thật + PostgreSQL/MongoDB/Redis
fixture đạt 11/11 test; identity là HTTP stub theo hợp đồng, kiểm service-token thật. Test thường đạt 35/35.
Đã build/run gateway qua `node dist/main.js` trong suite. Không deploy staging hoặc sửa PR #63.

## 2. Trạng thái công việc

Hồ sơ chưa chia slice; dùng bước B1–B8 và output O1–O4 của spec để truy vết.

| Bước | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| B1 | Code + PKCE, state, nonce, chữ ký | Xong local | `apps/gateway/src/auth/oidc-client.ts`, `auth.crypto.ts`, `auth.service.ts` |
| B2 | Resolve account, cấp/đổi phiên | Xong local | `auth.service.ts`, `src/session/session.service.ts`, `test/stubs/identity.stub.ts` |
| B3 | Logout cả hai hệ thống, 204 theo hợp đồng | Xong local | `auth.controller.ts`, `oidc-client.ts`; nhánh provider `fix/sires-oidc-nonce` |
| B4 | Provider không khả dụng | Xong local | `auth.service.ts`, `auth.spec.ts`, suite thật |
| B5 | Kiểm lại với eTroy One thật | Xong local | `spikes/spk-02/etroy-live.spec.ts`, `run-etroy-live.mjs` |
| B6 | Đủ 4 operation | Xong | `src/auth/auth.controller.ts`, `auth.module.ts`, `src/app.module.ts` |
| B7 | Gọi identity qua hợp đồng và token nội bộ | Xong với stub được spec cho phép | `auth.service.ts`, `test/stubs/identity.stub.ts` |
| B8 | Test tích hợp | Xong local | `src/auth/auth.spec.ts`, suite thật, test session/migration |
| O4 | Giá trị deploy | Có secretName app/migrator; chưa triển khai staging | `deploy/values.yaml`, `README.md` |

## 3. Kết quả

- GET `/auth/login`: 302, state/nonce/PKCE, pending cookie AES-GCM, returnTo cùng origin; provider down → 503.
- GET `/auth/callback`: kiểm callback và JWKS, resolveAccount bằng signed service token, cấp cookie phiên;
  đăng nhập lại dùng account cũ và thu hồi session cũ. Lỗi/disabled chuyển về signin, không cấp phiên.
- GET `/auth/session`: chỉ accountId/expiresAt/csrfToken; refresh token được serialize qua row lock.
- POST `/auth/logout`: kiểm CSRF trước handler, revoke session và token, gọi logout POST của eTroy bằng
  ID token ký gắn sid; trả 204, không bị interceptor gia hạn lại phiên vừa thu hồi.
- OIDC token lưu ciphertext ở cột đã có; không thêm/sửa migration. Pending cookie mã hóa có TTL 5 phút.
- Provider được sửa nonce/sid và signed id_token_hint POST logout. Giữ nguyên cơ chế CSRF browser logout.

## 4. Việc còn lại

Kiểm local đã hoàn tất: gateway 35/35, bản build qua HTTP với provider thật 11/11, affected 19 project 72/72 task
(68 dùng cache) và provider npm run check đạt. Còn QC độc lập. Cần môi trường staging, secret app/migrator và identity thật để hội tụ
staging; local suite dùng stub identity được spec cho phép. Hồ sơ docs vẫn cần PO làm rõ/duyệt trước nghiệm thu chính thức.
Mã mới của hai repo chưa commit/push; PR #63 là PID-00014, CI của PR đó đã đạt.

## 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | Người dùng trong phiên | “nối đi mà test”; “bật nốt mà chạy” | Thực thi trực tiếp 4 endpoint và kết nối thật; gồm bản sửa provider eTroy One cần cho tích hợp | Làm theo yêu cầu trực tiếp, không thay docs | 35 test thường, 11 test HTTP thật và npm run check của provider |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** Làm rõ/duyệt hồ sơ, ghi kết quả ASM-13 từ môi trường thử local, xác nhận cấu hình thời hạn
  phiên theo policy provider trước staging; secretName và biến cấu hình đã ghi README.
- **Yêu cầu hợp đồng:** SIRes giữ nguyên 4 operation, logout 204. eTroy One bổ sung id_token_hint POST logout;
  schema request của provider đã được generator cập nhật ở repo provider.
- **Còn mở:** Staging/QC độc lập và hội tụ identity thật; không có lỗi endpoint local đã biết.
- **Bước tiếp theo:** Commit/push nguồn khi được yêu cầu; QC độc lập trước nghiệm thu và cấu hình staging khi có môi trường.
- **Tài liệu đi kèm:** `oidc-integration.md` — bằng chứng kiểm ban đầu và cập nhật; hướng dẫn trong
  `apps/gateway/spikes/spk-02/etroy-live.md`; log ignored `.nx/pid00038-live-final.log`, `.nx/pid00038-gateway-final.log`,
  `.nx/pid00038-affected.log`. Ở provider: `output/sires-endpoints-final.log`.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Non-commercial use only; see [LICENSES.md](../../../LICENSES.md).
