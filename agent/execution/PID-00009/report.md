# PID-00009 — Báo cáo thực thi

**Trạng thái:** Bị chặn — G19 (HIGH): cần PO chọn cách đưa mã hợp đồng sinh ra vào hash Nx; AC01 đã đạt ở Lần 9 (T3 với cache `main`, 182 giây)

- **Ticket:** [PID-00009](../../../docs/tickets/issues/PID-00009/index.html) · **Luồng:** infra · **Giai đoạn:** PH-01
- **Người thực hiện:** congminh1705 (Lần 1–7); từ Lần 8 (24/11/2026) phiên do PO `toilatrung` giao · **Nhánh:** `infra/pid-00009-ci` (Lần 1–7), `infra/pid-00009-t5-cache-main` (Lần 8, 9) · **PR:** [#57](https://github.com/toilatrung/sires/pull/57), [#91](https://github.com/toilatrung/sires/pull/91) (Lần 8, 9); PR thử T3 [#96](https://github.com/toilatrung/sires/pull/96) (Lần 9, đã đóng)
- **Cập nhật:** 25/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

Hồ sơ đạt kiểm tra đầu vào với 8 AC, 22 edge case và 0 cảnh báo.

- S01–S09 và S11–S12 đã có kết quả Actions; S10 đã có số đo cold và warm cache của PR. Cache của main và T5 còn chờ sau merge.
- T4 của bản sửa `d8c7076` đạt ở [attempt 2](https://github.com/toilatrung/sires/actions/runs/45024841054/attempts/2). T1, T2, T3, T7 đã chạy trên develop `518fc4e`; xem Lần 6 và [bằng chứng](acceptance-20261122.json).
- Lần 8 (24/11/2026): T5 có đủ bằng chứng trên `main`: 6 lần push sau #57 đều đạt ở lần chạy đầu, cache Nx nối tiếp giữa các lần, task có input đổi chạy lại; hai lần push của #88 và #89 chạy chồng nhau và cùng chạy hết. T3 với cache `main` chưa chạy: `develop` thiếu 2 commit của `main` (#88, #89), theo EC11 dừng PR thử, chờ PO đồng bộ.
- Lần 8 sửa hai lỗi trong phạm vi: `nx.json` khai `inputs` cho `lint`, `typecheck`, `test` để project không phụ thuộc project nào (`sires-common`, `@sires/contracts`) cũng nhận file gốc ở EC06 (G18); bảng job của `build` không in số giây âm cho job skipped (G8 của QC). Phát hiện G19 (HIGH, cần PO): mã hợp đồng sinh từ `docs/api-design` không nằm trong hash của các task dùng nó.
- Lần 9 (24/11/2026): PO đồng bộ `develop` qua #92. PR thử T3 [#96](https://github.com/toilatrung/sires/pull/96) sửa một dòng trong `gateway`, lấy cache Nx của `main` (4/8 task đọc từ cache) và xong sau 182 giây, dưới 10 phút: AC01 đạt. CI của #91 đạt (199 giây). Thêm 4 lần push `main` (#93, #86, #94, #95). Lần của #94 đỏ vì test `@sires/orchestration` lỗi ngẫu nhiên; lần của #95 chạy cùng mã đó và đạt.
- AC: AC01, AC02, AC03, AC07 đạt; AC06 đạt theo input Nx đã khai, còn G19; AC04, AC05 đạt trên mã CI của `develop` cũ; AC08 đạt (bảng có job skipped), phần số giây âm của job skipped sửa ở #91, chưa merge.

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
| S10 | Số đo CI | Có cold 141s, warm PR 60s; T3 với cache `main` 182s (Lần 9); 10 lần push `main` (9 đạt) | infra/ci/measure.mjs |
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
| PR vào `develop`, sửa `gateway` có warm cache main (T3/AC01) | 1/1 đúng loại main cache (Lần 9) | 182s ([#96](https://github.com/toilatrung/sires/pull/96), cache `main`, 4/8 task đọc từ cache). Tham khảo: cold 141s, warm cache PR 60s (#75, Lần 6) | AC01 đạt (dưới 10 phút) |
| Push vào `main` (T5) | 10/20 (24/11/2026) | 182, 188, 171, 191, 215, 228, 205, 393, 410 (đỏ, test lỗi ngẫu nhiên), 268 giây | Chưa đủ 20; không in ngưỡng (Lần 8, 9) |

T4 ở PR #57 là lượt chế độ toàn bộ để xác nhận workflow tại HEAD, không được trộn vào hai loại số liệu trên.

## 5. Việc còn lại

- G19 (HIGH): PO chọn cách đưa mã hợp đồng sinh ra vào hash Nx và luồng làm (Lần 8).
- T1 (hai push), T2 chạy lại trên mã CI mới của `develop` để đóng G7 của QC. Chưa chạy: sau khi đo T3, `develop` lại thiếu #95 (EC11), cần PO đồng bộ trước (Lần 9).
- Lần push `main` đầu tiên sau khi #91 merge: kiểm bảng job in 0 cho job skipped. Mọi task có hash mới sẽ chạy lại một lần.
- Test `@sires/orchestration` `migration.spec.ts` lỗi ngẫu nhiên vì dump tham chiếu hỏng ký tự UTF-8 (Lần 9). Đây là việc của luồng orchestration, không thuộc PID này.
- Test outbox có lỗi thứ tự không ổn định cần luồng platform theo dõi (Lần 6).

## 6. Yêu cầu thêm

- congminh1705 yêu cầu xử lý các dependency đang chặn S06. Cập nhật phiên bản trong catalog và lock file, không thêm ngoại lệ.
- YC Lần 8 — PO `toilatrung`, 24/11/2026, qua phiên PO giao việc: “Chuyển hết toàn bộ công việc còn lại sang PO toilatrung để hoàn thiện PH-01 trong hôm nay”, rồi “Chạy ngay”. Phân loại: trong phạm vi (đổi người làm, không đổi AC). Đã làm: T5, kiểm EC06, sửa G18 và số giây job skipped, ghi kết quả; T3 dừng theo EC11.
- YC Lần 9 — PO `toilatrung`, 24/11/2026, qua phiên PO giao việc. Mở PR đồng bộ `main` → `develop` như #84 nhưng không merge (PO tự merge), sau đó đo T3 ngay khi `develop..main` = 0 và ghi SHA của `develop`, `main` lúc đo. Phân loại: trong phạm vi (điều kiện EC11 của T3). Đã làm: mở [#92](https://github.com/toilatrung/sires/pull/92), PO merge. Đã chạy T3 trên [#96](https://github.com/toilatrung/sires/pull/96), sau đó đóng PR và xóa nhánh.

## 7. Cần PO và tài liệu đi kèm

- **Cần PO:** (1) G19: chọn phương án (a) hoặc (b) ở Lần 8 và luồng sẽ làm. (2) Làm rõ EC15/S11 về image smoke khi chỉ đổi chart (G16 của QC, chưa có trả lời). (3) Muốn đóng G7 thì đồng bộ `develop` theo `main` (thiếu #95) để chạy lại T1, T2. (4) Giao luồng orchestration xử lý test lỗi ngẫu nhiên ở Lần 9. Mục (1) và (2) đã có từ Lần 8; mục (1) của Lần 8 (đồng bộ để đo T3) đã xong qua #92.
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

## Lần 9 — 24/11/2026 · T3 với cache `main`, CI của #91, T5 bổ sung

Người làm: phiên do PO `toilatrung` giao. Giờ ghi theo UTC. Ghi vào nhánh `infra/pid-00009-t5-cache-main` (PR #91) sau khi gộp `origin/main` `f28424c`.

### Đồng bộ `develop` (EC11)

Theo yêu cầu PO (mục 6, YC Lần 9), phiên này mở [#92](https://github.com/toilatrung/sires/pull/92) (head `main`, base `develop`) và không merge. PO merge #92 lúc 16:52:18Z bằng merge commit. `develop` = `c11bba3`, đã có #86, #88, #89, #93, #94. Kiểm ngay sau đó: `git rev-list --count origin/develop..origin/main` = 0.

### T3 với cache `main` (AC01) — đạt

| Mục | Giá trị |
| --- | --- |
| PR thử | [#96](https://github.com/toilatrung/sires/pull/96), nhánh `infra/pid00009-accept-t3-20261124` từ `develop` `c11bba3`, commit `5237827` (có chữ ký): thêm một dòng chú thích vào `apps/gateway/src/main.ts` |
| Run | [45442437182](https://github.com/toilatrung/sires/actions/runs/45442437182), attempt 1, `success` |
| Thời gian (GitHub) | `created_at` 16:53:57Z → `updated_at` 16:56:59Z = **182 giây** (3 phút 2 giây), dưới 10 phút |
| SHA lúc đo | `develop` `c11bba3` (base trong output của job `changes`), `main` `f28424c`. PO merge #95 vào `main` lúc 16:53:35Z, vài giây trước khi push nhánh thử xong (16:53:40Z). #95 chỉ đổi 6 file trong `docs/`, không chạm CI, `gateway` hay input Nx của task nào, nhưng lúc chạy `develop..main` là 1. Ghi lại để QC xét điều kiện “`develop` đã đi theo `main`” |
| `changes` | `mode: filtered`, `affected: @sires/gateway`; `ts: true`, còn `python`, `contracts`, `dependencies`, `chart`, `terraform`, `docs` là `false`; ma trận image chỉ có `gateway` |
| Cache Nx | `restore-keys: nx-ts-Linux-main-` → `Cache hit for restore-key: nx-ts-Linux-main-4578236…`. Cache này do lần push `main` của #86 lưu (run 45441520021, job `typescript` xong 16:52:52Z). Lần push của #94 đỏ nên không lưu cache; lần push của #95 chưa xong |
| Log Nx | Lệnh `nx run-many -t lint typecheck test build --projects="$AFFECTED" --exclude=tag:lang:python` in `Nx read the output from the cache instead of running the command for 4 out of 8 tasks.`. Đọc từ cache (`[local cache]`): `@sires/contracts:generate-ts`, `@sires/contracts:build`, `@sires/testing:build`, `@sires/platform:build`. Chạy lại: `@sires/gateway:lint`, `typecheck`, `test`, `build`. Job `typescript` mất 24 giây |

Các job, lấy từ API của run (số giây đã đổi số âm thành 0):

| Job | Kết quả | Giây |
| --- | --- | ---: |
| `secrets` | success | 6 |
| `tracks` | success | 8 |
| `docs` | success | 7 |
| `changes` | success | 20 |
| `typescript` | success | 24 |
| `contract-test` | success | 28 |
| `asyncapi-payload` | success | 31 |
| `images (gateway, …)` | success | 111 |
| `build` | success | 4 |
| `python`, `contracts`, `dependencies`, `terraform`, `helm` | skipped | 0 |

- Chuỗi dài nhất: chờ runner tới khi `changes` bắt đầu (37 giây), `changes` (20 giây), `images` gateway (111 giây, không dùng Nx), `build` (4 giây).
- Lần không cache: không chạy lại. Giữ số tham khảo 141 giây của #75 (Lần 6, mã CI `develop` cũ).
- Bảng job trong log `build` (mã `develop`, chưa có bản sửa của #91) có đủ 14 job, gồm 5 job skipped. Số giây của job skipped bị âm: `python`, `contracts`, `dependencies`, `helm` là −1; `terraform` là −16 (`started_at` 16:55:10Z, `completed_at` 16:54:54Z). Đây thêm một ví dụ cho bản sửa `max(…, 0)` ở #91.
- G7 của QC: T3 lần này chạy mã CI mới của `develop`, gồm lệnh lọc `nx run-many --projects="$AFFECTED"` và bảng có `tee`. T1, T2 vẫn còn trên mã cũ.
- Dọn PR thử: đóng #96 lúc 16:59:44Z, không merge; đã xóa nhánh trên `origin` và ở máy.

### CI của PR #91 (vào `main`, chế độ toàn bộ)

Run [45420184190](https://github.com/toilatrung/sires/actions/runs/45420184190), attempt 1: `success`, 14:59:03Z → 15:02:22Z = 199 giây, cả 25 job đạt. Job `typescript` khôi phục `nx-ts-Linux-main-0153261…`, `python` khôi phục `nx-python-Linux-main-0153261…`. Dù vậy Nx chạy mới cả 63 task TS và 13 task Python, không task nào đọc từ cache: `targetDefaults` đổi `inputs` nên hash mọi task đổi, đúng như dự kiến ở Lần 8. Run này không có job skipped (`tracks` chạy ở PR), nên chưa thấy bảng in 0 trên Actions.

### T5 bổ sung — push `main` sau Lần 8 (AC06, AC07)

| # | Run | Commit (PR) | Kết quả | Giây | Cache Nx khôi phục (TS) | Nx đọc từ cache: TS · Python | Ghi chú |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 7 | [45422174396](https://github.com/toilatrung/sires/actions/runs/45422174396) | `343c7b9` (#93) | 24 đạt, `tracks` skipped | 205 | `nx-ts-Linux-main-0153261…` | 63/63 · 13/13 | Chỉ đổi `docs/`, không task nào chạy lại |
| 8 | [45441520021](https://github.com/toilatrung/sires/actions/runs/45441520021) | `4578236` (#86) | 24 đạt, `tracks` skipped | 393 | `nx-ts-Linux-main-343c7b9…` | 15/63 · 13/13 | #86 đổi `libs/ts/platform`, `libs/ts/sample-service`, nên 48 task TS chạy lại |
| 9 | [45441635225](https://github.com/toilatrung/sires/actions/runs/45441635225) | `80a6626` (#94) | **Đỏ**: `typescript`, `build` failure | 410 | `nx-ts-Linux-main-4578236…` | — · 6/13 | `@sires/orchestration:test` đỏ, chi tiết dưới bảng. Job `typescript` đỏ nên không lưu cache TS; `python` vẫn lưu `nx-python-Linux-main-80a6626…` |
| 10 | [45442384648](https://github.com/toilatrung/sires/actions/runs/45442384648) | `f28424c` (#95) | 24 đạt, `tracks` skipped | 268 | `nx-ts-Linux-main-4578236…` | 46/63 · 13/13 | Cache của #94 không có nên thay đổi của #94 chạy lại ở đây, gồm `@sires/orchestration:test` (đạt) |

- Lần 9 đỏ không do mã của PID này. `src/db/migration.spec.ts > … PID-00019-AC01 > schema khớp DDL` so hai bản `pg_dump`. Bản tham chiếu (Expected) có `b��t biến`, bản dựng từ migration có `bất biến`: một ký tự UTF-8 bị hỏng khi đọc dump. Lần 10 chạy cùng mã và đạt. Ghi vào G12 của QC (lần chạy toàn bộ đỏ ngẫu nhiên) và đề xuất PO giao luồng orchestration. Không phải lỗi timeout `plan_version`.
- AC07, phần push `main`: lần 8 (16:49:07–16:55:40Z), 9 (16:49:44–16:56:34Z) và 10 (16:53:39–16:58:07Z) chạy chồng nhau, cả ba `completed`, không lần nào `cancelled`. Lần 9 bắt đầu job `typescript` lúc 16:52:55Z, sau khi lần 8 lưu cache, và dùng cache của lần 8.

### OQ-112

`node infra/ci/measure.mjs toilatrung/sires` (sau lần 10): “PR vào develop chỉ đổi tài liệu: 2/20 lần”, “Push toàn bộ vào main: 10/20 lần”. Script chỉ bỏ lần `cancelled` nên đếm cả lần 9 đỏ. Chưa đủ 20 lần nên không tính p95 và ngưỡng.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
