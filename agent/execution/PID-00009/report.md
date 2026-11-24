# PID-00009 — Báo cáo thực thi

**Trạng thái:** Bị chặn — EC11: `develop` thiếu #88, #89 nên chưa chạy T3 với cache `main` (AC01); G19 cần PO chọn cách đưa mã hợp đồng sinh ra vào hash Nx

- **Ticket:** [PID-00009](../../../docs/tickets/issues/PID-00009/index.html) · **Luồng:** infra · **Giai đoạn:** PH-01
- **Người thực hiện:** congminh1705 (Lần 1–7); từ Lần 8 (24/11/2026) phiên do PO `toilatrung` giao · **Nhánh:** `infra/pid-00009-ci` (Lần 1–7), `infra/pid-00009-t5-cache-main` (Lần 8) · **PR:** [#57](https://github.com/toilatrung/sires/pull/57)
- **Cập nhật:** 24/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

Hồ sơ đạt kiểm tra đầu vào với 8 AC, 22 edge case và 0 cảnh báo.

- S01–S09 và S11–S12 đã có kết quả Actions; S10 đã có số đo cold và warm cache của PR. Cache của main và T5 còn chờ sau merge.
- T4 của bản sửa `d8c7076` đạt ở [attempt 2](https://github.com/toilatrung/sires/actions/runs/45024841054/attempts/2). T1, T2, T3, T7 đã chạy trên develop `518fc4e`; xem Lần 6 và [bằng chứng](acceptance-20261122.json).
- Lần 8 (24/11/2026): T5 có đủ bằng chứng trên `main`: 6 lần push sau #57 đều đạt ở lần chạy đầu, cache Nx nối tiếp giữa các lần, task có input đổi chạy lại; hai lần push của #88 và #89 chạy chồng nhau và cùng chạy hết. T3 với cache `main` chưa chạy: `develop` thiếu 2 commit của `main` (#88, #89), theo EC11 dừng PR thử, chờ PO đồng bộ.
- Lần 8 sửa hai lỗi trong phạm vi: `nx.json` khai `inputs` cho `lint`, `typecheck`, `test` để project không phụ thuộc project nào (`sires-common`, `@sires/contracts`) cũng nhận file gốc ở EC06 (G18); bảng job của `build` không in số giây âm cho job skipped (G8 của QC). Phát hiện G19 (HIGH, cần PO): mã hợp đồng sinh từ `docs/api-design` không nằm trong hash của các task dùng nó.
- AC: AC02, AC03, AC07 đạt; AC06 đạt theo input Nx đã khai, còn G19; AC04, AC05 đạt trên mã CI của `develop` cũ; AC08 đạt, phần số giây của job skipped sửa trong Lần 8, chưa chạy trên `main`; AC01 chưa kết luận.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Kiểm thay đổi và tách job CI | Đạt T1, T2, T4 | Xem implement.md |
| S02 | S02-python-graph | Đạt T2; Lần 8 sửa EC06 cho project không phụ thuộc project nào (G18) | `nx.json` (Lần 8) |
| S03 | S03-speed | Đạt hủy run PR, T5 trên `main` (cache, hai push gần nhau); Lần 8 sửa số giây job skipped | `.github/workflows/ci.yml` (Lần 8) |
| S04 | S04-contract-spec | Đạt T4 | Xem implement.md |
| S05 | S05-secret-scan | Đạt T7: phát hiện và che secret mẫu | Xem implement.md |
| S06 | Quét phụ thuộc | Đạt T4 | `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `patches/query-string@7.1.3.patch` |
| S07 | S07-build-image | Đạt T2, T3, T4 | Xem implement.md |
| S08 | S08-schemathesis | Đạt T4/T6 | Xem implement.md |
| S09 | S09-asyncapi | Đạt T4/T6 | Xem implement.md |
| S10 | Số đo CI | Có cold 141s, warm PR 60s, 6 lần push `main` 171–228s; T3 với cache main chờ đồng bộ `develop` (EC11) | infra/ci/measure.mjs |
| S11 | Helm | Đạt lint/render và smoke test artifact trên CI T4 | .github/workflows/ci.yml, infra/ci/check-helm-images.sh |
| S12 | Terraform | Đạt fmt và validate trên CI T4 | .github/workflows/ci.yml |

## 3. Kết quả

Đã tạo nhánh từ origin/main mới nhất. Đã xác nhận mã kiểm lệch spec của PID-00008 có trên origin/main.

Đã kiểm EC22: lock file đi kèm thay đổi gateway không làm phát sinh luồng infra; thay đổi Helm vẫn thuộc luồng infra.

Đã kiểm actionlint, Redocly và bundle, đồ thị Nx Python, phân loại thay đổi, ma trận Dockerfile Python, Gitleaks với chuỗi giả và các fixture OpenAPI/AsyncAPI. Hai lượt Nx toàn bộ bị gián đoạn bởi lỗi EPERM khi sinh hợp đồng trên Windows.

## 4. S10 — số đo và ngưỡng OQ-112

Lệnh giữ lại trong repo: `node infra/ci/measure.mjs toilatrung/sires`.

| Loại run cần đo | Số lượt hợp lệ | Số đo hiện có | Trạng thái |
| --- | ---: | --- | --- |
| PR vào `develop`, chỉ đổi tài liệu (T1) | 2/20 theo `measure.mjs` (T1 đạt, T7 thất bại có chủ đích) | 43 giây (T1) | Chưa đủ 20; không in ngưỡng |
| PR vào `develop`, sửa `gateway` có warm cache main (T3/AC01) | 0/1 đúng loại main cache | Cold 141s; warm cache PR 60s, 8/8 task cache hit | Cache PR chỉ tham khảo; chờ PO đồng bộ `develop` (EC11, Lần 8) |
| Push vào `main` (T5) | 6/20 (24/11/2026) | 182, 188, 171, 191, 215, 228 giây; cả 6 đạt ở lần chạy đầu | Chưa đủ 20; không in ngưỡng (Lần 8) |

T4 ở PR #57 là lượt chế độ toàn bộ để xác nhận workflow tại HEAD, không được trộn vào hai loại số liệu trên.

## 5. Việc còn lại

- T3 với cache `main` (AC01): chờ PO đồng bộ `develop` theo `main` (EC11), rồi mở PR thử từ `develop` mới như #75 (Lần 8).
- G19 (HIGH): PO chọn cách đưa mã hợp đồng sinh ra vào hash Nx và luồng làm (Lần 8).
- T1 (hai push), T2 chạy lại trên mã CI mới của `develop` để đóng G7 của QC; làm cùng đợt với T3.
- Test outbox có lỗi thứ tự không ổn định cần luồng platform theo dõi (Lần 6).

## 6. Yêu cầu thêm

- congminh1705 yêu cầu xử lý các dependency đang chặn S06. Cập nhật phiên bản trong catalog và lock file, không thêm ngoại lệ.
- YC Lần 8 — PO `toilatrung`, 24/11/2026, qua phiên PO giao việc: “Chuyển hết toàn bộ công việc còn lại sang PO toilatrung để hoàn thiện PH-01 trong hôm nay”, rồi “Chạy ngay”. Phân loại: trong phạm vi (đổi người làm, không đổi AC). Đã làm: T5, kiểm EC06, sửa G18 và số giây job skipped, ghi kết quả; T3 dừng theo EC11.

## 7. Cần PO và tài liệu đi kèm

- **Cần PO:** (1) Đồng bộ `develop` theo `main` (thiếu #88, #89) để chạy T3 với cache `main`. (2) G19: chọn phương án (a) hoặc (b) ở Lần 8 và luồng làm. (3) Làm rõ EC15/S11 về image smoke khi chỉ đổi chart (G16 của QC, chưa có trả lời).
- **Tài liệu đi kèm:** [acceptance-20261122.json](acceptance-20261122.json), [qc-report.md](qc-report.md).

## Lần 2 — 20/11/2026

Triển khai mã S01–S09 và công cụ đo của S10. Ghi trạng thái bị chặn sau khi kiểm điều kiện nhánh và các ticket phụ thuộc.

## Lần 3 — 20/11/2026

Trivy quét lại hai lock file và chính sách S06 thoát 0. Test hồi quy web, gateway, platform và testing đạt 96 test.

## Lần 4 — 21/11/2026

Hợp nhất origin/main tại ae1ac60, gồm PID-00010 và PID-00011. Tích hợp Helm và Terraform vào CI, tái tạo pnpm-lock.yaml theo baseline mới và kiểm frozen install. Helm lint/render đạt 12 service. Terraform fmt và validate đạt sáu module và hai môi trường. Job Helm lấy image smoke từ artifact cùng lượt CI cho gateway và agent-core có trong ma trận.

## Lần 5 — 22/11/2026

Rerun CI trên commit HEAD `51befc7` đạt ở attempt 2 (run 44931193323). Xác nhận T4 gồm job tổng `build`, Helm smoke test và Terraform. Cập nhật S10 để ghi rõ số lượt hiện có, không dùng T4 thay cho T1/T3/T5.

---

## Lần 6 — 22/11/2026 · Sửa PR và chạy nghiệm thu theo yêu cầu PO

PO yêu cầu “chạy nốt nghiệm thu đi ròi đẩy lên”, sau đó chọn “Chỉ đẩy bản sửa; để T5 sau merge”. Bản sửa code đầu tiên `d8c7076` đã được GitHub xác nhận Verified. Không merge PR #57, không sửa `docs/` hoặc thay đổi `develop`.

| Ca | PR / run | Kết quả | Thời gian | Job chậm nhất |
| --- | --- | --- | ---: | --- |
| T1 docs-only | [#73](https://github.com/toilatrung/sires/pull/73), [run](https://github.com/toilatrung/sires/actions/runs/45024781831) | Đạt; chỉ changes/docs/tracks/secrets/build chạy, các job khác skipped | 43s | changes 26s |
| T1 concurrency | [run cũ](https://github.com/toilatrung/sires/actions/runs/45024755723) | Cancelled khi push thứ hai; run mới đạt | 28s trước khi hủy | — |
| T2 Python | [#74](https://github.com/toilatrung/sires/pull/74), [run](https://github.com/toilatrung/sires/actions/runs/45024785948) | Đạt; 4 project Python, TS skipped, chỉ image agent-core/knowledge | 99s | python 69s |
| T3 cold Nx | [#75](https://github.com/toilatrung/sires/pull/75), [attempt 1](https://github.com/toilatrung/sires/actions/runs/45024813714/attempts/1) | Đạt; không có Nx cache | 141s | image gateway 108s |
| T3 warm cache PR | [attempt 2](https://github.com/toilatrung/sires/actions/runs/45024813714/attempts/2) | Đạt; runner khác lấy 8/8 task từ Nx cache của PR #75 | 60s | contract-test 26s |
| T4 bản sửa | [#57](https://github.com/toilatrung/sires/pull/57), [attempt 2](https://github.com/toilatrung/sires/actions/runs/45024841054/attempts/2) | Đạt sau rerun phần lỗi; toàn bộ các job, Helm, Terraform, image và T6 đạt | 198s attempt đầu; 66s rerun | TS 150s ở attempt đầu |
| T7 secret giả | [#76](https://github.com/toilatrung/sires/pull/76), [run](https://github.com/toilatrung/sires/actions/runs/45024821794) | Đúng kỳ vọng: secrets và build failure; github-pat báo fixture dòng 3, giá trị REDACTED | 26s | changes 18s |

Thời gian attempt đầu lấy từ tạo workflow tới hoàn tất; rerun lấy từ `run_started_at` của attempt để không tính khoảng chờ người chạy. T1/T2/T3/T7 dùng baseline develop `518fc4e`; T4 dùng bản sửa `d8c7076`. Các sửa bộ lọc mới còn được kiểm cục bộ bằng 8 trường hợp và đồ thị task TS/Python. Cả bốn PR thử đã đóng và xóa nhánh; không đưa fixture secret hoặc comment thử vào PR #57.

T4 attempt đầu lỗi `sires-common:test`, `test_envelope_and_rollback`: thứ tự `['audit', 'event']` thay vì `['event', 'audit']`. Query sắp `created_at,id`; hai UUIDv7 có phần ngẫu nhiên trong cùng mili giây nên test không bảo đảm thứ tự gọi. Rerun phần lỗi một lần đạt; không sửa mã/test của thư viện trong ticket infra. Đây là rủi ro test không ổn định còn cần platform xử lý.

Sửa bổ sung khi nghiệm thu: giữ được số liệu PR đã đóng/xóa nhánh bằng tra danh sách PR develop theo nhánh, repo và khoảng thời gian; log bảng tổng hợp bằng `tee` đồng thời với job summary để có bằng chứng trong Actions log. Chưa kết luận đủ AC01/AC06/AC07 cho phần main: các phép thử hậu merge được giữ mở theo quyết định PO.

Chạy lại `measure.mjs` sau khi đóng/xóa nhánh: 2/20 run PR không chạm code (T1 và T7), 0/20 push main. Công cụ giữ chính sách đếm run đã hoàn tất trừ cancelled, nên T7 thất bại có chủ đích vẫn được tính vào nhóm không chạm code; đây không phải hai mẫu T1 thành công. Chưa đủ 20 mẫu nên không in p95/ngưỡng. Frozen install, ESLint hai script, cú pháp Node, giấy phép, chỉ mục, kiểm hồ sơ kết quả và diff whitespace đều đạt.

## Lần 7 — 22/11/2026 · Kiểm báo cáo bằng Gitleaks

CI `add5003` (run 45025760053) phát hiện false positive `generic-api-key` tại `qc-report.md:18`: cụm nhãn trạng thái `skipped/concurrency` đứng sau từ “secret”. Thêm allowlist regex neo hai đầu cho đúng giá trị này trong `infra/ci/gitleaks.toml`, không bỏ quét file/commit hay tắt rule. Gitleaks 8.24.3 chạy cục bộ trên toàn bộ `origin/main..HEAD` đạt, 8 commit không có leak; quét fixture token giả với cùng config vẫn thoát 1 và báo một leak. Không đưa fixture vào Git. Đây là lần kiểm bổ sung, không thay đổi kết quả T7 đã có.

## Lần 8 — 24/11/2026 · T5 trên `main`, sửa cache EC06, T3 chờ đồng bộ `develop`

Căn cứ: ngày 24/11/2026 PO `toilatrung` chuyển phần còn lại của PID-00009 sang PO (“Chuyển hết toàn bộ công việc còn lại sang PO toilatrung để hoàn thiện PH-01 trong hôm nay”, rồi “Chạy ngay”), lời PO do phiên PO giao việc chuyển lại. Người làm: phiên do PO `toilatrung` giao. Nhánh `infra/pid-00009-t5-cache-main` cắt từ `origin/main` `0153261`. Không sửa `docs/`, không đổi `develop`, không push vào `main`.

### T5 — push vào `main` (AC06, AC07)

Nguồn: `gh run list --branch main --event push`, API `actions/runs/<id>/jobs`, log job `typescript` và `python` của từng lần. Thời gian tính từ `created_at` tới `updated_at`; cả 6 lần đều là attempt 1, không rerun.

| # | Run | Commit (PR) | Kết quả | Giây | Cache Nx khôi phục (TS) | Nx đọc từ cache: TS · Python | Task chạy lại và lý do |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 1 | [45033510448](https://github.com/toilatrung/sires/actions/runs/45033510448) | `29edd87` (#57) | 24 job đạt, `tracks` skipped | 182 | Không có: `Cache not found for input keys: nx-ts-Linux-main-29edd87…, nx-ts-Linux-main-` | 0/63 · 0/13 | Lần đầu có workflow mới, mọi task chạy |
| 2 | [45036410342](https://github.com/toilatrung/sires/actions/runs/45036410342) | `e916ae2` (#78) | 24 đạt, `tracks` skipped | 188 | `nx-ts-Linux-main-29edd87…` | 61/63 · 11/13 | `generate-ts`, `generate-python` (đổi `docs/api-design/*.yaml`); `@sires/platform:test`, `sires-common:test` (đổi `docs/database/ddl/library.sql`, input đã khai của hai target) |
| 3 | [45040139870](https://github.com/toilatrung/sires/actions/runs/45040139870) | `f9da4af` (#80) | 24 đạt, `tracks` skipped | 171 | `nx-ts-Linux-main-e916ae2…` | 62/63 · 12/13 | `generate-ts`, `generate-python` (đổi `docs/api-design`) |
| 4 | [45203674571](https://github.com/toilatrung/sires/actions/runs/45203674571) | `1947571` (#64) | 24 đạt, `tracks` skipped | 191 | `nx-ts-Linux-main-f9da4af…` | 29/63 · 13/13 | 34 task `lint`, `typecheck`, `test` của `@sires/platform` và các project dùng nó (đổi `libs/ts/platform/src/errors/errors.spec.ts`); task `build` lấy cache vì input `production` bỏ `*.spec.ts` |
| 5 | [45416191365](https://github.com/toilatrung/sires/actions/runs/45416191365) | `10ee7a6` (#88) | 24 đạt, `tracks` skipped | 215 | `nx-ts-Linux-main-1947571…` | 59/63 · 13/13 | 4 task của `@sires/planning` (`build`, `typecheck`, `lint`, `test`) |
| 6 | [45416543323](https://github.com/toilatrung/sires/actions/runs/45416543323) | `0153261` (#89) | 24 đạt, `tracks` skipped | 228 | `nx-ts-Linux-main-10ee7a6…` (cache do lần 5 lưu) | 59/63 · 13/13 | 4 task của `@sires/workspace` |

- Mỗi lần có 25 job: `changes`, `docs`, `secrets`, `tracks`, `typescript`, `python`, `contracts`, `dependencies`, `terraform`, `contract-test`, `asyncapi-payload`, 12 job `images`, `helm`, `build`. `typescript` chạy `nx run-many -t lint typecheck test build --projects=tag:lang:ts` (16 project, cộng 1 task phụ thuộc), `python` chạy 4 project; `tracks` chỉ chạy ở pull request nên skipped đúng thiết kế.
- Dòng log Nx (lần 6, job `typescript`): `Nx read the output from the cache instead of running the command for 59 out of 63 tasks.` Task lấy từ cache in `[existing outputs match the cache, left as is]` hoặc `[local cache]`; task chạy lại in `✅ > nx run …`. Mỗi lần lưu khóa mới `nx-ts-Linux-main-<sha>`, `nx-python-Linux-main-<sha>`.
- Hai push gần nhau: PO merge #88 lúc 14:37:31Z và #89 lúc 14:39:27Z. Lần 5 chạy 14:37:34–14:41:09Z, lần 6 chạy 14:39:30–14:43:18Z, chồng nhau 99 giây. Cả hai `completed`/`success`, không lần nào `cancelled` (nhóm concurrency của push là `CI-<run_id>`). Job `typescript` của lần 5 lưu cache lúc 14:38:51Z, trước khi job `typescript` của lần 6 bắt đầu (14:40:01Z), nên lần 6 dùng cache của lần 5.
- Kết luận: AC06 đạt theo input Nx đã khai (còn G19 dưới đây); phần push `main` của AC07 đạt. G6 của QC đóng.

### EC06 — kiểm cục bộ, sửa G18

Tính hash task bằng API của Nx 22.7.12 (`createTaskHasher`) trên worktree này, bằng script tạm ngoài repo. Không chạy ruff hay mypy: máy Windows chặn `python.exe` trong `.venv`. Hash khác nghĩa là Nx không lấy kết quả cũ từ cache.

- Trước khi sửa: đổi `line-length` trong `[tool.ruff]` của `pyproject.toml` gốc (120 → 100) làm đổi hash `agent-core:lint`, `agent-core:typecheck`, `agent-core:test`, `knowledge:lint`, `eval:typecheck`, `sires-common:test`, nhưng **không** đổi hash `sires-common:lint`, `sires-common:typecheck`. Chi tiết hash của hai task này chỉ có `libs/py/sires_common/**/*` và `nx.json`, `.gitignore`, `.nxignore`. Lý do: target không khai `inputs` thì Nx dùng mặc định `{projectRoot}/**/*` cộng `^default`, nên project không phụ thuộc project nào (`sires-common`, `@sires/contracts`) không nhận `sharedGlobals`. Hệ quả: đổi cấu hình ruff, mypy gốc, `uv.lock` hay `.python-version` thì `sires-common:lint`, `typecheck` lấy kết quả cũ từ cache, trái EC06.
- Sửa: `nx.json`, `targetDefaults` của `lint`, `typecheck`, `test` khai `"inputs": ["default", "^default"]`. Target đã khai `inputs` riêng (`sires-common:test`, `@sires/planning:test`, `@sires/platform:test`…) giữ nguyên.
- Sau khi sửa: lần lượt đổi `pyproject.toml`, `uv.lock`, `.python-version`, `eslint.config.mjs`; mỗi lần đều đổi hash của cả 12 task kiểm (`sires-common:lint`, `typecheck`, `test`, `agent-core:lint`, `typecheck`, `knowledge:test`, `eval:lint`, `@sires/contracts:lint`, `typecheck`, `test`, `@sires/gateway:lint`, `@sires/planning:test`). Chiều ngược lại: sửa `apps/gateway/src/main.ts` chỉ đổi hash `@sires/gateway:lint`, `test`; `sires-common`, `agent-core`, `@sires/contracts`, `@sires/platform`, `@sires/planning` giữ nguyên. Các file thử đều đã hoàn lại.
- Chạy thật (`pnpm exec nx run @sires/contracts:lint`, eslint, không cần Python): với `nx.json` cũ, thêm một dòng trống vào `pyproject.toml` gốc thì task vẫn in `[existing outputs match the cache, left as is]`; với `nx.json` mới, cùng thay đổi làm task chạy lại, hoàn lại file thì đọc từ cache (`Nx read the output from the cache instead of running the command for 1 out of 1 tasks.`).
- Ảnh hưởng: lần push `main` đầu tiên sau khi PR này merge, task không khai `inputs` có hash mới nên chạy lại một lần.

### G19 — mã hợp đồng sinh ra không nằm trong hash Nx (HIGH, cần PO)

`libs/ts/contracts/src/generated/` và `libs/py/sires_common/src/sires_common/generated/` nằm trong `.gitignore`, nên Nx không băm. Chỉ `generate-ts`, `generate-python` khai `docs/api-design/**/*.yaml` làm input; `@sires/contracts:typecheck`, `build`, `test`, các service TS (dùng `dist` của contracts qua `^build`) và `sires-common:test` (dùng mã Python sinh ra qua `generate-python`) không có input nào từ `docs/api-design`.

- Bằng chứng Actions: lần 2 và 3 ở bảng T5 chạy lại `generate-ts` vì YAML đổi, nhưng `@sires/contracts:typecheck`, `build`, `test` vẫn in `[existing outputs match the cache, left as is]`.
- Bằng chứng cục bộ: thêm một schema vào `docs/api-design/components/schemas/library.yaml` làm đổi hash `generate-ts`, nhưng không đổi hash `@sires/contracts:typecheck`, `build`, `test`, `@sires/gateway:typecheck`, `@sires/library:typecheck`, `sires-common:test`. File đã hoàn lại.
- Rủi ro: PR đổi hợp đồng làm hỏng một consumer vẫn có thể có `build` xanh, vì typecheck và test của consumer lấy kết quả cũ từ cache `main`. EC08 chọn đúng project, nhưng cache vẫn trả kết quả cũ.
- Không sửa trong lần này: cả hai cách đều đổi chính sách cache dùng chung hoặc file của luồng khác, hồ sơ không nói tới. Phương án cho PO: (a) luồng contracts khai `{workspaceRoot}/docs/api-design/**/*.yaml` vào `namedInputs.default` của `libs/ts/contracts` để consumer nhận qua `^default`; luồng platform thêm vào `inputs` của `sires-common:test`. (b) Luồng infra thêm `{"dependentTasksOutputFiles": "**/*", "transitive": true}` vào `inputs` trong `targetDefaults` của `nx.json`, để hash gồm đầu ra của task phụ thuộc (mã sinh ra, `dist`). Chưa thử phương án nào.

### AC08 — bảng job (G8 của QC)

Log job `build` của lần 6 in bảng 25 dòng, có `| tracks | skipped | -1 |`: với job skipped GitHub trả `completed_at` sớm hơn `started_at`. Sửa `.github/workflows/ci.yml`: lấy `max(giây, 0)`. Đã chạy biểu thức mới bằng `gh api … --jq` (cùng gojq như trên runner) trên run 45416543323 (`tracks skipped 0`) và run T2 45024785948 (`typescript`, `contracts`, `dependencies`, `terraform`, `helm` skipped đều ra 0). Chưa chạy trên Actions; CI của PR này (vào `main`, chế độ toàn bộ) là lần đầu.

### T3 với cache `main` (AC01) — chưa chạy

Trước khi mở PR thử: `git rev-list --count origin/develop..origin/main` = 2 (`10ee7a6` #88, `0153261` #89, PO merge 14:37–14:39Z ngày 24/11/2026). Theo EC11, dừng PR thử và ghi “Cần PO”: đồng bộ `develop` theo `main` (PR `main` → `develop`, merge commit như #84). Không mở PR đồng bộ, không đổi `develop`. Số đo tham khảo giữ nguyên: 141 giây không cache, 60 giây với cache của PR (#75, mã CI `develop` cũ).

### OQ-112

`node infra/ci/measure.mjs toilatrung/sires` (24/11/2026, sau lần 6): “PR vào develop chỉ đổi tài liệu: 2/20 lần”, “Push toàn bộ vào main: 6/20 lần”. Chưa đủ 20 lần nên không tính p95 và ngưỡng. Sáu lần push `main` ở trên đều đạt ngay lần chạy đầu; không lần nào đỏ vì lỗi timeout test `plan_version` (lỗi làm đỏ job `typescript` ở PR #86, #87, đã sửa bằng #88, #89).

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
