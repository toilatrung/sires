# PID-00022 — Triển khai

- **Ticket:** [PID-00022](../../../docs/tickets/issues/PID-00022/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 21/11/2026

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Mã thử ở `apps/agent-core/spikes/spk-08/`, ngoài `src/`: không vào wheel `sires-agent-core`, không được `agent_core` import, không thêm phụ thuộc (dùng FastAPI, uvicorn, httpx, PyYAML, jsonschema, referencing đã có trong workspace và client sinh của PID-00007). Hai điểm vào là hai script chạy tay theo `acceptance.html`.

**S01 — `context_size.py` (AC01, EC01, EC02).** Dựng project tổng hợp, đếm token từng lớp theo agent, cắt gọn theo PRD 14.2 cho từng model.

1. `Project(profile, name)` đọc `profile.json` (hai profile `typical`, `ceiling`) và dựng `AgentContext` cho 9 agent: mỗi `Entry` có lớp, `TypedRef`, nội dung, tóm tắt có sẵn (nếu có) và nguồn (`operationId` trả nó) — `spk08_synthetic.py:348`. Lớp 1 (agent-core sở hữu) gồm chỉ dẫn, định nghĩa tool và schema đầu ra lấy thật từ hợp đồng (`spk08_contract.inline_schema`) — `spk08_synthetic.py:165`.
2. `Sizer` đo mỗi entry một lần (ký tự ASCII, ký tự trong từ có dấu, byte UTF-8) — `context_size.py:69`; `spk08_tokens.estimate` chia theo tỉ lệ ký tự/token của provider, `upper_bound` lấy số byte — `spk08_tokens.py:85`, `:91`.
3. `fit` áp thứ tự cắt PRD 14.2 cho một model và một cách đếm (ước lượng hoặc cận trên) — `context_size.py:88`; `Model.budget` tính token đầu vào còn lại — `context_size.py:45`.
4. `breakeven` tính số Context Item Active tối đa trước khi lớp 1–3 (không cắt) vượt budget — `context_size.py:198`.
5. `run` gom kết quả, `markdown` dựng bảng; `--out` ghi `context_size.json`, `context_size.md` — `context_size.py:174`, `:301`.

**S02 — `read_latency.py` (AC02, EC03).** Đo thời gian đọc song song 5 API context trên stub có trễ.

1. `Stubs` mở 5 tiến trình `spk08_stub.py`, mỗi service một cổng ngẫu nhiên trên `127.0.0.1`, chờ `/_spike/ready` — `read_latency.py:217`.
2. Mỗi stub lấy method và path của operation từ hợp đồng (`spk08_contract.operation`), kiểm payload theo schema 200 bằng jsonschema trước khi chạy (`build_payloads`), rồi phục vụ payload đã serialize; trễ mỗi request là `median × exp(σ·N(0,1))`, đổi lúc chạy qua `POST /_spike/config` — `spk08_stub.py:45`, `:57`, `spk08_contract.py:63`, `:83`.
3. `Reader` gọi 5 operation bằng client sinh từ hợp đồng (`sires_common.generated.*`, `asyncio_detailed`), mỗi operation có deadline `asyncio.timeout` riêng — `read_latency.py:100`, `:121`. `read` chạy ba cách: `parallel` (một `TaskGroup`), `two_wave` (research sau khi planning trả `prerequisiteOutputs`), `sequential` — `read_latency.py:175`.
4. `scenario` đặt trễ cho cả 5 stub, chạy lượt khởi động rồi lượt đo; `main` lặp payload × cách đọc × σ × mức trễ, ghi `read_latency.json`, `read_latency_raw.csv`, `read_latency.md` — `read_latency.py:288`, `:386`.
5. `ec03` lần lượt làm một service trả lời sau 3 × timeout và ghi: lắp ráp thất bại hay không, có context dở dang không, lỗi có nêu đúng service không, thời gian tới lỗi — `read_latency.py:300`.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `fit` | Thuật toán | `context_size.py:88` | Cắt gọn theo PRD 14.2 cho một model và nói có vừa không | Sai thì bảng “vừa context window” của AC01 sai | Lớp 1–3 không bao giờ bị cắt; thứ tự L7 → L6 → L5 → L4; lớp 1–3 vượt → `context_too_long` | `test_spk08.py › test_trimming_never_touches_layers_1_to_3_and_follows_prd_14_2_order`, `› test_ec01_layers_1_to_3_over_budget_give_context_too_long` |
| `estimate`, `upper_bound` | Hàm | `spk08_tokens.py:85`, `:91` | Ước lượng token theo provider; cận trên theo byte | Mọi số token của báo cáo đi qua đây (EC02) | Cận trên ≥ ước lượng | `› test_upper_bound_is_never_below_the_estimate` |
| `Model.budget` | Hàm | `context_size.py:45` | `min(max_input, context_window − dành cho đầu ra)` | Quyết định ngưỡng so sánh của mọi model | Không vượt giới hạn đầu vào của provider | `› test_ac01_every_agent_has_a_size_table_and_a_verdict_per_model` |
| `Project.layer1` | Hàm | `spk08_synthetic.py:165` | Lớp 1: chỉ dẫn (giả định), tool (giả định), schema đầu ra (đo từ hợp đồng) | Chưa có prompt thật; đây là phần ước lượng của lớp không cắt | Schema lấy từ `docs/api-design` chỉ đọc | `› test_ac01_…` |
| `Reader.read`, `_group` | Hàm | `read_latency.py:175`, `:163` | Đọc 5 API qua client sinh; một lỗi hay hết giờ thì hủy phần còn lại | Là cách Context Assembler dự kiến đọc context; cho số AC02 và hành vi EC03 | Không trả context thiếu lớp: lỗi bất kỳ → `ContextAssemblyFailed`, không có kết quả dở dang | `› test_ac02_ec03_read_latency_runs_end_to_end` |
| `build_payloads`, `validate_response` | Hàm | `spk08_stub.py:45`, `spk08_contract.py:83` | Payload stub theo schema 200 của hợp đồng | Stub lệch hợp đồng thì số đo không đại diện | Payload sai schema làm stub không khởi động | `› test_stub_payloads_match_the_contracts` |

### Thuật toán: cắt gọn theo PRD 14.2 (`fit`)

- **Vào, ra:** context của một agent, một model, budget, cách đếm; ra trạng thái `fits` / `trimmed` / `context_too_long` / `exceeds_after_trim`, token mỗi lớp trước và sau, danh sách bước cắt, lớp lớn nhất khi vượt.
- **Các bước:** tổng lớp 1–3 > budget → `context_too_long` (lớp lớn nhất trong 1–3). Ngược lại, khi tổng > budget: L7 bỏ tin cũ nhất trước, giữ tóm tắt cuốn chiếu; L6 thay Research Context bằng tóm tắt; L5 bỏ đoạn kém liên quan nhất, giữ ít nhất 1; L4 thay toàn văn bằng tóm tắt có sẵn, mục lớn trước. Mỗi bước dừng ngay khi vừa. Còn vượt → `exceeds_after_trim` (lớp lớn nhất trong 4–7).
- **Độ phức tạp, chi phí:** tuyến tính theo số entry (tối đa ~5.500 entry, Reference Processing ở `ceiling`); đo kích thước một lần mỗi entry rồi dùng lại cho 10 model × 2 cách đếm.
- **Trường hợp biên đã xử lý:** EC01 (lớp 1–3 vượt, hoặc vượt sau khi cắt hết mức: ghi agent, lớp, model); EC02 (không có bộ đếm chính xác: ước lượng kèm cận trên); entry không có tóm tắt (danh sách reference, citation key, cây file) không bị thay.

### Thuật toán: đọc song song có deadline (`Reader._group`)

- **Vào, ra:** danh sách service; ra kết quả đã parse của từng operation hoặc `ContextAssemblyFailed` nêu operation lỗi.
- **Các bước:** mỗi operation chạy trong `asyncio.timeout(timeout)` trong một `asyncio.TaskGroup`; operation đầu tiên lỗi làm TaskGroup hủy các operation còn lại; `ExceptionGroup` được đổi thành `ContextAssemblyFailed` không kèm kết quả nào. Research có hơn 200 tham chiếu thì chia lô (`ContextBundleRequest.refs maxItems 200`) và gọi song song.
- **Độ phức tạp, chi phí:** thời gian ≈ trễ lớn nhất trong các operation cùng đợt + thời gian parse của client (đơn luồng, theo kích thước payload).
- **Trường hợp biên đã xử lý:** EC03 (một API hết giờ → cả lần đọc thất bại, nêu đúng service, không có context thiếu lớp); lô research.

## 3. Quyết định kỹ thuật trong phạm vi

- Stub và payload đọc thẳng `docs/api-design/internal/*.yaml` (method, path, schema 200, kiểm bằng jsonschema và referencing); phía đọc dùng client sinh của PID-00007 (`asyncio_detailed`), nên payload phải qua cả schema hợp đồng lẫn model sinh. Client sinh không commit (`.gitignore`); `read_latency.py` báo lệnh `pnpm nx run @sires/contracts:generate-python` khi thiếu, smoke test S02 bỏ qua (skip) khi thiếu.
- Mỗi service một tiến trình stub, HTTP/1.1 keep-alive trên `127.0.0.1`, payload serialize sẵn: số đo gồm trễ giả định, truyền tải và parse phía agent-core, không gồm thời gian truy vấn database của service thật.
- Trễ log-normal theo trung vị và σ (σ = 0 là trễ cố định) thay cho một hằng số: với nhiều API song song, đuôi phân phối của từng API quyết định p95 của cả lần đọc.
- Percentile bằng `statistics.quantiles(n=100, method="inclusive")`; mỗi ô đo có lượt khởi động bỏ đi.
- Đếm token không có tokenizer: tỉ lệ tiếng Anh theo tài liệu provider; tỉ lệ tiếng Việt là giả định GĐ-T1; cận trên theo byte UTF-8 (mỗi token ít nhất một byte với BPE mức byte và SentencePiece có byte fallback). Báo cáo ghi cả hai.
- Entry được render thành JSON gọn (`ref`, `title`, `content` hoặc `summary`) để đếm: định dạng prompt thật của Context Assembler chưa có (PID-00072).
- Tên module phụ có tiền tố `spk08_` để không trùng tên module của spike khác khi pytest chèn thư mục test vào `sys.path`.
- Smoke test `test_spk08.py` nằm trong thư mục spike nên `pnpm nx run agent-core:test` chạy nó; test không kiểm ngưỡng độ trễ (PO chưa đặt), chỉ kiểm mã đo chạy và bất biến cắt gọn, EC03.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
