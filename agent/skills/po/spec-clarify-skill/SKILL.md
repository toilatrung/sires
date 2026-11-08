---
name: spec-clarify-skill
description: For the PO to make a SIRes ticket ready for developers — read docs/tickets/issues/index.html and the ticket folder docs/tickets/issues/PID-NNNNN/ (index.html, specs/, designs/, others/), find ambiguities that would change code, data, API, tests or UI, ask the PO at most five targeted questions (one at a time, each with a recommended answer), record the answers, then fill the folder so a developer's agent can run spec-execution-skill without guessing — specs/brief.html, specs/scope.html (scope, out of scope, edge cases EC01…), specs/acceptance.html (AC → test → slice), specs/slices/SNN-*.html thin vertical slices, designs/notes.html plus self-contained HTML sketches when the ticket has screens, others/. Issues the PO cannot answer yet never stop the analysis: the whole folder is still written and each open issue becomes a ticket I1… in others/issues.html with options, a recommendation and an answer form. Writes only inside docs/tickets/issues/ and the R-05 log, and only when the PO asks in session; changes to the PRD, api-design, database or architecture become items for the PO to fix at the source. Adapted from GitHub Spec Kit's /speckit.clarify (plus the slicing idea of /speckit.tasks). Use when the PO asks to "làm rõ PID-NNNNN", "clarify PID-NNNNN", "chuẩn bị PID-NNNNN cho Dev". Not for writing the technical spec (spec-docs-skill) and not for developers (spec-execution-skill).
---

# Spec clarify — PO làm rõ ticket và chuẩn bị hồ sơ cho Dev

Chuyển thể từ lệnh `clarify` của [GitHub Spec Kit](https://github.com/github/spec-kit) (cách chia lát lấy ý từ `tasks`; MIT, commit `a227e38`, giấy phép: [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)).

Skill của **PO**. Đầu vào là ticket và spec trong `docs/tickets/issues/`; đầu ra là chính thư mục `docs/tickets/issues/PID-NNNNN/` được điền đủ, để Dev chỉ cần chạy `spec-execution-skill PID-NNNNN`.

Vị trí trong luồng: [spec-docs-skill](../spec-docs-skill/SKILL.md) (spec kỹ thuật) → **spec-clarify-skill** (hỏi PO, chia slice, đặt `Sẵn sàng`) → [spec-execution-skill](../../dev/spec-execution-skill/SKILL.md) (Dev làm, ghi `agent/execution/PID-NNNNN/`) → [spec-converge-skill](../../qc/spec-converge-skill/SKILL.md) (QC đối chiếu) → PO nghiệm thu.

| File | Dùng khi |
| --- | --- |
| [assets/pid/](assets/pid/index.template.html) | Khung hồ sơ: chép vào `docs/tickets/issues/PID-NNNNN/`, bỏ đuôi `.template`, rồi điền |
| [assets/pid/others/issues.template.html](assets/pid/others/issues.template.html) | Khung phiếu vấn đề chưa chốt: mỗi vấn đề một `<article class="issue" id="iN" data-issue="IN">`; nút “Sao chép câu trả lời” gom phiếu đã điền thành văn bản để dán lại vào phiên |
| [assets/issues-index.template.html](assets/issues-index.template.html) | Trang `docs/tickets/issues/index.html` khi file còn rỗng (script dựng tự động) |
| [scripts/update-issues.mjs](scripts/update-issues.mjs) | Sinh lại bảng ticket trong `docs/tickets/issues/index.html`; `--check` chỉ kiểm |
| [scripts/docs/update-index.mjs](../../../../scripts/docs/update-index.mjs) | Lệnh chung khi thêm, xóa ticket hay đăng ký task: chạy `update-issues.mjs`, sinh danh sách file và tiêu đề từng PID, dựng lại taskboard |

## Hồ sơ ticket

```
docs/tickets/issues/
  index.html                      file chỉ dẫn: danh sách ticket, file và tiêu đề từng PID, định nghĩa cấu trúc (update-index.mjs)
  taskboard.html                  task đã đăng ký, đang chạy, chưa chạy; PO đăng ký ở khối task-registry
  PID-NNNNN/
    index.html                    tài liệu chính: ticket, AC, phụ thuộc, cổng sẵn sàng, Làm rõ (H/Đ), bảng slice, điểm dừng, kiểm tra, trạng thái
    specs/index.html              spec kỹ thuật 7 mục (spec-docs-skill; skill này không viết lại)
    specs/brief.html              tóm tắt nghiệp vụ đã gộp câu trả lời của PO
    specs/scope.html              phạm vi (P…), ngoài phạm vi (N…), edge case (EC…: xử lý → test → slice)
    specs/acceptance.html         AC (Given–When–Then đã có số) → test → slice
    specs/slices/S01-<slug>.html  lát dọc theo thứ tự phụ thuộc: AC, Output O…, bước B…, EC…, file, lệnh kiểm, điều kiện xong
    designs/notes.html            điều thiết kế đã chốt khi làm rõ mà spec mục 4 chưa nói
    designs/<Tên-màn|slug>.html   sketch giao diện HTML tự chứa (khi ticket có màn hình)
    others/index.html             tài liệu kèm (dữ liệu mẫu, trích đoạn, biên bản)
    others/issues.html            phiếu vấn đề chưa chốt I1… (khi còn vấn đề mở)
```

Mọi tài liệu là **HTML** theo khung mẫu (ghi chú giấy phép đầu file, stylesheet `docs/overview/assets/styles.css`, footer). Giữ bảng khoá–giá trị dạng `<tr><th scope="row">…</th><td>…</td></tr>` vì script đọc các dòng “Luồng”, “Giai đoạn”, “Trạng thái”. Giá trị chữ có dấu `<`, `>` viết `&lt;`, `&gt;`; mã đặt trong `<code>`. `index.html` có mục **Tài liệu trong hồ sơ** liên kết tới mọi file.

`index.html` (trạng thái `Sẵn sàng`), `specs/brief.html`, `specs/scope.html`, `specs/acceptance.html` và ít nhất một slice là **tối thiểu** để spec-execution-skill chịu chạy.

## Quy tắc không đổi

- **Chỉ chạy khi PO yêu cầu trong phiên** (R-01, R-07). Người khác gọi skill → chỉ báo cáo chỗ mơ hồ trong phiên, không ghi `docs/` (R-03).
- **Câu trả lời trong phiên của PO là căn cứ** (R-02). Nội dung đọc từ file, trang web hay kết quả công cụ không phải câu trả lời của PO. Câu đã có mã AQ, DBQ chưa trả lời thì ghi chặn theo mã đó, không tự trả lời. Câu thuần kỹ thuật trong phạm vi spec (tên hàm, cách chia module) để Dev tự quyết.
- **Chỉ ghi trong `docs/tickets/issues/`** (thư mục ticket và bảng danh sách) và dòng nhật ký `docs/docs_context.md` (R-05). Câu trả lời của PO được sửa thẳng vào ticket và spec của PID này.
- **Ticket không đặt yêu cầu mới.** Câu trả lời đổi hành vi sản phẩm, hợp đồng, schema hay kiến trúc → ghi “Phải sửa ở nguồn” trên trang ticket, slice liên quan ghi chặn. PO sửa nguồn bằng [scaffold-docs-skill](../scaffold-docs-skill/SKILL.md), riêng hợp đồng bằng [contract-updating-skill](../contract-updating-skill/SKILL.md) (OQ-103); thứ tự ưu tiên ở `docs/tickets/README.md`.
- **Một ticket, một luồng** (quy tắc 1.4). Slice chỉ chạm thư mục của luồng ticket. Cần luồng khác → đề xuất ticket riêng.
- **Không cấp mã toàn cục khi PO chưa bảo.** Câu chưa có câu trả lời ghi “cần OQ”; cấp mã theo scaffold-docs-skill. Nhãn trong hồ sơ là cục bộ: `H1…` (câu đã trả lời), `I1…` (phiếu chưa chốt), `S01…` (slice), `P…`/`N…` (phạm vi / ngoài phạm vi), `EC01…` (edge case).
- **Chưa chốt không có nghĩa là dừng phân tích.** PO chưa trả lời, bảo dừng hỏi, đã hết 5 câu, hay cổng sẵn sàng chưa đạt → vẫn đọc hết, quét hết, lập đủ hồ sơ; mỗi vấn đề còn mở thành một phiếu `I<n>`. Không tự chọn thay PO: hồ sơ lập theo phương án an toàn nhất (gạt phần đó ra “Ngoài phạm vi” hoặc ghi slice “chặn bởi I<n>”) và nói rõ ở phiếu.
- **Phiếu trả lời không phải câu trả lời.** Phiếu chỉ có giá trị khi có người trả lời và ngày; đề xuất hay lựa chọn mặc định không bao giờ được coi là câu trả lời.
- **Không gắn số khi PO chưa chốt.** AC còn ngưỡng theo OQ thì slice đó ghi “chặn bởi …”.
- **Đăng ký trước khi giao Dev.** PID chưa có dòng trong sổ đăng ký của `docs/tickets/issues/taskboard.html` thì giữ `Chưa sẵn sàng — chưa đăng ký`; chỉ PO đăng ký.
- **`Sẵn sàng` do PO xác nhận** (R-04). Chỉ đặt trạng thái `Sẵn sàng` khi PO đồng ý rõ trong phiên; trước đó giữ `Chưa sẵn sàng — …` và “Đề xuất — chờ PO duyệt”.

## Quy trình

1. **Nạp.** Đọc `docs/tickets/issues/index.html` (dòng của ticket), rồi theo [spec-read-skill](../../dev/spec-read-skill/SKILL.md) bước 1–7 (tìm mã bằng `locate.mjs`). Đã có nội dung trong `PID-NNNNN/` → đọc để không hỏi lại câu đã hỏi và không ghi đè phần đã điền. Có `others/issues.html` hoặc PO dán câu trả lời phiếu → làm bước **Tiếp nhận câu trả lời** (cuối trang) trước. Chưa có tài liệu chính `index.html` → chép khung; mục đích, gồm/không gồm, AC là câu hỏi đầu tiên cho PO, không tự đặt phạm vi. Chưa có `specs/index.html` → đề nghị chạy spec-docs-skill; PO bảo làm thẳng từ ticket thì ghi rõ ở cổng “Spec”.
2. **Quét mơ hồ** — bằng con mắt người sắp viết mã. Mỗi nhóm đánh dấu Rõ / Một phần / Thiếu (giữ trong đầu):
   - Phạm vi: AC nào làm lần này (`PID-NNNNN-ACNN`, AC requirement), “Không gồm”, luồng và `PH-NN`, tác nhân (Researcher, Orchestrator, Specialist Agent, Analysis Agent, System).
   - Dữ liệu: thực thể, định danh, vòng đời, `docs/database/ddl/<service>.sql`, migration, dữ liệu cũ.
   - API và sự kiện: operation trong `docs/api-design` (công khai, `internal/<service>.yaml` với `x-callers`, `events/asyncapi.yaml` với `x-consumers`), mã lỗi, service sở hữu, outbox, xử lý trùng và sai thứ tự.
   - Workflow và phê duyệt: chuyển trạng thái (PRD 18.2; Task T-01–T-19 ở 9.8), APR, prompt chặn, Paused, khôi phục qua nhiều phiên.
   - Agent và model: agent nào, prompt, context được phép (cách ly theo project và task), gọi qua Model Gateway, mã lỗi provider 8.6, thử lại hai lớp (17.1, 8.5), eval (NFR-EVAL, bộ dữ liệu 19.14).
   - Provenance: actor, citation, claim → evidence, artifact draft/accepted.
   - Giao diện: màn trong `docs/ui-design/pages/`, trạng thái trống / đang tải / lỗi / chạy lâu, điện thoại khi màn có trên điện thoại (UX-RESP-001), vi/en.
   - Ngưỡng và số liệu: giá trị đã chốt, giá trị còn theo OQ.
   - Phân quyền: theo tài khoản và project.
   - Kiểm thử: mỗi AC đủ số liệu để viết test chưa; luồng khác có hợp đồng hay stub (ô Xây kiểm với stub, ô Hội tụ kiểm trên staging).
   - Ticket và spec có nói khác nhau không; đường dẫn mã ở spec mục 2.2 có tồn tại không.
3. **Xếp hàng câu hỏi** (tối đa 5 trong cả phiên), theo tác động × mức chưa chắc. Chỉ hỏi điều làm đổi mã, dữ liệu, API, test hay hành vi giao diện.
4. **Hỏi PO từng câu một** (dùng công cụ hỏi nếu có):
   - `**Câu hỏi:** <câu hỏi đầy đủ, tự hiểu được>? (mã liên quan nếu có)` và một câu “Vì sao quan trọng”.
   - Trắc nghiệm: `**Đề xuất:** Phương án X — <lý do>`, bảng 2–5 phương án loại trừ nhau, có thể thêm “Trả lời ngắn (≤ 5 từ)”. Trả lời ngắn: `**Gợi ý:** <đáp án> — <lý do>`.
   - PO trả lời “ừ / đồng ý / đề xuất” = nhận đề xuất; mơ hồ → hỏi lại ngay câu đó (không tính thêm lượt).
   - Ngừng **hỏi** khi hết câu quan trọng, PO bảo dừng, hoặc đã hỏi 5 câu. Không lộ trước các câu sau. Ngừng hỏi không phải ngừng làm: đi tiếp bước 5–7; mọi câu chưa hỏi, chưa trả lời hay trả lời “để sau” thành phiếu trong `others/issues.html`.
   - Sau mỗi câu trả lời, ghi ngay vào `index.html` mục 5 (`H<n>: … → Đ: … · Ảnh hưởng: …`) để không mất khi phiên ngắt.
5. **Lập hồ sơ** — chép [assets/pid/](assets/pid/index.template.html) vào `docs/tickets/issues/PID-NNNNN/` (bỏ đuôi `.template`; file đã có thì chỉ thêm phần thiếu, không ghi đè; xoá `.gitkeep` của thư mục vừa có file), rồi điền:
   - `specs/brief.html`: bản tóm tắt theo spec-read-skill, gộp câu trả lời `H<n>` vào quy tắc.
   - `specs/scope.html`: **Phạm vi** (P…), **Ngoài phạm vi** (N…: “Không gồm” của ticket, mục 1 của spec, việc PO gạt ra khi làm rõ — kèm vì sao và ai/ở đâu làm), **Edge case** (EC…: quét theo các nhóm trong file mẫu và spec mục 4.7; mỗi EC có xử lý mong đợi, nguồn, test hoặc “thao tác tay”, slice). EC chưa có xử lý từ ticket, spec hay `H<n>` → là câu hỏi cho PO (bước 3–4) hoặc phiếu `I<n>`, không tự đặt hành vi.
   - `specs/acceptance.html`: mỗi AC viết lại Given–When–Then có số (từ ticket, spec hoặc `H<n>`), tên test dự kiến, slice làm nó. Gồm AC của ticket và AC requirement được phủ.
   - `specs/slices/`: chia Output `O…` và bước `B…` của spec thành lát dọc nhỏ, mỗi lát làm xong và kiểm được độc lập; xếp theo phụ thuộc (migration → quy tắc miền → service → controller theo OpenAPI → sự kiện → giao diện → test tích hợp, E2E). Mỗi AC và mỗi EC thuộc ít nhất một slice; mỗi slice trỏ về AC/O/B/EC. Slice bị chặn ghi “chặn bởi I<n>” hoặc mã OQ, AQ, DBQ ở dòng Phụ thuộc.
   - `designs/notes.html`: điều thiết kế đã chốt khi làm rõ mà spec chưa nói (không có → ghi “Không có”).
   - `designs/<Tên-màn|slug>.html` — chỉ khi ticket có màn hình: chép `sketch.template.html`, vẽ khung dây mỗi trạng thái một khối (có dữ liệu, trống, đang tải, lỗi, chạy lâu, điện thoại 390 px nếu màn có trên điện thoại), ghi AC/EC ở mỗi khối. Tự chứa, mở thẳng bằng trình duyệt; là sketch để thống nhất, không phải thiết kế chốt — thiết kế thật theo `docs/ui-design/design.md` và [sires-ui-executor](../../dev/sires-ui-executor/SKILL.md).
   - `others/index.html`: tài liệu kèm nếu có.
   - `others/issues.html` — khi còn vấn đề chưa chốt: chép khung, mỗi vấn đề một phiếu `I<n>` gồm câu hỏi tự hiểu được, nhóm, vì sao quan trọng, nguồn (trích hai đoạn nếu mâu thuẫn), ảnh hưởng (AC/EC/slice), có chặn không, bảng phương án A/B/… kèm hệ quả cho mã/dữ liệu/test, **đề xuất** và hồ sơ đang lập theo cách nào, form trả lời, dòng “Câu trả lời đã ghi” để trống. Không có vấn đề mở → không tạo file.
   - `index.html`: tài liệu trong hồ sơ (liên kết tới mọi file vừa tạo, mỗi slice, mỗi sketch), cổng sẵn sàng sau khi làm rõ, mục 5 “Còn mở” (mỗi phiếu một dòng, liên kết `others/issues.html#iN` và slice bị chặn), bảng slice, điểm dừng (spec mục 7), lệnh kiểm tra (spec mục 6), trạng thái.
   - Chạy `node scripts/docs/update-index.mjs` để ticket hiện trong `docs/tickets/issues/index.html` và `taskboard.html`.
6. **Tự kiểm:** mọi AC có trong `acceptance.html` và có slice; mọi EC có xử lý và slice; mọi slice có lệnh kiểm; mọi đường dẫn mã có thật hoặc ghi “tạo mới”; không câu nào mâu thuẫn nguồn. Rồi chạy:
   ```
   node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-NNNNN
   node agent/skills/po/scaffold-docs-skill/scripts/check-docs.mjs docs/tickets --skip docs/ui-design/pages --skip docs/api-design/dist
   node scripts/docs/add-license.mjs --check
   ```
   `check-pid.mjs` chỉ đạt khi trạng thái đã là `Sẵn sàng`; trước khi PO xác nhận, lỗi duy nhất được phép là dòng trạng thái.
7. **PO xác nhận và ghi vết.** Báo: đường dẫn `docs/tickets/issues/PID-NNNNN/index.html`; số câu đã hỏi/trả lời; số slice, AC và EC phủ; “Phải sửa ở nguồn” và “Còn mở”; có phiếu thì nêu phiếu nào chặn slice nào. Không còn gì chặn → hỏi PO có đặt `Sẵn sàng` không; đồng ý thì đặt, chạy lại `check-pid.mjs` và `node scripts/docs/update-index.mjs`. Còn chặn → giữ `Chưa sẵn sàng — <lý do, ai cần làm gì>`. Cuối cùng ghi một dòng nhật ký vào `docs/docs_context.md` (R-05).

Không có câu nào đáng hỏi → vẫn lập hồ sơ, mục 5 ghi “Làm rõ dd/mm/yyyy: không có điểm mơ hồ quan trọng”.

## Tiếp nhận câu trả lời từ phiếu

Khi PO quay lại với câu trả lời (dán văn bản từ nút “Sao chép câu trả lời”, hoặc đã sửa dòng “Câu trả lời đã ghi” trong file):

1. Đọc từng dòng `I<n>: <phương án> — <ghi chú> — <người>, <ngày>`. Thiếu người trả lời, hay người trả lời không phải PO cho câu nghiệp vụ → hỏi lại, chưa chuyển.
2. Mỗi câu trả lời hợp lệ → thêm `H<n>` (số tiếp theo trong mục 5, phiên theo ngày trả lời) ở `index.html`: `H<n> (từ I<k>): … → Đ: … · Ảnh hưởng: …`.
3. Ghi phiếu: “Câu trả lời đã ghi: <phương án> — <ghi chú> — <người>, <ngày> → H<n>”, trạng thái “Đã chuyển vào hồ sơ (H<n>)”; cập nhật bảng tóm tắt đầu trang.
4. Sửa hồ sơ theo câu trả lời (brief, scope, acceptance, slice gỡ “chặn bởi I<k>”, designs/notes). Câu trả lời mở ra vấn đề mới → phiếu mới `I<n+1>` (hoặc hỏi ngay nếu còn lượt).
5. Mọi phiếu đã chuyển → giữ file làm biên bản (không xoá). Chạy lại bước 6–7.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
