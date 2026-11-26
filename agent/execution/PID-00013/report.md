# PID-00013 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00013](../../../docs/tickets/issues/PID-00013/index.html) · **Luồng:** `web/shell` · **Giai đoạn:** PH-01
- **Nhánh:** `web/mock-pid-00013-v3` (tạo từ `origin/main` `c9e745b`, lịch sử dựng lại từ `web/mock-pid-00013`; đã commit) · **PR:** PR mới từ nhánh này (thay [#128](https://github.com/toilatrung/sires/pull/128) và [#129](https://github.com/toilatrung/sires/pull/129)), base `main`, xếp chồng trên #120
- **Cập nhật:** 27/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

Người làm: phiên do PO `toilatrung` giao (assignee `toilatrung`). `check-pid.mjs PID-00013`: ĐỦ để thực thi (0 cảnh báo). PID-00012 (shell) đang làm song song ở nhánh `web/shell-pid-00012`, chưa có client API và client SSE: mock đã chạy được với `fetch` và `EventSource` (thử trên trình duyệt), việc nối vào client của shell ghi ở mục 4.

## 1. Tóm tắt

- Slice: 4/4 xong (S02, S03 phần nối vào client của PID-00012 còn chờ PID đó merge, mục 4). Bị chặn: không có.
- AC: 1/1 đạt (kiểm với bản OpenAPI mẫu và bundle thật). Edge case: 13/13 đã giải quyết; 2 cần lưu ý (EC08, EC11 kiểm bằng `fetch` và bộ đọc SSE trong test, chưa qua client của shell).
- Yêu cầu thêm: 3 (YC1–YC3).

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Bộ sinh mock có type từ OpenAPI công khai | Xong | tạo: `apps/web/src/shell/mock/generate.mjs`, `generate.d.mts`, `generator/{openapi,sample,vocabulary}.mjs`, `generator/{openapi,sample}.d.mts`, `mocks.config.json`; sửa: `apps/web/package.json` (devDeps, target `generate-mocks`), `pnpm-lock.yaml` |
| S02 | Bật mock khi dev và test, ghép mock khu vực, phiên mẫu, build không có mock | Xong (chờ nối client API của PID-00012) | tạo: `shell/mock/{runtime,types,session,index,node,browser}.ts`, `shell/mock/fixtures/*.ts` (YC1), `shell/mock/build.spec.ts`; sửa: `apps/web/src/main.tsx` (điểm nối), `apps/web/src/shell/feature.ts` (`mocks?`), `apps/web/vite.config.ts` (plugin `msw()`), `apps/web/README.md`, `apps/web/package.json` (script `dev:mock`) |
| S03 | Mock mẫu `/events`, nối lại theo `Last-Event-ID` | Xong (chờ nối client SSE của PID-00012) | tạo: `shell/mock/events.ts`, `shell/mock/events.spec.ts`; vòng sự kiện mẫu ở `shell/mock/browser.ts` |
| S04 | Đổi schema thì typecheck báo lệch; README cho khu vực | Xong | tạo: `shell/mock/mock.spec.ts`, `shell/mock/__fixtures__/sample-openapi.yaml`, `__fixtures__/sample-override.ts.txt`, `shell/mock/README.md` |

## 3. Kết quả

- `pnpm --filter @sires/web dev:mock` (hoặc `VITE_SIRES_MOCK=1` + `dev`): mọi request `/api/v1/*` có câu trả lời mà không cần gateway; đã thử trên trình duyệt ở cổng riêng: `/api/v1/me` trả “Nguyễn Thị Minh Anh”, `uiLanguage = vi`; `/api/v1/projects` ba project đang hoạt động (vi, en); `/api/v1/dashboard` 4 Pending Action, 3 thông báo chưa đọc; `/api/v1/projects/{id}/tasks` 6 Task ở 6 trạng thái; `/api/v1/events` qua `fetch` và `EventSource` nhận sự kiện, nối lại kèm `Last-Event-ID` nhận đúng sự kiện sau id. Console không có lỗi; MSW in từng request.
- `pnpm --filter @sires/web dev` không cờ: không nạp mã mock, `/api/v1/me` đi qua proxy Vite (ECONNREFUSED vì không có gateway) — EC06.
- Bộ sinh: 165/165 operation của bundle, 347 body JSON hợp lệ theo schema (Ajv 2020), typecheck đạt với `PublicApi`.
- Khu vực thêm mock theo `apps/web/src/shell/mock/README.md`: `mocks.config.json` → `generated/` → `index.ts` có type → `Feature.mocks`.
- Chi tiết lệnh và kết quả: [self-qc.md](self-qc.md).

## 4. Việc còn lại

- Khi PR của PID-00012 merge (phiên điều phối báo): rebase, giải xung đột ở `main.tsx`, `feature.ts`, `vite.config.ts`, `package.json`, `pnpm-lock.yaml`; đổi `events.spec.ts` › nối lại sang client SSE của shell (S03 “client SSE của shell nhận sự kiện mẫu…”) và thêm test kiểm phiên của shell chạy trên mock (S02, EC08 qua client API). Mock không cần đổi nếu client gọi `/api/v1/...`.
- Khi hợp đồng có `replay.unavailable` (PC-05 P2, phiên docs-sources): sinh lại; mock tự gửi tín hiệu, đổi test “chưa có trong hợp đồng thì không giả lập” thành kiểm có tín hiệu.

## 5. Yêu cầu thêm

Ủy quyền của PO (nguyên văn, 26–27/11/2026, phiên điều phối chuyển): “PH-01 đang trong giai đoạn hoàn thiện, các vấn đề còn chưa đạt thì tự đề xuất và hoàn thiện cho xong giúp tôi … tôi cần xây giao diện trước để cho dev trực quan theo dõi. Nên hãy đẩy các task UI lên sớm trong PH-02 hoàn thiện tối đa nhất có thể. Các vấn đề phát sinh hãy chốt theo đề xuất (OIDC viết mockup server để test chứ chưa cần dùng OIDC thật)”.

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | Phiên điều phối của PO (theo ủy quyền trên) | “Dữ liệu mẫu tách theo khu vực … Dữ liệu mẫu giống thật, có cả tiếng Việt và English: project nghiên cứu, Plan, Task, reference, prompt, workflow, agent run, notification… Đủ để màn demo nhìn như thật.” | Đổi phạm vi: mở rộng P1 (dữ liệu sinh) sang bộ dữ liệu demo dùng chung; chạm N1 ở phần dữ liệu (mock riêng, kịch bản, trạng thái vẫn của khu vực) | Làm (chốt theo đề xuất, PO ủy quyền 26/11/2026): dữ liệu demo không giữ trạng thái ở `shell/mock/fixtures/<khu vực>.ts`, trả cho GET khi khu vực chưa có mock riêng; khu vực thêm hoặc thay hàng ở `features/<khu vực>/__mocks__/` như hồ sơ. Dữ liệu sinh theo schema cũng dùng từ điển vi/en. Không dùng lại được dữ liệu 16.4 của e2e (PID-00034): luồng khác, dùng `node:crypto`, nhãn kiểm thử (“Researcher A”, “P1”); giữ cùng dạng entity | `fixtures/*.ts`; `mock.spec.ts` › dữ liệu demo hợp lệ theo schema; › dữ liệu demo theo project và id |
| YC2 | Phiên điều phối của PO | “Chỉ sửa: `apps/web/src/mocks/**`; `apps/web/package.json`…; một điểm nối mock duy nhất.” | Lệch Đầu ra của ticket (`apps/web/src/shell/mock/`, quy tắc 1.4.13) | Theo hồ sơ: mã ở `apps/web/src/shell/mock/`. Ngoài thư mục đó sửa những gì slice yêu cầu: `main.tsx` (điểm nối), `shell/feature.ts` (S02: trường tùy chọn của `Feature`), `vite.config.ts` (plugin phục vụ service worker khi dev), `apps/web/README.md` (S02: cách bật), `apps/web/package.json` | mục 2 |
| YC3 | Phiên điều phối của PO | “mock `/events` (gồm cả loại sự kiện `replay.unavailable` theo PC-05 P2, phiên docs-sources đang thêm vào hợp đồng)” | Đổi phạm vi: bỏ N7 khi hợp đồng có tín hiệu (PC-05 P2, PO ủy quyền) | Làm: mock gửi `replay.unavailable` (không id) khi `Last-Event-ID` không còn trong bộ giữ, chỉ khi enum `Event.type` của bundle có giá trị đó; không tự đặt tên hay dạng | `events.spec.ts` › không còn phát lại được: chưa có trong hợp đồng thì không giả lập; › Last-Event-ID quá xa thì gửi tín hiệu trước, không phát lại |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  - Thêm cấu hình `web-mock` vào `.claude/launch.json` (`npm run dev:mock --prefix apps/web -- --port 5183 --strictPort`) để xem demo trong khung preview mà không trùng cổng 5173; chưa sửa vì ngoài thư mục được giao.
  - `libs/ts/contracts/scripts/generate.mjs` lỗi `EPERM` khi đổi tên `src/generated` trên Windows (gặp 2 lần; xóa thư mục rồi chạy lại thì được; Nx báo task “flaky”): đề xuất PID nhỏ cho luồng contracts (thử lại khi EPERM).
  - Hồ sơ PID-00036 mục 2.3 liệt kê mock `getSession`, `getMe` cho settings; shell đã giữ hai operation này (S02, EC08), nên khu vực settings khai lại sẽ gặp lỗi EC10 như trang ticket đã báo trước. Cần PO chọn khi làm rõ PID-00036 (tương tự `answerPrompt` giữa PID-00058 và PID-00060).
- **Yêu cầu hợp đồng:** `Event` (`components/schemas/orchestration.yaml#/Event`) chỉ được trỏ qua `x-event-schema` của `/events` nên không có trong `components.schemas`: `PublicApi` không có type `Event` (PID-00012 S05, PID-00013 S03 cần), bundle còn ref hỏng `common.yaml#/Id`, `common.yaml#/Timestamp`. Đề xuất thêm `Event` vào `components.schemas` của `openapi.yaml` cùng lượt PC-05 P2. Phiếu I1 (đã báo phiên điều phối 27/11/2026; file phiếu soạn sẵn ở thư mục ghi chú của phiên điều phối, chưa đưa vào `docs/` vì `update-index.mjs` là việc của PO). Không chặn: bộ sinh tạm suy type từ `x-event-schema`.
- **Còn mở:** không có (I1 đã trả lời, xem Lần 2).
- **Bước tiếp theo:** QC độc lập chạy `spec-converge-skill PID-00013`; nối client của PID-00012 khi PR đó merge (mục 4).
- **Tài liệu đi kèm:** không có.


## Lần 2 — 27/11/2026

Phiên điều phối trả lời phiếu I1 (nguyên văn): “Trả lời phiếu I1 (PID-00013): chốt theo đề xuất của bạn. docs-sources sẽ sửa trong PR A cùng lượt P2 …” và “Phiếu I1 đã được sửa ở PR #120 … Merge `origin/docs/pc05-p1-p6-shell-sources` vào nhánh của bạn (merge, không rebase). Sinh lại type, bỏ đường dự phòng `x-event-schema` nếu không còn cần. Ghi trong mô tả PR: ‘xếp chồng trên #120 …; PO merge #120 trước’.”

- Đã merge `origin/docs/pc05-p1-p6-shell-sources` (head `702d051`) vào nhánh của PID này (merge commit, có chữ ký). PR xếp chồng trên #120: PO merge #120 trước.
- Sinh lại `@sires/contracts` và mock: `PublicApi.components['schemas']['Event']` có `replay.unavailable`; module mock dùng type này. Bỏ đường suy type từ `x-event-schema` (`eventTypes` dùng `openapi-typescript`, file `generated/event-schema.ts`) và nhánh đọc ref tương đối trong `generator/openapi.mjs`; bộ sinh dừng với lỗi rõ nếu bundle thiếu `Event`, và xóa file sinh cũ trong `generated/` trước khi ghi.
- `/events` theo mô tả mới của hợp đồng: `Last-Event-ID` không còn phát lại được (cũ hơn log còn giữ, lạ, sai định dạng) → bản ghi `replay.unavailable` đầu luồng có `id` = vị trí mới nhất của log (log trống: `0`), `data` chỉ `id`, `type`, `at`; nối lại trong khoảng giữ (kể cả `0`) không có tín hiệu. YC3 xong theo hợp đồng.
- `/auth/logout` đổi sang `303` (PC-05 P3, cùng PR #120): mock trả `303` về `/` trong ứng dụng, không tới eTroy; test 204 chuyển sang `deleteProviderConnection`.
- Phiếu I1: đánh dấu “Đã trả lời: chốt theo đề xuất (PO ủy quyền 26/11/2026), sửa ở PR A của docs-sources (#120)” trong file phiếu ở thư mục ghi chú của phiên điều phối (`PID-00013-issues.html`). Chưa đưa vào `docs/tickets/issues/PID-00013/others/issues.html`: thêm file đó làm `node scripts/docs/update-index.mjs --check` (CI) báo lệch, mà chạy `update-index.mjs` (dựng lại taskboard) là việc của PO; đề nghị đưa file vào PR #120 (PR tài liệu, đã chạy lại chỉ mục).
- Self-QC: [self-qc.md](self-qc.md) mục “Lần 2”. G5 đã xử lý.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
## Lần 3 — 27/11/2026

Check `secrets` của PR #128 (gitleaks `generic-api-key`) báo dương tính giả ở commit đầu: hai khóa BibTeX mẫu (dòng 35 và 47 của `apps/web/src/shell/mock/fixtures/library.ts`, trường `key` của kiểu cục bộ `Paper`). Gitleaks quét mọi commit của PR nên commit sửa sau không xóa được. Phiên điều phối chọn (nguyên văn): “Chọn A, chốt theo đề xuất của bạn. Đẩy lịch sử sạch sang `web/mock-pid-00013-v2` và mở PR mới vào `main` … Không force-push, không sửa `infra/ci/gitleaks.toml`.”

- Lịch sử dựng lại: cùng các commit, mọi commit ký SSH; nội dung khác `web/mock-pid-00013` đúng một chỗ: trường `key` của kiểu cục bộ `Paper` (chỉ dùng trong file fixture) đổi thành `cite`. Trường của hợp đồng là `Reference.bibtexKey` (`components/schemas/library.yaml`), vẫn giữ nguyên; `mock.spec.ts` › dữ liệu demo hợp lệ theo schema đạt.
- Lần đẩy đầu sang `web/mock-pid-00013-v2` (PR #129) lại bị `secrets` báo, vì chính ghi chú Lần 3 trong `report.md` chép nguyên hai giá trị đó. Không force-push được, nên dựng lại thêm một lần ở `web/mock-pid-00013-v3` với ghi chú không chép giá trị, kiểm trước khi đẩy bằng bộ quét theo luật `generic-api-key` (regex và entropy) trên mọi dòng thêm của dải commit. PR mới từ `v3` thay #128 và #129; hai PR cũ đóng sau khi `secrets` của PR mới xanh.

