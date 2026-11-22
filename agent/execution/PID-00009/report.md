# PID-00009 — Báo cáo thực thi

**Trạng thái:** Đang làm — đã chạy T1–T4, T6, T7; còn T5 và phép đo cache main sau merge theo yêu cầu PO

- **Ticket:** [PID-00009](../../../docs/tickets/issues/PID-00009/index.html) · **Luồng:** infra · **Giai đoạn:** PH-01
- **Người thực hiện:** congminh1705 · **Nhánh:** `infra/pid-00009-ci` · **PR:** [#57](https://github.com/toilatrung/sires/pull/57)
- **Cập nhật:** 22/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

Hồ sơ đạt kiểm tra đầu vào với 8 AC, 22 edge case và 0 cảnh báo.

- S01–S09 và S11–S12 đã có kết quả Actions; S10 đã có số đo cold và warm cache của PR. Cache của main và T5 còn chờ sau merge.
- T4 của bản sửa `d8c7076` đạt ở [attempt 2](https://github.com/toilatrung/sires/actions/runs/45024841054/attempts/2). T1, T2, T3, T7 đã chạy trên develop `518fc4e`; xem Lần 6 và [bằng chứng](acceptance-20261122.json).

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Kiểm thay đổi và tách job CI | Đạt T1, T2, T4 | Xem implement.md |
| S02 | S02-python-graph | Đạt T2 | Xem implement.md |
| S03 | S03-speed | Đạt hủy run và cache PR; còn T5/cache main | Xem implement.md |
| S04 | S04-contract-spec | Đạt T4 | Xem implement.md |
| S05 | S05-secret-scan | Đạt T7: phát hiện và che secret mẫu | Xem implement.md |
| S06 | Quét phụ thuộc | Đạt T4 | `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `patches/query-string@7.1.3.patch` |
| S07 | S07-build-image | Đạt T2, T3, T4 | Xem implement.md |
| S08 | S08-schemathesis | Đạt T4/T6 | Xem implement.md |
| S09 | S09-asyncapi | Đạt T4/T6 | Xem implement.md |
| S10 | Số đo CI | Có cold 141s, warm PR 60s; còn phép đo với cache main | infra/ci/measure.mjs |
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
| PR vào `develop`, chỉ đổi tài liệu (T1) | 1 mẫu T1 thành công | 43 giây | Chưa đủ 20; không in ngưỡng |
| PR vào `develop`, sửa `gateway` có warm cache main (T3/AC01) | 0/1 đúng loại main cache | Cold 141s; warm cache PR 60s, 8/8 task cache hit | Cache PR chỉ tham khảo; đo lại với main cache sau merge |
| Push vào `main` (T5) | 0/20 | Chưa có | Chờ merge PR và T5 |

T4 ở PR #57 là lượt chế độ toàn bộ để xác nhận workflow tại HEAD, không được trộn vào hai loại số liệu trên.

## 5. Việc còn lại

Sau merge cần T5 trên `main` và đo T3 với cache Nx từ `main`. Không merge trong lượt này: PO trả lời “Chỉ đẩy bản sửa; để T5 sau merge”. Test outbox có lỗi thứ tự không ổn định cần luồng platform theo dõi (Lần 6).

## 6. Yêu cầu thêm

- congminh1705 yêu cầu xử lý các dependency đang chặn S06. Cập nhật phiên bản trong catalog và lock file, không thêm ngoại lệ.

## 7. Cần PO và tài liệu đi kèm

- **Cần PO:** Sau merge theo dõi T5 và đo lại T3 với cache main; làm rõ EC15/S11 về image smoke khi chỉ đổi chart. Develop đã đồng bộ qua #69.
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

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
