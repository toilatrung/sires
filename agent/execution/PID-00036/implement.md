# PID-00036 — Triển khai

- **Ticket:** [PID-00036](../../../docs/tickets/issues/PID-00036/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Khu vực `settings` của web (`apps/web/src/features/settings/`): màn SignIn không khung và bốn view Settings, chạy trên mock của PID-00013 khi chưa có backend (PH-02, D-UI).

**Khung và route** — `index.tsx:19`: `sign-in` (shell đặt vào nhánh không khung theo `FRAMELESS_PATHS`), `settings` → `Navigate` tới `/settings/profile` (EC01), bốn route con; route lạ rơi vào `NotFound` của shell. `messages` là namespace `settings` (`i18n/vi.json`, `en.json`, cùng bộ khóa). `mocks` tải lười chỉ khi `DEV && MODE !== 'production'` (`index.tsx:32`). Mỗi view dựng trong `SettingsLayout` (`shared.tsx:23`): menu bốn mục bằng `NavLink` (mục đang mở có `aria-current="page"`), tiêu đề view, panel theo nhóm; hàng `flex-wrap` nên dưới 768 px menu lên trên (`settings.css`).

**SignIn** — `SignIn.tsx:26`:

1. Đọc `error`, `reason`, `returnTo` của URL; mã ngoài ba mã đã biết hiện như `login_failed`, dòng “Mã lỗi:” ghi mã nhận được (chữ thường, tối đa 64 ký tự, React escape) — `SignIn.tsx:34`. `returnTo` qua `safeReturnTo` của shell, không hợp lệ thì `/dashboard` (EC10).
2. Không có `error`: phiên của shell đã `signed-in` thì chuyển ngay; không thì tự gọi `GET /auth/session` với `skipUnauthenticatedHandler` (khung không khung không kiểm phiên); 200 → chuyển tới `returnTo`, 401 → ở lại màn (EC09, H4) — `SignIn.tsx:44`.
3. Nút “Đăng nhập bằng eTroy”: lần đầu khóa nút, ghi đang chuyển; chế độ mock → `navigate(returnTo)` (EC12); còn lại `browser.assign(api.url('/auth/login', { returnTo }))` của shell (EC11) — `SignIn.tsx:59`.

**Provider Connections** — `Providers.tsx:58`:

1. `GET /provider-connections` qua `useResource` (`shared.tsx:121`: đang tải, lỗi có “Thử lại”, sẵn sàng). Danh sách rỗng → khối trống “Thêm API key của bạn để agent hoạt động” và form kết nối đầu tiên tự mở (EC13).
2. Bảng: tên, provider, base URL, key `••••••••` + `keyHint`, chip `testStatus` kèm giờ, mã lỗi hoặc “Không lấy được danh sách model” (EC24), agent đang dùng, cột Sửa / Kiểm tra lại / Xóa. “Kiểm tra lại” gọi `testProviderConnection`; lệnh lỗi giữ kết quả cũ (EC21).
3. Form (`ProviderForm`, `Providers.tsx:211`): mở thì focus ô tên; kết nối đầu tiên có khối NFR-PRIV-001 và ô “Tôi đã đọc” chặn nút kiểm tra. `test()` (`Providers.tsx:251`) kiểm trên máy khách (tên 1–100, `https://`, key ≥ 8), rồi `createProviderConnection` (lần đầu) hoặc `updateProviderConnection` merge-patch với `If-Match` và chỉ trường đổi (ô key trống không gửi `apiKey`, EC23), rồi `testProviderConnection`. Key xóa khỏi state ngay sau lệnh tạo hoặc sửa; form không đăng ký kho nháp (EC25). 409 `duplicate_name` → lỗi ô tên; 400 → lỗi từng trường.
4. Kết quả (`TestResult`): Valid kèm số model; Invalid kèm chip, câu của SIRes, ảnh hưởng (“Kết nối chưa dùng được cho agent nào.”), lời nhắc theo H6 (hạn mức ở provider cho `rate_limited`, `quota_exceeded`; tương thích API chính thức cho `model_not_found`, `invalid_response`), “Mã lỗi:” và một nút theo `fixActionFor` (`Providers.tsx:39`): `auth_failed`, `permission_denied` → focus ô key; `model_not_found`, `invalid_response` → focus base URL; còn lại → kiểm tra lại. Không hiện `lastError.message`. “Lưu” chỉ bật khi Valid. Kết nối đã tạo thì ô Provider khóa (hợp đồng sửa không đổi provider).
5. Xóa (`DeleteDialog`): kết nối có `assignedAgents` (mỗi agent một lần) thì bắt chọn kết nối Valid khác; nút xác nhận ghi “Xóa kết nối — chọn kết nối thay thế” và vô hiệu tới khi chọn; gửi `replacementConnectionId`; không có kết nối Valid khác → nút “Thêm kết nối”; 409 `connection_in_use` → tải lại danh sách, dialog hiện lại với agent mới (EC26–EC28). Dialog (`shared.tsx`, `Dialog`) giữ focus bên trong (Tab vòng), Esc đóng, trả focus về nút mở hoặc tiêu đề view khi nút đó đã mất.

**Profile** — `Profile.tsx:77`: đọc `GET /me` (ETag); bốn ô văn bản đăng ký kho nháp của shell (`settings.profile.*`, EC36). `save()` (`Profile.tsx:117`): `validateProfile` → `updateProfile` merge-patch chỉ trường đổi (`profilePatch`, Scholar trống → `null`) → nếu công tắc đổi thì `updatePreferences` với ETag mới; lệnh sau lỗi báo phần đã lưu và phần chưa lưu (EC33); 412 → đọc lại `/me`, giữ giá trị đang nhập, không gửi lại (EC34). “Hủy” về giá trị đã lưu.

**Agent Models** — `Agents.tsx:72`: `loadAll` đọc agent, gán, kết nối, embedding (404 → chưa chọn). Khối Mặc định, bảng chín agent (Analysis A, B). Cột Trạng thái: “Chưa cấu hình”, kết nối không Valid (“Task cần agent này sẽ bị Blocked”), “Cùng model với Analysis Agent …”, năng lực thiếu (EC41, EC42, EC44); banner cùng model nêu model và kết nối như `SettingsAgents`. Panel sửa (`AssignmentEditor`): bước 1 mọi kết nối, chỉ Valid chọn được (EC38); bước 2 model của kết nối trừ model chỉ có `embedding` (`agentModels`, EC39), không có danh sách thì nhập tay, nhãn “chưa xác minh” (EC40); “Làm mới” gọi `testProviderConnection`, Invalid → câu, mã và liên kết “Sửa ở Provider Connections” (EC47); lưu `PUT /agent-model-assignments/{agent}` (`instance` cho Analysis), 422 → lỗi ở ô model; “Dùng mặc định” → `DELETE` (EC43). Embedding (`EmbeddingRow`): chỉ kết nối Valid `openai`, `google` có ít nhất một model `embedding` (`embeddingChoices`); chưa có → lưu ngay (EC45); đổi → dialog nêu model cũ, mới, “N Reference phải index lại toàn bộ” theo `indexedReferenceCount` (#126; thiếu trường thì câu không số), usage trên kết nối, evidence tạm không dùng được; “Giữ model hiện tại” không gửi (EC46).

**Preferences** — `Preferences.tsx:58`: đọc `/me` và `GET /me/verification-thresholds` (hai ETag). Ngôn ngữ giao diện, ngôn ngữ agent, công tắc debug (“Bật · lưu tới” hôm nay + 30 ngày, `debugUntil`), ba ngưỡng (dấu thập phân theo ngôn ngữ, `parseDecimal`, 0–1). Mỗi dòng ngưỡng hiện “Mặc định 0,80” và nhãn “đã chỉnh” khi giá trị khác `defaults` (#126, H16); thiếu `defaults` thì một nhãn cho cả nhóm khi `isDefault = false` (EC52). `save()`: `updatePreferences` chỉ trường đổi → lưu xong mới `changeLanguage` của shell (EC48) → `updateVerificationThresholds`; sau mỗi lần ghi ngưỡng (PUT, reset) lấy ETag mới (header, không có thì đọc lại `GET`), lần lưu sau không gửi `If-Match` cũ (H12); 400 `validation_failed` → lỗi ở đúng ô (EC50); lệnh sau lỗi báo phần chưa lưu (EC53); 412 → đọc lại cả hai. “Khôi phục mặc định” → dialog → `resetVerificationThresholds`, form lấy giá trị trả về, nhãn “đã chỉnh” mất.

**Mock của khu vực** — `__mocks__/`: `mocks.config.json` giữ 16 operation (H10); `index.ts` khai override có type; `store.ts` giữ trạng thái trong một phiên dev: bốn kết nối của màn tham chiếu (Claude cá nhân, OpenAI cá nhân Valid; Gemini cá nhân Invalid `auth_failed`; proxy Valid trên `https://llm-proxy.example/v1`, tên miền dành riêng cho ví dụ, D-KEY), gán của `SettingsAgents` (Analysis A, B cùng `gpt-5`), embedding `text-embedding-3-small`, ngưỡng mặc định 0,80 / 0,50 / 0,60. Store không giữ key: chỉ giữ kịch bản kiểm tra suy từ chữ trong key (`wrong|invalid|sai` → `auth_failed`, `timeout`, `quota`, `limit`, `denied`, `down`).

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `ProviderForm.test` | hàm | `apps/web/src/features/settings/Providers.tsx:251` | Tạo hoặc sửa rồi kiểm tra kết nối | Sai thì hỏng PID-00036-AC01, UX-SETTINGS-002-AC01, AGENT-PROVIDER-002-AC01 | Key chỉ nằm trong state tới khi lệnh tạo, sửa trả về; không vào URL, storage, kho nháp, log; sửa chỉ gửi trường đổi kèm `If-Match` | `providers.spec.tsx` › key sai Invalid kèm hành động; › key không lộ; › sửa về Untested |
| `fixActionFor` | hàm | `apps/web/src/features/settings/Providers.tsx:39` | Mã lỗi provider → một hành động sửa | AC01 (nút “Sửa API key”) | Mỗi kết quả Invalid đúng một nút | `providers.spec.tsx` › key sai Invalid kèm hành động; › lỗi tạm thời |
| `DeleteDialog.confirm` | hàm | `apps/web/src/features/settings/Providers.tsx:432` | Xóa, kèm kết nối thay thế | Xóa không đảo ngược; AGENT-PROVIDER-002-AC03 | Kết nối đang gán chỉ xóa khi đã chọn kết nối Valid khác | `providers.spec.tsx` › xóa cần thay thế; › 409 connection_in_use |
| `SignInScreen` | component | `apps/web/src/features/settings/SignIn.tsx:26` | Một hành động đăng nhập, khung lỗi, chuyển khi đã có phiên | Điểm vào duy nhất của tài khoản (UX-AUTH-001, UX-AUTH-002) | Không có phương thức đăng nhập khác; `returnTo` chỉ là đường dẫn trong ứng dụng | `signin.spec.tsx` (10 test) |
| `ProfileScreen.save`, `PreferencesScreen.save` | hàm | `Profile.tsx:117`, `Preferences.tsx:97` | Hai lệnh nối tiếp, ETag nối tiếp | Mất dữ liệu nếu sai (412, lưu một phần) | Chỉ gửi trường đổi; 412 không tự gửi lại; báo đúng phần đã lưu | `profile.spec.tsx` › hai lệnh; › 412; `preferences.spec.tsx` › hai lệnh; › 412 |
| `EmbeddingRow` | component | `apps/web/src/features/settings/Agents.tsx:384` | Chọn, đổi embedding model | Đổi model buộc index lại toàn bộ (UX-SETTINGS-003-AC01) | Đổi model đang có luôn qua dialog xác nhận; hủy không gửi | `agents.spec.tsx` › đổi embedding xác nhận; › embedding lần đầu |
| `agentModels`, `embeddingChoices` | hàm | `apps/web/src/features/settings/Agents.tsx:36`, `:41` | Lọc model theo năng lực | Gán sai model cho agent hoặc embedding | Agent không nhận model chỉ có `embedding`; embedding chỉ OpenAI, Gemini | `agents.spec.tsx` › lọc model; › đổi embedding xác nhận |
| Điều kiện `Feature.mocks` | điều kiện build | `apps/web/src/features/settings/index.tsx:32` | Chỉ nạp mock khi dev, test | Lọt thì bản build có mock | `vite build` bỏ mock kể cả khi `NODE_ENV=development` | `shell/mock/build.spec.ts` › bản build không có mock |
| Store của mock | module | `apps/web/src/features/settings/__mocks__/store.ts:150` | Dữ liệu có trạng thái cho dev | Mọi màn trên mock dùng nó | Không giữ key; host proxy là tên miền ví dụ | mọi `*.spec.tsx` của khu vực (`resetSettingsMockState` trước mỗi test) |

## 3. Quyết định kỹ thuật trong phạm vi

- Mock không áp `If-Match`: `getMe` của shell không giữ trạng thái, áp vào thì lưu lần hai trên dev luôn 412. Test 412 dùng `mock.use` — `__mocks__/index.ts`.
- Test trả lỗi bằng `Response` (`test-helpers.tsx:45`): runtime của PID-00013 bỏ thân của status mà operation không khai (như 503). Mock của khu vực cũng trả `Response` cho 409 `duplicate_name` của `updateProviderConnection` (hợp đồng chưa khai 409 cho lệnh này).
- `mergePatch` (`shared.tsx`): thân merge-patch của `updateProfile`, `updatePreferences` mang kiểu component đầy đủ (trường bắt buộc); ép kiểu một chỗ, như shell (`shell/preferences.ts`). URL Scholar trống gửi `null` đúng type sau #126. Sửa ở nguồn: report.md mục 6.
- Nhánh dựng màn đã merge `docs/pid-00036-sources` (#126, trên #122): type sinh có `VerificationThresholds.defaults`, `EmbeddingSettings.indexedReferenceCount`, `googleScholarProfileUrl` nhận `null`; thiết kế Settings đã sửa (cột Thao tác, biến thể first-connection, delete).
- Chữ trên màn lấy từ màn tham chiếu `docs/ui-design/source/` và câu của AC; tên khu vực và thuật ngữ cố định giữ tiếng Anh (Settings, Profile, Provider Connections, Agent Models, Preferences, Supported, Partially Supported) như shell.
- Định dạng ngưỡng hai chữ số thập phân theo ngôn ngữ (`0,80` ở vi).
- Khung Settings tối đa 1360 px; bảng cuộn trong thẻ khi hẹp (design.md §5).
- Không sửa file của shell (điểm dừng): hai test của shell (`shell/routes.spec.ts` EC17, `shell/preferences.spec.ts` EC28) bám placeholder `sign-in` và đòi `/sign-in` không gửi request nào, trong khi SignIn thật gọi `getSession` (H4); đã báo phiên điều phối kèm cách sửa, phiên web-shell sửa. Tới lúc đó hai test này đỏ trên nhánh.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
