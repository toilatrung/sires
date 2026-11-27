# PID-00036 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00036](../../../docs/tickets/issues/PID-00036/index.html) · **Luồng:** `web/settings` · **Giai đoạn:** PH-02 (Xây với mock, D-UI)
- **Nhánh:** `web/settings-pid-00036` (tạo từ `preview/ui-ph02` a9bcc0e, xếp chồng trên #120, #138, #131, #122, #126; lịch sử dựng lại sạch cho gitleaks ở `web/settings-pid-00036-v2`; đã merge head mới của #138 `b157d02`; đã commit) · **PR:** [#143](https://github.com/toilatrung/sires/pull/143) vào `develop`
- **Cập nhật:** 27/11/2026
- **Người làm:** phiên do PO giao, làm thay assignee `congminh1705`
- **Hồ sơ:** #122 (`docs/pid-00036-clarify`) và #126 (`docs/pid-00036-sources`, sửa nguồn) đã merge vào nhánh theo yêu cầu của phiên điều phối; dựng theo type sinh và thiết kế Settings của #126
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 7/7 xong. Bị chặn: không có.
- AC: 14/14 đạt (kiểm với mock của PID-00013 và mock của khu vực). Edge case: 53/54 đã giải quyết, EC36 cần lưu ý (self-qc.md mục 3).
- Tự QC (DEC-58): lượt đối chiếu độc lập tìm G1–G12 (1 HIGH, 5 MEDIUM, 6 LOW), đã xử lý hết; còn một điểm bố cục LOW để QC độc lập/PO xem.
- Hai test của shell (YC1) hết đỏ sau khi merge head mới của #138 (`3b63522`: test shell dùng `renderShellFrame` với `neutralFeatures`).
- Yêu cầu thêm: 3 (YC1–YC3).

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Khung khu vực, menu Settings, i18n và mock của khu vực | Xong | sửa: `features/settings/index.tsx`, `i18n/vi.json`, `i18n/en.json`; tạo: `shared.tsx`, `settings.css`, `__mocks__/{mocks.config.json,index.ts,store.ts}`, `test-helpers.tsx`, `settings-nav.spec.tsx` |
| S02 | SignIn | Xong | tạo: `SignIn.tsx`, `signin.spec.tsx` |
| S03 | Provider Connections: danh sách, tạo, kiểm tra, sửa, key dạng che | Xong | tạo: `Providers.tsx`, `providers.spec.tsx` |
| S04 | Xóa Provider Connection và kết nối thay thế | Xong | `Providers.tsx` (`DeleteDialog`), `shared.tsx` (`Dialog`), `providers.spec.tsx` |
| S05 | Profile | Xong | tạo: `Profile.tsx`, `profile.spec.tsx` |
| S06 | Agent Models và Embedding model | Xong | tạo: `Agents.tsx`, `agents.spec.tsx` |
| S07 | Preferences và Ngưỡng kiểm chứng | Xong | tạo: `Preferences.tsx`, `preferences.spec.tsx` |

Mọi đường dẫn trên dưới `apps/web/src/features/settings/`.

## 3. Kết quả

- `pnpm --filter @sires/web dev:mock`, mở `/sign-in`, `/settings/profile`, `/settings/providers`, `/settings/agents`, `/settings/preferences`. Dữ liệu mẫu theo màn tham chiếu: Claude cá nhân, OpenAI cá nhân (Valid), Gemini cá nhân (Invalid `auth_failed`), “Proxy OpenAI tương thích” trên `https://llm-proxy.example/v1` (Valid); ngưỡng có `defaults`; embedding `text-embedding-3-small` với 38 Reference đã index. Thử key: chữ `wrong` (hoặc `invalid`, `sai`) trong key → Invalid `auth_failed`; `timeout`, `quota`, `limit`, `denied`, `down` → mã tương ứng.
- Test của khu vực: 6 file, 82 test đạt. Toàn `@sires/web`: 26 file, 220 test đạt. Lint, typecheck, build đạt. Chi tiết ở self-qc.md.

## 4. Việc còn lại

- Hội tụ (N1): chạy với gateway thật (`/auth/login` 302 theo #126, PID-00038), Audit Event, mã hóa key ở PID-00041–PID-00043.

## 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | Dev, rồi phiên điều phối | Hai test của shell bám placeholder `sign-in`: `shell/routes.spec.ts` (EC17 của PID-00012) tìm chữ `sign-in` và đòi `/sign-in` không gửi request nào; `shell/preferences.spec.ts` (EC28) cũng vậy. SignIn thật gọi `getSession` (H4). Phiên điều phối: “Nếu Settings gặp lỗi tương tự, báo tôi, đừng tự sửa file của shell.” | Điểm dừng (shell) | Không sửa: revert phần đã sửa (89f112b), báo phiên điều phối kèm cách sửa; phiên web-shell sửa ở #138 (`3b63522`) | Sau YC3: hai test đạt |
| YC2 | Phiên điều phối | “Merge `origin/docs/pid-00036-sources` vào nhánh dựng màn (merge, không rebase) để có type sinh và thiết kế mới, rồi dựng theo bản này.” | Trong phạm vi (sửa nguồn của chính PID) | Làm: merge 8c39474; xung đột tài liệu giải theo quy tắc (file sinh chạy lại `update-index.mjs`, `tools/render.mjs`, bundle OpenAPI dựng lại bằng `@redocly/cli` 2.11.1, lint sạch); bỏ cách tạm (cột Mặc định và “đã chỉnh” từng dòng, số Reference trong dialog, `null` cho URL Scholar, dialog xóa và first-connection theo thiết kế mới) | `preferences.spec.tsx › ngưỡng mặc định từng dòng`, `agents.spec.tsx › đổi embedding xác nhận`, `providers.spec.tsx › xóa cần thay thế` |
| YC3 | Phiên điều phối | “Merge `origin/web/shell-pid-00012` vào nhánh #143 (merge, không rebase), chạy test… push, chờ CI xanh, rồi báo tôi head mới.” | Trong phạm vi (cập nhật nhánh xếp chồng) | Làm: merge dc9da2b, không xung đột | `pnpm nx run-many -t lint typecheck test build -p @sires/web`: 220/220 |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO (sửa ở nguồn, không chặn):**
  1. README mock (`apps/web/src/shell/mock/README.md`) và chú thích `Feature.mocks` (`apps/web/src/shell/feature.ts`) ghi mẫu `import.meta.env.DEV ? … : undefined`, đưa mock của khu vực vào bản build khi `NODE_ENV=development`. Phiên điều phối đã báo; phiên web-mocks thêm helper chung.
  2. Runtime mock (`shell/mock/runtime.ts`, `toResponse`): override trả `{ status, body }` với status mà operation không khai (503; 409 của `updateProviderConnection`) bị bỏ thân, client chỉ thấy `http_error`. Đề xuất: status 4xx, 5xx có `body` luôn trả `application/problem+json`. Việc của PID-00013.
  3. Ghi chú cho khu vực khác: lần đầu chạy `generate-mocks` ngay sau khi tạo `mocks.config.json` (file chưa theo dõi) vẫn trúng cache; chạy lại với `--skip-nx-cache`. Trên Windows, `@sires/contracts:generate-ts` có thể `EPERM` khi dev server đang chạy; tắt server, xóa `libs/ts/contracts/src/generated`, chạy lại.
- **Yêu cầu hợp đồng:**
  1. `updateProviderConnection`: chưa khai `409 duplicate_name` khi đổi tên trùng (lệnh tạo đã có). Web đã xử lý mã này.
  2. Thân merge-patch của `updateProfile`, `updatePreferences` mang kiểu component đầy đủ (trường bắt buộc), nên client phải ép kiểu (`shared.tsx` `mergePatch`; shell cũng ép). Đề xuất schema riêng cho thân merge-patch.
  Không chặn PID nào.
- **Còn mở:** điểm bố cục LOW của Agent Models (self-qc.md mục 5): QC độc lập hoặc PO quyết.
- **Bước tiếp theo:** QC độc lập chạy `spec-converge-skill PID-00036`; merge sau #120, #138, #131, #122, #126.
- **Tài liệu đi kèm:** không có trong repo (ảnh chụp trên mock ở thư mục ghi chú của phiên điều phối).

## Lần 2 — 27/11/2026

- QC chéo của phiên web-shell ở `6a346dc`: ĐẠT, 0 CRITICAL, 0 HIGH, 4 MEDIUM, 7 LOW ([qc-report.md](qc-report.md)). Đã sửa 3 MEDIUM của khu vực (G2 test ô key, G3 SignIn, G4 panel sửa Agent Models) và phần lớn LOW; G1 thuộc mock dùng chung. Chi tiết ở self-qc.md “Lần 2”.
- Check `secrets` của CI đỏ ở `6a346dc`: gitleaks bắt key giả dạng `key: 'sk-test-…'` trong `providers.spec.tsx` ở hai commit cũ. Test giờ dựng key lúc chạy; lịch sử dựng lại sạch ở nhánh `web/settings-pid-00036-v2` (cùng cây). Lệnh đẩy đè nhánh của #143 bị chế độ quyền chặn: PO chọn mở PR mới từ nhánh v2 hoặc cho phép đẩy đè.
- Còn chờ PO: khối Mặc định của Agent Models dựng bằng select như màn tham chiếu, hay chấp nhận lệch (qc-report G4); logo SignIn lấy từ `shell/assets` vì shell chưa xuất logo ở index.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
