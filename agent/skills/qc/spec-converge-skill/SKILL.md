---
name: spec-converge-skill
description: Independent QC check after a SIRes ticket (PID-NNNNN) has been implemented and before the PO accepts it — assess the current code against the ticket's acceptance criteria and its spec docs in docs/tickets/issues/PID-NNNNN/ (acceptance.html, scope.html, slices, Output O…, steps B…, AC → test table) and the project principles, treating the developer's report.md, implement.md and self-qc.md as claims to verify; classify every gap as missing / partial / contradicts / unrequested with a severity and file evidence, propose the remaining work as an ordered, traceable list, and write the result to agent/execution/PID-NNNNN/qc-report.md — without editing code or docs/. Adapted from GitHub Spec Kit's /speckit.converge. Use when asked "PID-NNNNN đã xong chưa", "QC nghiệm thu PID-NNNNN", "còn thiếu gì so với spec", "rà code so với ticket", when Dev reports a ticket done, or before a PR is merged. Not for reviewing the spec documents themselves (spec-analyze-skill).
---

# Spec converge — QC đối chiếu mã với ticket và spec, ghi `qc-report.md`

Chuyển thể từ lệnh `converge` của [GitHub Spec Kit](https://github.com/github/spec-kit) (MIT, commit `a227e38`, giấy phép: [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)). Spec Kit ghi thêm việc vào `tasks.md` cho bước implement; ở SIRes QC chạy skill này độc lập với Dev và ghi kết quả vào `agent/execution/PID-NNNNN/qc-report.md`.

| File | Dùng khi |
| --- | --- |
| [PID-Template/qc-report.md](../../../execution/PID-Template/qc-report.md) | Khung `qc-report.md` ở `agent/execution/PID-Template/`; chép vào `agent/execution/PID-NNNNN/`, thay `PID-NNNNN` bằng mã ticket. File đã có thì thêm một mục “Lần N” ở cuối |

## Quy tắc không đổi

- **Chỉ ghi `agent/execution/PID-NNNNN/qc-report.md`.** Không sửa mã, không sửa `docs/`, không sửa `report.md`, `implement.md`, `self-qc.md` của Dev. Làm tiếp việc còn lại là việc của Dev (`spec-execution-skill PID-NNNNN`).
- **Nguồn ý định duy nhất:** ticket (AC), hồ sơ trong `docs/tickets/issues/PID-NNNNN/` và nguyên tắc dự án. Không suy ra phạm vi ngoài những gì chúng nêu. Khi tài liệu mâu thuẫn, theo thứ tự ở `docs/tickets/README.md` (PRD → `docs/api-design` → kiến trúc, database → ticket, spec).
- **Báo cáo của Dev không phải bằng chứng.** `report.md`, `self-qc.md` ghi “xong”, “đạt” vẫn phải kiểm trong mã và tự chạy lệnh. Chỗ QC khác kết luận của Dev ghi rõ ở mục “Lệch với Self-QC”.
- **Không phải công cụ diff:** đánh giá trạng thái mã hiện tại, không so nhánh hay lịch sử git.
- **Kết quả thật.** Lệnh không chạy được thì ghi “không chạy — lý do”; không suy kết quả từ `self-qc.md`.
- Thiếu hồ sơ trong `docs/tickets/issues/PID-NNNNN/` → dừng, báo “chưa có hồ sơ” và đề nghị PO chạy [spec-docs-skill](../../po/spec-docs-skill/SKILL.md), [spec-clarify-skill](../../po/spec-clarify-skill/SKILL.md).

## Quy trình

1. **Nạp ý định** (chỉ phần cần): AC trong `specs/acceptance.html` và trang ticket `index.html` (`PID-NNNNN-ACNN`, AC requirement); `specs/scope.html` (phạm vi, ngoài phạm vi, EC); slice; spec `specs/index.html` mục 3 (Output), mục 4 (thiết kế), mục 5 (bước), mục 6 (AC → test), mục 7 (điểm dừng). Tìm mã bằng `node agent/skills/dev/spec-read-skill/scripts/locate.mjs <MÃ>`.
2. **Nạp lời khai của Dev:** `agent/execution/PID-NNNNN/report.md`, `implement.md`, `self-qc.md`. `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-NNNNN --result` để biết kết quả ghi đủ chưa. `implement.md` chỉ chỗ nên soi trước; không thay việc tự đọc mã. Có `qc-report.md` → đọc lần trước, kiểm các việc còn lại đã xử lý chưa.
3. **Xác định phạm vi mã:** đường dẫn nêu trong spec mục 2.2 và 3, cộng tìm theo khái niệm của từng AC: `apps/<service>/src/`, `apps/<service>/migrations/`, `apps/web/src/features/<khu vực>/`, `libs/ts/contracts`, test (`*.spec.ts`, `apps/<service>/tests/`), `e2e/`, `eval/`. Không mở rộng ra ngoài.
4. **Đánh giá và phân loại** mỗi khoảng trống:
   - `missing` — chưa có trong mã.
   - `partial` — có nhưng chưa đạt đủ AC, Output hay quyết định thiết kế (ví dụ có endpoint mà thiếu mã lỗi, có test mà không phủ nhánh AC, EC chưa xử lý).
   - `contradicts` — mã làm ngược ý định hoặc vi phạm nguyên tắc: agent tự thực hiện thao tác APR; chuyển trạng thái ngoài PRD 18.2, T-01–T-19; mất actor, provenance; lộ context giữa project hay task; gọi thẳng SDK provider, không qua Model Gateway; API key trong log, trace, thông báo lỗi; import mã hay đọc database của service khác; sự kiện không qua outbox; schema lệch `docs/database/ddl/`; endpoint lệch `docs/api-design`; sửa file trong danh sách cấm hay migration đã có.
   - `unrequested` — mã làm thêm ngoài ticket và spec (chỉ nêu để PO biết; không đề xuất xoá tự động). Việc đã ghi ở `report.md` mục 5 có lời đồng ý của PO thì không tính.
   - Mã gần như chưa có → toàn bộ phạm vi là `missing`. Không còn gì → báo đã hội tụ.
5. **Mức độ:** CRITICAL (vi phạm nguyên tắc, hoặc `missing`/`contradicts` chặn chức năng chính) · HIGH (`missing`/`partial` ở AC chính) · MEDIUM (`partial` phụ, `unrequested` không rõ lý do) · LOW (chi tiết nhỏ).
6. **Tự chạy lệnh** khi có thể: lệnh ở spec mục 6, thường `pnpm nx run <project>:test` và `pnpm nx affected -t lint typecheck test build`; ranh giới bằng `node scripts/development/check-tracks.mjs --base origin/main`. Ghi kết quả thật. Ô Xây kiểm với stub, ô Hội tụ kiểm trên staging (`docs/tickets/README.md`): ghi rõ AC đạt ở mức nào. Ticket có màn hình → chạy thêm [sires-ui-review](../sires-ui-review/SKILL.md), ghi kết luận vào mục AC.
7. **Ghi `agent/execution/PID-NNNNN/qc-report.md`** theo khung: cập nhật “Kết luận mới nhất” đầu file, thêm mục `Lần N — dd/mm/yyyy · spec-converge-skill`. Mỗi việc còn lại truy về một mã G và một nguồn; việc khắc phục `contradicts` đặt trước việc dựa trên nó.
8. **Báo trong phiên và bước tiếp theo:** đường dẫn file; số G theo mức; không còn CRITICAL/HIGH → báo PO có thể nghiệm thu; còn việc → Dev chạy `spec-execution-skill PID-NNNNN` (đọc lần mới nhất, ghi “Lần N” trong `report.md`); thấy ticket hay spec sai, thiếu → đề xuất cho PO (không sửa spec).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
