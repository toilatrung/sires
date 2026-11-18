# PID-00015 — Triển khai

- **Ticket:** [PID-00015](../../../docs/tickets/issues/PID-00015/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 18/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Mã spike, không phải mã service: `apps/gateway/spikes/spk-02/` nằm ngoài `src/`, không vào `dist/`, không được `AppModule` import. Test đóng vai trình duyệt và gateway; `FakeOidcProvider` của `@sires/testing` đóng vai eTroy OIDC.

Đăng nhập:

1. Cấu hình provider một lần, lỗi thì không cache: discovery hoặc metadata tĩnh, `ClientSecretBasic`, timeout — `apps/gateway/spikes/spk-02/rp.ts:90`, `rp.ts:228`
2. Bắt đầu đăng nhập: kiểm provider còn sống qua `jwks_uri`, sinh `state`, `nonce`, `code_verifier` (giữ phía server), dựng URL `/authorize` với PKCE S256 — `rp.ts:102`, `rp.ts:217`
3. Trình duyệt qua `/authorize`, stub trả 302 về callback có `code` — `flow.spec.ts` (`browserAuthorize`)
4. Callback: `authorizationCodeGrant` kiểm state, PKCE, ID token (chữ ký JWKS, `iss`, `aud`, `exp`, `nonce`), rồi lấy claim thành `SpikeSession` với khóa (`issuer`, `sub`) — `rp.ts:123`

Dùng phiên:

1. `ensureFresh`: token còn hạn (trừ khoảng lệch 30 s) thì trả nguyên phiên, không gọi provider — `rp.ts:155`
2. Sắp hết hạn: một refresh cho mỗi refresh token (map `refreshing`), các request đồng thời chờ cùng promise — `rp.ts:155`, `rp.ts:194`
3. Refresh lỗi `invalid_grant` → `ReloginRequiredError('refresh_rejected')`; provider không khả dụng → `ReloginRequiredError('provider_unavailable')` — `rp.ts:194`

Đăng xuất: `logoutUrl` dựng URL end-session với `id_token_hint`, `post_logout_redirect_uri`, `client_id`, `state` — `rp.ts:184`.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `SpikeRelyingParty.completeLogin` | hàm | `rp.ts:123` | Đổi code lấy token, kiểm ID token, dựng phiên | Sai thì đăng nhập với ID token không hợp lệ (INT-OIDC-001-AC02) | Không có phiên khi state, nonce, chữ ký, iss, aud sai | `flow.spec.ts › luồng đầy đủ trên stub (discovery)`, `(static)` |
| `SpikeRelyingParty.ensureFresh` | hàm, single-flight | `rp.ts:155` | Refresh trước hạn, một lần cho mỗi refresh token | Thiếu phối hợp thì refresh đồng thời làm eTroy thu hồi cả family, người dùng bị đăng xuất | Mỗi refresh token chỉ gửi lên provider một lần | `flow.spec.ts › hết hạn` |
| `toUnavailable` | hàm | `rp.ts:252` | Xếp 5xx, lỗi kết nối, timeout (kể cả lồng trong `cause`) vào `OidcUnavailableError` | Quyết định người dùng thấy “eTroy tạm không khả dụng” hay “đăng nhập bị từ chối” (INT-OIDC-004) | Lỗi giao thức 4xx không bị coi là không khả dụng | `flow.spec.ts › không khả dụng` |
| `SpikeRelyingParty.startLogin` | hàm | `rp.ts:102` | Kiểm provider rồi mới chuyển trình duyệt đi | Không kiểm thì khi eTroy chết, người dùng thấy trang lỗi của trình duyệt thay vì thông báo của SIRes | — | `flow.spec.ts › không khả dụng` |

## 3. Quyết định kỹ thuật trong phạm vi

- Đặt mã ở `apps/gateway/spikes/spk-02/` (đúng Output O1); `openid-client` là devDependency của gateway vì chỉ test spike dùng. PID-00038 chuyển sang `dependencies` khi viết luồng thật.
- Hai chế độ cấu hình (discovery, metadata tĩnh) cùng chạy một bộ test, vì tài liệu eTroy không có discovery (K1).
- `ClientSecretBasic` cho `/token`, vì eTroy cấp secret cho client và không ghi phương thức (K7, kiểm lại ở PID-00038).
- Kiểm provider bằng GET `jwks_uri` trước khi chuyển hướng: endpoint công khai, rẻ, bắt buộc phải có. Có thể đổi sang endpoint readiness của eTroy (K12).
- Single-flight trong bộ nhớ chỉ đủ cho một instance; ghi rõ ở `report.md` mục 3.2 cho PID-00038.
- Bảng số đo chỉ in khi đặt `SPK02_TIMINGS=1` (`console.info` trong `afterAll`), để chạy test thường không in gì.
- Spike không thuộc `tsconfig.json` của gateway (chỉ gồm `src/`), nên `nx typecheck` không kiểm nó; Self-QC chạy `tsc --noEmit` riêng cho hai file spike.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
