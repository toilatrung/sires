# PID-00015 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 6 LOW (Lần 2, 24/11/2026). QC đã tự chạy test trên `develop` `083795b`: spike 4/4, gateway 5/5 đạt

- **Ticket:** [PID-00015](../../../docs/tickets/issues/PID-00015/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 18/11/2026 · spec-converge-skill

Người chạy: agent QC do PO giao, không mang kết luận của Dev. Mã nguồn: PR #29, nhánh `gateway/spk-02-oidc-stub`, commit `775ddbe` (đã merge `main` `1f6235d`).

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

## Lần 2 — 24/11/2026 · spec-converge-skill

Người chạy: agent QC độc lập (phiên sires-1b, do điều phối sires-c2 giao), không mang kết luận của Dev hay của Lần 1. Mã nguồn: `origin/develop`, commit `083795b` (PR #29 đã merge). Worktree mới, `pnpm install --frozen-lockfile`, chạy `--skip-nx-cache`.

Mục đích: Lần 1 không tự chạy được test (không có mạng tới npm). Lần này chạy lại toàn bộ lệnh ở ticket mục 8, kiểm lại G1–G5 trên mã đã merge.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1–G5 | như Lần 1 | như Lần 1 | LOW | Vẫn còn trên `083795b`: `flow.spec.ts:111` (tên test có hậu tố), `apps/gateway/tsconfig.json` `include: ["src"]`, `rp.ts:262` (mọi `TypeError` → không khả dụng), `rp.ts:39`, `rp.ts:123` (`createdAt` không được kiểm hạn) | Không đổi: chuyển cho PID-00038 như Lần 1 |
| G6 | O1 (“Chạy lại được theo hướng dẫn trong báo cáo”) · B2 | partial | LOW | `report.md:30-31`: chỉ `pnpm install` rồi `pnpm --filter @sires/gateway exec vitest run --dir spikes/spk-02`. Trên worktree mới, lệnh này **lỗi**: `Failed to resolve entry for package "@sires/testing"` (`flow.spec.ts` dòng 1 import `@sires/testing`, gói trỏ `dist/index.js` chưa build). Chạy được sau khi `pnpm nx run @sires/gateway:test` (hoặc `@sires/testing:build`) build thư viện phụ thuộc | Hướng dẫn chạy lại nên thêm bước build `@sires/testing`, hoặc dùng `pnpm nx run @sires/gateway:test`. Không chặn: target nx chạy đúng. Lệnh này cũng có ở ticket mục 8, spec mục 6, slice S01 — đề xuất PO |

Không có `contradicts`, không có `unrequested` mới.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00015-AC01 | đạt | stub (`FakeOidcProvider` trong tiến trình) | `apps/gateway/spikes/spk-02/flow.spec.ts › luồng đầy đủ trên stub (discovery)`, `› (static)` | QC chạy: `flow.spec.ts` 4/4 đạt (sau khi build phụ thuộc, G6) |
| PID-00015-AC02 | đạt | đọc báo cáo | `report.md` mục 3.3: ASM-13 chưa kết luận, bảng K1–K14 | Đọc lại: không đổi so với Lần 1 |

Edge case: EC02 `› không khả dụng` (`flow.spec.ts:172`), EC03 `› hết hạn` (`flow.spec.ts:207`) đạt trong lần chạy của QC; EC01 thao tác tay, không đổi.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt |
| `pnpm --filter @sires/gateway exec vitest run --dir spikes/spk-02` (trước khi build phụ thuộc) | **Lỗi** — 1 suite fail, 0 test: `Failed to resolve entry for package "@sires/testing"` (G6) |
| `pnpm nx run @sires/gateway:lint` | Đạt |
| `pnpm nx run @sires/gateway:typecheck` | Đạt (không phủ `spikes/`, G2) |
| `pnpm nx run @sires/gateway:test` | Đạt — 2 file, 5/5 test (`spikes/spk-02/flow.spec.ts` 4, `src/app.module.spec.ts` 1) |
| `pnpm nx run @sires/gateway:build` | Đạt |
| `SPK02_TIMINGS=1 pnpm --filter @sires/gateway exec vitest run --dir spikes/spk-02` (sau khi build phụ thuộc) | Đạt — 1 file, 4/4 test |
| `tsc --noEmit --strict --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck --types node spikes/spk-02/rp.ts spikes/spk-02/flow.spec.ts` (trong `apps/gateway`) | Đạt, exit 0 — bù cho G2 |
| `eslint spikes` (trong `apps/gateway`) | Đạt, exit 0 |
| `node scripts/docs/add-license.mjs --check` | `0 file chưa có thông báo giấy phép.` |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00015 --result` | `KẾT QUẢ ĐỦ (0 cảnh báo)` |
| `check-tracks.mjs`, `nx affected` | Không chạy — PR #29 đã merge, không còn diff riêng của PID này trên `develop`; Lần 1 đã ghi `check-tracks` (G3) |

### Lệch với Self-QC

- `report.md:30-31` và `self-qc.md` ghi lệnh spike chạy được ngay sau `pnpm install`; QC thấy cần build `@sires/testing` trước (G6). Có thể máy Dev đã có `libs/ts/testing/dist` từ lần build trước.
- Kết quả test của Dev (4/4) khớp với lần chạy của QC.

### Việc còn lại, theo thứ tự phụ thuộc

Không có việc bắt buộc cho PID-00015. G1–G6 là LOW; G4, G5 chuyển cho PID-00038 như Lần 1.

### Đề xuất cho PO

1. Giữ các đề xuất 1–4 của Lần 1. Đề xuất 1 (`nonce` trong ID token của eTroy) vẫn là điều kiện cho PID-00038. `agent/execution/PID-00038/report.md` trên nhánh `gateway/pid-00038-etroy-integration` có nhắc bản sửa nonce ở repo provider (xem QC PID-00038).
2. G6: lệnh kiểm ở ticket mục 8, spec mục 6, slice S01 nên ghi `pnpm nx run @sires/gateway:test` (có build phụ thuộc) thay cho, hoặc trước, `pnpm --filter … vitest run --dir spikes/spk-02`.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
