# PID-00009 — Self-QC

**Kết luận:** T1/T2/T3/T4/T6/T7 đã có bằng chứng Actions; còn T5 và T3 dùng cache main sau merge. Không merge theo yêu cầu PO. Có test outbox không ổn định cần platform theo dõi.

## 1. Lệnh và kết quả

- `check-pid.mjs PID-00009` đạt kiểm hồ sơ với 0 cảnh báo.
- `actionlint` kiểm workflow thành công. `ruff check infra/ci` đạt.
- `uv sync --all-packages --locked` thành công.
- Nx TypeScript dừng do `EPERM` khi generator đổi tên đầu ra; 14 test của contracts đạt trong lần chạy.
- Nx Python lint và typecheck đạt; agent-core 15 test, knowledge 1 test đạt. Task sinh contracts Python lỗi `EPERM`, dẫn tới sires-common:test chưa chạy.
- `add-license.mjs --check` dừng khi đọc .pytest_cache. Kiểm giấy phép riêng các file mới theo từng định dạng.
- Schemathesis và AsyncAPI chạy bộ tự kiểm thành công trên máy Dev.
- Redocly 2.11.1 lint cả ba nhóm thành công. Bundle mới khớp file đã commit khi chuẩn hóa xuống dòng.
- Fixture Gitleaks thoát 1, báo đúng file và dòng và che chuỗi giả. Fixture Trivy xác nhận cảnh báo High chưa có bản sửa chỉ được liệt kê, High có bản sửa chặn.
- Build image đại diện `gateway` và `knowledge` trong Ubuntu 24.04 thành công. Lượt build gateway đầu tiên cho thấy lỗi EXDEV khi Docker nhận thư mục contracts sinh cục bộ. Lượt sau đạt khi thư mục đó được bỏ khỏi context.
- Đã kiểm marker giấy phép của file code và tài liệu thay đổi. `update-index.mjs --check` và `git diff --check` đạt.
- Kiểm lưu/khôi phục tên tệp SQLite của cache Nx với fixture trong Ubuntu đạt. Chưa đo cache hit giữa runner GitHub.

## 2. AC và bằng chứng

| AC | Kiểm | Kết quả |
| --- | --- | --- |
| PID-00009-AC01 | T3 thời gian GitHub | Chưa chạy. Develop thiếu 91 commit từ main. |
| PID-00009-AC02 | T6 Schemathesis | Fixture đúng đạt; fixture sai báo GET /invalid và trường value. Đạt cục bộ. |
| PID-00009-AC03 | T7 Gitleaks | Đã kiểm phát hiện, file, dòng và che log với fixture cục bộ. Chưa chạy PR thử. |
| PID-00009-AC04 | T1 docs-only | Phân loại cục bộ đúng; chưa chạy PR thử. |
| PID-00009-AC05 | T2 sires-common | Nx chọn đúng bốn project Python và ma trận chỉ agent-core, knowledge. Chưa chạy PR thử. |
| PID-00009-AC06 | T4/T5 chạy toàn bộ và cache | T4 tại HEAD đạt trên GitHub; chưa có bằng chứng cache hit của T5. |
| PID-00009-AC07 | T1/T5 concurrency | Có cấu hình theo PR và push. Chưa chạy cặp lần chạy. |
| PID-00009-AC08 | T1/T4 job summary | T4 tại HEAD đạt; còn cần T1 để xác nhận cả job skipped. |

## 3. Edge case

| EC | Cách kiểm và trạng thái |
| --- | --- |
| EC01 | Có cấu hình cache Nx tiếp tục khi lỗi; chờ chạy Actions. |
| EC02, EC03 | Workflow qua actionlint; chờ T1 và kết quả job tổng. |
| EC04 | uv.lock chọn full. |
| EC05 | Cạnh Nx của sires-common đến agent-core, knowledge, eval được kiểm qua danh sách ảnh hưởng. |
| EC06 | Khai báo ba input Python; chưa có phép đo cache thực tế. |
| EC07 | Tham chiếu Git không tồn tại cho kết quả full. |
| EC08 | Schema nội bộ kích hoạt hợp đồng và các consumer TS. |
| EC09 | Job tài liệu chạy checkout riêng; local vướng cache pytest. |
| EC10 | PR nhánh đích khác được phân loại full. |
| EC11 | Develop thiếu 91 commit từ main. |
| EC12, EC13 | Có cấu hình ngoại lệ và che log; chờ T7. |
| EC14 | Dockerfile Python chọn đúng hai service. |
| EC15 | Cờ Helm và Terraform có mã phân loại; job chờ S11/S12. |
| EC16 | Job tổng coi cancelled là lỗi; chưa mô phỏng timeout trên Actions. |
| EC17 | Có đường chạy fixture khi không có target service. |
| EC18 | Fixture báo operation sai hoặc trường aggregate thiếu; chờ CI. |
| EC19 | Lần 3: Trivy đọc cả hai lock file. Chính sách thoát 0 và 9 phát hiện Low/Medium chỉ được liệt kê. |
| EC20 | Bundle khớp bản commit sau khi chuẩn hóa xuống dòng. Chưa thử bản bundle lệch trên PR. |
| EC21 | Sync khóa hiện tại chạy được; chưa thử lock lệch trên PR. |
| EC22 | Gateway kèm lock file chỉ tính gateway; Helm vẫn tính infra. |

## 4. Ranh giới

Các file nghiệp vụ của service và hợp đồng ở docs giữ theo upstream. Thay đổi có sẵn `analytics: false` trong nx.json được giữ lại.

## 5. Tự đối chiếu

| Mã | Mức | Phát hiện |
| --- | --- | --- |
| G01 | HIGH | Thiếu bằng chứng từ T1–T5 và T7; AC01, AC03–AC08 chưa nghiệm thu trên GitHub. |
| G02 | HIGH | S11 và S12 thiếu đầu ra của PID-00010 và PID-00011 trên origin/main. |
| G03 | MEDIUM | Kiểm toàn bộ Nx trên Windows bị gián đoạn do trình sinh hợp đồng hiện tại gặp EPERM. |
| G04 | HIGH | Đã xử lý trên hai lock file cục bộ. Còn xác nhận kết quả trên GitHub Actions. |

---

## Lần 4 — 21/11/2026

- Helm lint/render đạt cho 12 service trên main tại ae1ac60. Đã kiểm lại trường hợp thiếu lệnh migration.
- Terraform fmt, init với backend tắt và validate đạt cho sáu module và hai root.
- Actionlint, frozen install, kiểm chỉ mục tài liệu và phân loại thay đổi Helm/Terraform/Python đạt.
- G01 còn mở: cần kết quả GitHub Actions PR #57 và develop hiện thiếu 109 commit. G02 đã xử lý: hai ticket phụ thuộc đã merge và hai job CI đã tích hợp.

## Lần 5 — 22/11/2026

- Rerun [44931193323](https://github.com/toilatrung/sires/actions/runs/44931193323), attempt 2, đã đạt trên commit HEAD `51befc7`.
- G01 thu hẹp: T4 đã có bằng chứng; còn T1–T3, T5, T7 và điều kiện EC11 (`develop` phải được đồng bộ từ `main`).

## Lần 6 — 22/11/2026 · Nghiệm thu và sửa theo review #57

- G2–G4 của QC đã sửa: công cụ đo lọc phản hồi API, Dockerfile.dockerignore chọn đúng image, values-only không chạy code/image. Workflow lọc dùng cùng danh sách affected với classifier. Frozen install sau sửa importer sample-service đạt.
- T1 #73 đạt với các job không liên quan skipped; run đầu 45024755723 bị hủy bởi push thứ hai, run 45024781831 đạt sau 43s.
- T2 #74, run 45024785948 đạt sau 99s: đúng 4 project Python và 2 image; TS skipped.
- T3 #75, run 45024813714: cold 141s, warm cache PR attempt 2 là 60s. Log Nx xác nhận cache 8/8 task trên runner mới. Đây chưa phải cache main theo AC01.
- T7 #76, run 45024821794: đúng kỳ vọng secrets/build fail, fixture dòng 3, Secret REDACTED; assert trên log xác nhận không có nguyên token giả.
- T4 `d8c7076`, run 45024841054 attempt 2 đạt sau rerun phần lỗi. Attempt đầu gặp test outbox sai thứ tự; ghi đầy đủ ở report và artifact, không coi lần đầu là đạt.
- Cả bốn PR thử đã đóng và xóa nhánh. Không sửa `docs/`, không merge #57, không đổi develop. Phần hậu merge T5/cache main giữ mở theo lựa chọn PO.
- Chi tiết từng job và thời gian: [acceptance-20261122.json](acceptance-20261122.json).
- Bổ sung sửa measure để tìm được PR đã đóng/xóa nhánh; summary ghi cả log và GITHUB_STEP_SUMMARY. Kiểm lần cuối và CI trên commit báo cáo được xác nhận trong phiên sau push.

## Lần 7 — 22/11/2026 · Gitleaks trên báo cáo

CI của commit báo cáo `add5003` nhận nhầm nhãn trạng thái trong `qc-report.md:18`. Allowlist chỉ khớp chính xác giá trị `skipped/concurrency`; Gitleaks 8.24.3 quét lịch sử PR đạt và fixture token giả vẫn bị chặn với mã thoát 1. Không có ngoại lệ theo toàn bộ file/commit và không tắt quét lịch sử. Chi tiết ở report Lần 7.

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. See [LICENSES.md](../../../LICENSES.md).
