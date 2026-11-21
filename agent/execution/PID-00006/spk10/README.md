# SPK-10 — Bằng chứng GitHub Actions

PR đo: [#62](https://github.com/toilatrung/sires/pull/62).
Run chính: [44929131563](https://github.com/toilatrung/sires/actions/runs/44929131563),
SHA cố định `d900765b561a2b9738935ec237890b56b0222083`, base `281a0220420e62c0fb2e276bbe0bfbb0262e2002`.
Mỗi lần sau là chạy lại toàn bộ job của cùng run, không chỉ job lỗi.

`44929131563/attempt-N.json` được ghi sau mỗi attempt kết thúc bằng
`../measure-spk10.cjs`. File giữ SHA, kết quả, thời gian workflow, các job và step, cùng phản hồi
timing của GitHub. `workflowSeconds` lấy `run_duration_ms / 1000` tại lúc attempt vừa kết thúc,
trước khi chạy lại; job và step tính bằng hiệu `completed_at - started_at` từ GitHub (độ phân
giải giây). Snapshot đã có được giữ khi tiếp tục script, tránh ghi đè bằng timing của attempt sau.
Nếu endpoint timing không có số đo, trường `durationSource` nêu rõ fallback từ timestamp workflow.

Bộ khảo sát trước sửa giữ tại `44927856447/`: SHA `a1ab73811494bcff19e4d4860607daa5e25b2fb9`,
base `ae1ac601bcd8284f61f70e890b0fdbe1dca3313b`. Bộ này phát hiện race ở `knowledge:test`.
Trong lúc đo, main đã nhận PR #61 sửa race và nhánh ticket được đồng bộ; sau đó lấy main mới
nhất bằng merge d900765 và bắt đầu bộ chính mới. Không trộn số đo hai SHA. Bản sửa knowledge
đến từ main; diff PR với main không có thay đổi do PID-00006 viết trong `apps/knowledge`.

Cấu hình giữ nguyên: `.github/workflows/ci.yml` tại commit `426c8ebb8224ef58a9952d9d8af6dce21509c25a`,
blob `a618df943877c9fe91ab7123a27203f4575359cc`; runner `ubuntu-latest`, Node 24 theo `.nvmrc`,
pnpm 10.34.9, pnpm cache của workflow, `uv sync --all-packages`,
`pnpm nx affected -t lint typecheck test build`, `neverConnectToCloud=true`.
Không sửa CI, không bật Nx remote cache, không giới hạn project bằng `--files` khi đo.

EC11: PR chọn 20 project do importer mới của lockfile, không chỉ `@sires/sample-service`;
danh sách đầy đủ và việc đã báo PO nằm trong `../report.md`. Kết quả là phép đo của chính PR
ticket trong cấu hình này, không được trình bày thành phép đo chỉ một affected project.

Thời gian dưới 600 giây được đánh giá riêng với kết quả CI: workflow có test lỗi không chứng
minh cổng CI đạt. Phần chi tiết lỗi, kết luận năm lần và việc chuyển luồng nằm trong báo cáo.
Commit cập nhật báo cáo/bằng chứng sau phép đo không nằm trong năm attempt này.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
