# PID-00036 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00036](../../../docs/tickets/issues/PID-00036/index.html) · **Luồng:** `web/settings` · **Giai đoạn:** PH-02 (Xây với mock, D-UI)
- **Nhánh:** `web/settings-pid-00036` (tạo từ `preview/ui-ph02` a9bcc0e, xếp chồng trên #120, #138, #131; đã commit) · **PR:** [#143](https://github.com/toilatrung/sires/pull/143) vào `develop`
- **Cập nhật:** 27/11/2026
- **Người làm:** phiên do PO giao, làm thay assignee `congminh1705`
- **Hồ sơ:** đọc từ nhánh `docs/pid-00036-clarify` (PR #122, chưa vào `main`); hợp đồng theo `preview/ui-ph02` (PR #126 sửa nguồn chưa merge, nên làm theo cách tạm ghi trong slice)
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 7/7 xong. Bị chặn: không có.
- AC: 14/14 đạt (kiểm với mock của PID-00013 và mock của khu vực). Edge case: 54/54 đã giải quyết (EC04, EC12 bằng thao tác tay trên `dev:mock`); 2 điều mới cần lưu ý (self-qc.md mục 3).
- Yêu cầu thêm: 1 (YC1, sửa hai test của shell — chờ phiên điều phối).

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Khung khu vực, menu Settings, i18n và mock của khu vực | Xong | sửa: `features/settings/index.tsx`, `i18n/vi.json`, `i18n/en.json`; tạo: `shared.tsx`, `settings.css`, `__mocks__/{mocks.config.json,index.ts,store.ts}`, `test-helpers.tsx`, `settings-nav.spec.tsx` |
| S02 | SignIn | Xong | tạo: `SignIn.tsx`, `signin.spec.tsx` |
| S03 | Provider Connections: danh sách, tạo, kiểm tra, sửa, key dạng che | Xong | tạo: `Providers.tsx`, `providers.spec.tsx` |
| S04 | Xóa Provider Connection và kết nối thay thế | Xong | `Providers.tsx` (`DeleteDialog`), `providers.spec.tsx` |
| S05 | Profile | Xong | tạo: `Profile.tsx`, `profile.spec.tsx` |
| S06 | Agent Models và Embedding model | Xong | tạo: `Agents.tsx`, `agents.spec.tsx` |
| S07 | Preferences và Ngưỡng kiểm chứng | Xong | tạo: `Preferences.tsx`, `preferences.spec.tsx` |

Mọi đường dẫn trên dưới `apps/web/src/features/settings/`. Ngoài khu vực (YC1): `apps/web/src/shell/routes.spec.ts`, `apps/web/src/shell/preferences.spec.ts`.

## 3. Kết quả

- `pnpm --filter @sires/web dev:mock`, mở `/sign-in`, `/settings/profile`, `/settings/providers`, `/settings/agents`, `/settings/preferences`. Dữ liệu mẫu theo màn tham chiếu: Claude cá nhân, OpenAI cá nhân (Valid), Gemini cá nhân (Invalid `auth_failed`), “Proxy OpenAI tương thích” trên `https://llm-proxy.example/v1` (Valid). Thử key: chữ `wrong` (hoặc `invalid`, `sai`) trong key → Invalid `auth_failed`; `timeout`, `quota`, `limit`, `denied`, `down` → mã tương ứng.
- Test: 6 file, 67 test của khu vực; toàn `@sires/web` 205 test đạt; lint, typecheck, build đạt. Chi tiết ở self-qc.md.

## 4. Việc còn lại

- Khi PR #126 vào: bỏ ép kiểu `null` của URL Scholar (`Profile.tsx:67`), hiện cột Mặc định và nhãn “đã chỉnh” từng dòng ngưỡng (S07), thêm số Reference phải index lại vào dialog embedding (S06), đọc `/auth/login` 302 theo hợp đồng mới (S02 không đổi mã).
- Hội tụ (N1): chạy với gateway thật, Audit Event, mã hóa key ở PID-00041–PID-00043.

## 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | Dev | Sửa hai test của shell bám placeholder `sign-in`: `shell/routes.spec.ts` (EC17 của PID-00012) tìm chữ `sign-in` và đòi `/sign-in` không gửi request nào; `shell/preferences.spec.ts` (EC28) cũng đòi không request nào. SignIn thật thay placeholder (S01) và gọi `getSession` (H4) | Trong phạm vi về hành vi (không đổi AC); chạm luồng `web/shell` — điểm dừng “cần thêm gì ở shell → dừng, báo phiên điều phối” | Làm ở commit riêng để CI xanh; chờ phiên điều phối: giữ commit, hoặc để phiên web-shell sửa và bỏ commit này | `pnpm nx run @sires/web:test` 205 đạt; hai test giờ kiểm “không request nào khác `getSession`” |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO (sửa ở nguồn, không chặn):**
  1. README mock (`apps/web/src/shell/mock/README.md`) và chú thích `Feature.mocks` (`apps/web/src/shell/feature.ts`) ghi mẫu `import.meta.env.DEV ? () => import('./__mocks__') : undefined`; mẫu này đưa mock của khu vực vào bản build khi `NODE_ENV=development` (`shell/mock/build.spec.ts` › NODE_ENV=development lỗi). Mẫu đúng như `src/mocks/index.ts`: `import.meta.env.DEV && import.meta.env.MODE !== 'production'`. Việc của luồng `web/shell` (PID-00013).
  2. Runtime mock (`shell/mock/runtime.ts`, `toResponse`): override trả `{ status, body }` với status operation không khai (ví dụ 503 cho `listProviderConnections`) bị bỏ thân, client chỉ thấy `http_error`. Đề xuất: status 4xx, 5xx có `body` luôn trả `application/problem+json`. Việc của PID-00013.
  3. Ghi chú cho khu vực khác (không phải lỗi cấu hình): lần đầu chạy `generate-mocks` ngay sau khi tạo `mocks.config.json` (file chưa theo dõi) vẫn trúng cache, không sinh `__mocks__/generated/`; input của target đã có `src/**/mocks.config.json`, chạy lại với `--skip-nx-cache` là đủ.
- **Yêu cầu hợp đồng:** thân merge-patch của `updatePreferences` (và `updateProfile`) mang kiểu component đầy đủ (`Preferences` bắt buộc `includeResearchFieldInContext`, `debugMode`), nên client phải ép kiểu (`shared.tsx:175` `mergePatch`; shell cũng ép ở `shell/preferences.ts`). Đề xuất schema riêng cho thân merge-patch (mọi trường tùy chọn). Không chặn PID nào.
- **Còn mở:** YC1 (phiên điều phối quyết). Các mục hợp đồng của #126 (URL Scholar `null`, `VerificationThresholds.defaults`, `EmbeddingSettings.indexedReferenceCount`, `/auth/login` 302) — đã có PR, cần xong trước Hội tụ.
- **Bước tiếp theo:** QC độc lập chạy `spec-converge-skill PID-00036`; PO quyết YC1; merge sau #120, #138, #131.
- **Tài liệu đi kèm:** không có (ảnh chụp trên mock gửi phiên điều phối qua thư mục ghi chú, không đưa vào repo).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
