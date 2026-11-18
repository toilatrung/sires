# PID-00015 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 5 LOW (Lần 1, 18/11/2026). QC không tự chạy được test; CI trên `775ddbe` đạt, gồm 4/4 test của spike

- **Ticket:** [PID-00015](../../../docs/tickets/issues/PID-00015/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 18/11/2026 · spec-converge-skill

Người chạy: agent QC do PO giao (Claude), không mang kết luận của Dev. Mã nguồn: PR #29, nhánh `gateway/spk-02-oidc-stub`, commit `775ddbe` (đã merge `main` `1f6235d`).

Phạm vi đã đọc: `apps/gateway/spikes/spk-02/rp.ts`, `flow.spec.ts`, `apps/gateway/package.json`, phần `pnpm-lock.yaml` đổi; đối chiếu `acceptance.html`, `scope.html` (P1–P3, N1–N3, EC01–EC03), ticket mục 1, 5, 7, 8. Đối chiếu thêm mã nguồn `toilatrung/eTroy_OIDC` (`main`, `e5fa331`, chỉ đọc) để kiểm các điểm K của báo cáo Dev.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | PID-00015-AC01 | partial | LOW | `flow.spec.ts:112`: tên test là `luồng đầy đủ trên stub (discovery)`, `(static)`; `acceptance.html` ghi `luồng đầy đủ trên stub` | Không cần sửa mã; PO đổi tên trong `acceptance.html` khi tiện (trùng G1 của self-qc) |
| G2 | Ticket mục 8 (typecheck) | partial | LOW | `apps/gateway/tsconfig.json` chỉ `include: ["src"]`: `nx typecheck` không kiểm `spikes/`; Dev kiểm bằng `tsc` tạm ngoài repo | Không chặn (mã spike không vào build). PID-00038 viết mã thật trong `src/` nên được kiểm |
| G3 | Quy tắc 1.4.1 | partial | LOW | `check-tracks.mjs`: `gateway, infra, repo` — `infra` chỉ do `pnpm-lock.yaml` | Đúng quy tắc 1.4.7; đề xuất 5 của Dev (lockfile trung lập) cần một ticket luồng infra |
| G4 | EC02 · INT-OIDC-004 | partial | LOW | `rp.ts:262`: mọi `TypeError` trong chuỗi `cause` bị xếp là “không khả dụng”. `fetch` lỗi mạng là `TypeError`, nhưng lỗi đối số của openid-client/oauth4webapi cũng là `TypeError`, nên một lỗi lập trình hay callback hỏng có thể hiện thành “eTroy không khả dụng” thay vì “bị từ chối” | Ghi cho PID-00038: chỉ nhận `TypeError` có `cause` là lỗi mạng (ví dụ `cause.code` ECONNREFUSED, UND_ERR_*), còn lại coi là từ chối |
| G5 | INT-OIDC-001 (callback) | partial | LOW | `rp.ts:39`: `PendingLogin.createdAt` có nhưng `completeLogin` không kiểm hạn; callback dùng `pending` cũ bao lâu cũng nhận | Ghi cho PID-00038: pending login có hạn ngắn (ví dụ 10 phút) và dùng một lần |

Không có `contradicts`. Không thấy `unrequested` ngoài G4 của self-qc (kiểm sai `state`/`nonce`, refresh đồng thời, chế độ tĩnh) — QC đồng ý giữ: phục vụ P1 và K1, không đổi hành vi service.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00015-AC01 | đạt | stub (`FakeOidcProvider` trong tiến trình) | `apps/gateway/spikes/spk-02/flow.spec.ts › luồng đầy đủ trên stub (discovery)`, `› (static)` | QC không chạy (xem dưới); CI `build` trên `775ddbe`: `spikes/spk-02/flow.spec.ts (4 tests)` đạt |
| PID-00015-AC02 | đạt | đọc báo cáo | `report.md` mục 3.3: “ASM-13: chưa kết luận”, bảng K1–K14 | Đọc lại: đủ endpoint, scope, claim, hạn token, logout như P2 yêu cầu |

Edge case: EC01 ghi ở K1, K4, K5, K6, K12 và đề xuất sửa stub (đúng: không sửa `libs/ts/testing`); EC02 `› không khả dụng` (503, cắt kết nối, discovery lỗi không cache, phiên đang có vẫn dùng); EC03 `› hết hạn` (refresh, refresh bị thu hồi → đăng nhập lại). Đọc test: các khẳng định đúng với tên test, có ca phản chứng (sai `state`, sai `nonce`, refresh đồng thời không phối hợp làm thu hồi cả family).

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm --filter @sires/gateway exec vitest run --dir spikes/spk-02`, `pnpm nx run @sires/gateway:test`, `pnpm nx affected -t lint typecheck test build` | không chạy — môi trường QC không có mạng tới npm nên không cài được `node_modules`. Tham khảo (không phải QC chạy): CI run 44242491715 trên `775ddbe`, job `build` đạt; log có `nx run @sires/gateway:test` → `spikes/spk-02/flow.spec.ts (4 tests)` đạt |
| `git diff --name-only origin/main...HEAD \| node scripts/development/check-tracks.mjs --stdin` | `tracks touched: gateway, infra, repo` — cảnh báo 2 luồng (G3) |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00015 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| Đọc mã nguồn eTroy_OIDC `e5fa331` (`grep`) | K1 đúng: không có route discovery; K2: JWKS ở `GET /jwks` (`src/app/server.ts:92`); K4 đúng: chỉ `app.post('/logout')` (`server.ts:97`); K3 **xác nhận ở mã**: `/authorize` nhận và kiểm `nonce` (`oidc.service.ts:389`, `:906`), lưu vào interaction, nhưng `AuthorizationCodeDocument` không có `nonce` và `issueIdToken({ audience, scope, user })` (`oidc.service.ts:1652`) không đưa `nonce` vào ID token |

### Lệch với Self-QC

- Self-QC ghi K3 là “tài liệu eTroy không nhắc `nonce`”. QC thấy trong mã eTroy: `nonce` được nhận rồi bị bỏ, ID token không có `nonce`. Với `expectedNonce` như spike (và INT-OIDC-001), **đăng nhập vào eTroy thật sẽ lỗi**. Đây không phải khoảng trống của PID này (ASM-13 cố ý chưa kết luận), nhưng nâng mức khẩn của đề xuất 1 của Dev.
- G4, G5 của QC không có trong self-qc.
- QC không chạy lại test; kết quả 4/4 dựa trên CI.

### Việc còn lại, theo thứ tự phụ thuộc

Không có việc bắt buộc cho PID-00015. Các điểm G4, G5 và K1–K14 chuyển cho PID-00038.

### Đề xuất cho PO

1. **Gửi đội eTroy ngay (trước PID-00038, cổng PH-02):** ID token phải chứa `nonce` đã gửi ở `/authorize` (OIDC Core 3.1.3.7; INT-OIDC-001). Không có thì SIRes phải bỏ kiểm `nonce` — trái INT-OIDC-001, cần PO quyết. Kèm K4 (logout chỉ `POST` kèm CSRF của eTroy: RP-initiated logout từ gateway làm thế nào) và K7 (phương thức xác thực client).
2. Ghi vào hồ sơ PID-00038 khi làm rõ: G4 (phân loại lỗi mạng), G5 (hạn và dùng một lần của pending login), tuần tự hóa refresh theo phiên trong kho phiên (report.md mục 3.2, K10).
3. Kiến trúc 12.2, dòng SPK-02: “Đã chạy trên stub 18/11/2026 (PID-00015); ASM-13 còn mở tới PID-00038” (ticket mục 5 “Phải sửa ở nguồn”).
4. Sửa stub `FakeOidcProvider` (luồng platform) theo đề xuất 2 của Dev, sau khi đội eTroy trả lời điểm 1.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
