# PID-00022 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00022](../../../docs/tickets/issues/PID-00022/index.html) · **Luồng:** `agent-core` · **Giai đoạn:** PH-01
- **Nhánh:** `agent-core/spk-08-context` (đã commit, mã: `07dd874`, ký SSH) · **PR:** [#53](https://github.com/toilatrung/sires/pull/53)
- **Cập nhật:** 21/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 3/3 xong. Bị chặn: không có.
- AC: 3/3 đạt, kiểm với stub (mức Xây). Edge case: 3/3 đã xử lý; EC01 cần lưu ý (có ca vượt ở profile trần, mục 3.2).
- Yêu cầu thêm: 2 (YC1, YC2, trong phạm vi).
- Kết luận chính: ở mức điển hình, context của cả 9 agent vừa mọi model ứng viên kể cả theo cận trên; ở mức trần, lớp 3 (không cắt, không giới hạn số Context Item) và danh sách reference chống trùng của Discovery/Reference Processing là hai chỗ vượt. Đọc 5 API song song: p95 ≈ trễ giả định + 17 ms khi trễ cố định, nhưng ≈ 3,7 × trễ khi trễ có đuôi (σ = 0,5). Kết luận ASM-04 là **sơ bộ** (mục 3.5).

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Kích thước context | Xong | tạo: `apps/agent-core/spikes/spk-08/context_size.py`, `spk08_synthetic.py`, `spk08_tokens.py`, `spk08_contract.py`, `profile.json`, `models.json`, `README.md`, `test_spk08.py`; dữ liệu: `agent/execution/PID-00022/data/context_size.md`, `context_size.json` |
| S02 | Độ trễ đọc context | Xong | tạo: `apps/agent-core/spikes/spk-08/read_latency.py`, `spk08_stub.py`; dữ liệu: `agent/execution/PID-00022/data/read_latency.md`, `read_latency.json`, `read_latency_raw.csv` |
| S03 | Báo cáo | Xong | tạo: `agent/execution/PID-00022/report.md`, `implement.md`, `self-qc.md` |

## 3. Kết quả

### 3.1 Giả định cần kiểm và phép đo (B1)

| Giả định | Câu hỏi | Phép đo | Kết quả |
| --- | --- | --- | --- |
| ASM-04 | Context đã lắp của một bước có vừa context window của model được gán sau khi cắt theo PRD 14.2 không? | S01: 9 agent × 2 profile (`typical`, `ceiling`) × 10 model của 3 provider; đếm token 7 lớp; cắt theo thứ tự 14.2 | 3.2 |
| ASM-04, EC01 | Khi vượt, lớp nào vượt, với agent và model nào? Lớp 1–3 (không cắt) chịu được bao nhiêu? | S01: bảng ca vượt; số Context Item Active tối đa trước khi lớp 1–3 vượt | 3.2 |
| ADR-17, TR-09 | Lắp context từ 5 service qua API nội bộ mất bao lâu? Đọc song song giữ p95 thấp được không? | S02: stub 5 service theo hợp đồng, trễ giả định 0–100 ms, cố định và log-normal σ = 0,5; ba cách đọc | 3.3 |
| TR-09, EC03 | Một service chậm hay hết giờ thì Agent Run ra sao? | S02 `--ec03`: một service trả lời sau 3 × timeout | 3.3 |

### 3.2 S01 — kích thước context (AC01, EC01, EC02)

**Cách đo.** `context_size.py` dựng project tổng hợp tất định ở mức NFR-SCALE-001 (`profile.json`: mỗi tham số có nguồn, chỗ tài liệu không có giới hạn ghi giả định GĐ-01…GĐ-11), render 7 lớp của từng agent thành JSON gọn và đếm token hai cách (EC02):

- **Ước lượng:** ký tự chia tỉ lệ ký tự/token. Tiếng Anh theo tài liệu provider: Anthropic 2,5 (“1M tokens ≈ 2.5M Unicode characters”), OpenAI 4, Google 4. Tiếng Việt là giả định GĐ-T1 (2,0; 3,0; 3,0), **sai số chưa biết** vì không có tokenizer chính xác.
- **Cận trên:** số byte UTF-8. BPE mức byte (OpenAI, Anthropic) và SentencePiece có byte fallback (Gemini) không sinh quá một token mỗi byte, nên số token thật ≤ số byte (bỏ qua vài token khung của mỗi message). Cận trên cao hơn ước lượng 2,6–4 lần: kết luận vừa theo cận trên là chắc chắn; vừa chỉ theo ước lượng thì phải đo lại bằng count API ở PID-00072.
- **Budget** = min(`max_input_tokens`, `context_window` − 16.384 token dành cho đầu ra, GĐ-11). Model trong `models.json`: nhóm theo giao diện PO duyệt (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gemini-2.5-pro`) và model hiện hành ngày 21/11/2026 (`gpt-6.2-astra`, `gemini-3.8-flash`, `gemini-4-carbon`); giới hạn chép từ trang chính thức. Lưu ý: `gpt-5`, `gpt-5-mini`, `gpt-5-nano` đã deprecated; `gemini-2.5-pro` deprecated, định tuyến sang `gemini-3.8-flash` từ 01/12/2026.
- **Lớp 1** chưa có prompt thật: chỉ dẫn 6.000 ký tự (trần 16.000) và định nghĩa tool là giả định GĐ-02; schema đầu ra đo thật từ hợp đồng (ví dụ `PlanVersionCreate`, `ChangeProposal`, `DeliberationEntryWrite`), 10–24 nghìn ký tự mỗi agent.
- **Cắt gọn** theo PRD 14.2: L7 bỏ tin cũ (giữ tóm tắt cuốn chiếu) → L6 dùng tóm tắt → L5 giữ đoạn liên quan nhất (ít nhất 1) → L4 thay toàn văn bằng tóm tắt có sẵn. Lớp 1–3 không cắt; tổng lớp 1–3 > budget là `context_too_long`.

**Kích thước theo lớp, profile `typical`** (token ước lượng theo tỉ lệ Anthropic, tỉ lệ khắt khe nhất trong ba provider):

| Agent | L1 | L2 | L3 | L4 | L5 | L6 | L7 | Tổng Anthropic | Tổng OpenAI | Tổng Google | Cận trên |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| orchestrator | 6,734 | 3,235 | 14,689 | 13,128 | — | 2,004 | 10,622 | 50,412 | 32,987 | 32,987 | 132,307 |
| discovery | 9,402 | 3,221 | 14,671 | 62,714 | — | 1,998 | — | 92,006 | 58,321 | 58,321 | 231,931 |
| reference_processing | 4,028 | 3,235 | 14,670 | 75,995 | — | — | — | 97,928 | 61,812 | 61,812 | 247,178 |
| evidence_retrieval | 8,028 | 3,199 | 14,714 | 2,740 | 20,830 | 2,004 | — | 51,515 | 33,092 | 33,092 | 131,196 |
| synthesis | 10,516 | 3,236 | 14,699 | 27,999 | 20,831 | 2,000 | — | 79,281 | 51,459 | 51,459 | 206,098 |
| writing | 9,049 | 3,232 | 14,687 | 43,888 | 15,622 | 2,002 | — | 88,480 | 57,462 | 57,462 | 230,339 |
| verification | 4,508 | 3,215 | 14,654 | 18,150 | 20,832 | — | — | 61,359 | 39,627 | 39,627 | 159,277 |
| analysis | 10,295 | 4,751 | 14,708 | 15,316 | 10,412 | 1,996 | — | 57,478 | 37,426 | 37,426 | 149,216 |
| diagram | 4,006 | 3,216 | 14,667 | 9,939 | — | — | — | 31,828 | 20,874 | 20,874 | 84,412 |

**Vừa context window, profile `typical`:** cả 9 agent **vừa** mọi model, theo cả ước lượng lẫn cận trên (lớn nhất 247.178 token cận trên, Reference Processing, so với budget nhỏ nhất 272.000 của họ `gpt-5`). Không có ca vượt.

**Kích thước theo lớp, profile `ceiling`:**

| Agent | L1 | L2 | L3 | L4 | L5 | L6 | L7 | Tổng Anthropic | Tổng OpenAI | Tổng Google | Cận trên |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| orchestrator | 13,616 | 17,160 | 170,259 | 73,333 | — | 9,226 | 201,486 | 485,080 | 320,371 | 320,371 | 1,315,928 |
| discovery | 14,361 | 17,152 | 170,350 | 809,060 | — | 9,206 | — | 1,020,129 | 644,689 | 644,689 | 2,587,400 |
| reference_processing | 8,987 | 17,169 | 170,369 | 935,491 | — | — | — | 1,132,016 | 714,138 | 714,138 | 2,865,316 |
| evidence_retrieval | 12,508 | 17,153 | 170,340 | 23,549 | 136,180 | 9,220 | — | 368,950 | 238,504 | 238,504 | 963,953 |
| synthesis | 14,516 | 17,176 | 170,381 | 1,055,136 | 136,181 | 9,235 | — | 1,402,625 | 924,027 | 924,027 | 3,816,878 |
| writing | 13,049 | 17,138 | 170,255 | 828,714 | 68,087 | 9,224 | — | 1,106,467 | 728,335 | 728,335 | 2,989,048 |
| verification | 8,988 | 17,144 | 170,276 | 169,138 | 136,182 | — | — | 501,728 | 326,439 | 326,439 | 1,329,378 |
| analysis | 15,255 | 21,123 | 170,400 | 147,091 | 68,088 | 9,240 | — | 431,197 | 282,360 | 282,360 | 1,152,694 |
| diagram | 8,966 | 17,136 | 170,330 | 147,861 | — | — | — | 344,293 | 227,469 | 227,469 | 935,027 |

**Vừa context window, profile `ceiling`** (ô “ước lượng ‖ cận trên” khi hai cách đếm khác nhau; “cắt Lx” là vừa sau khi cắt các lớp đó):

| Agent | Claude Opus/Sonnet/Haiku 5.5 (983.616) | gpt-5 / -mini / -nano (272.000) | gpt-6.2-astra (922.000) | gemini-2.5-pro / 3.8-flash (1.048.576) | gemini-4-carbon (1.032.192) |
| --- | --- | --- | --- | --- | --- |
| orchestrator | vừa ‖ cắt L7 | cắt L7 ‖ L1–3 vượt (L3) | vừa ‖ cắt L7 | vừa ‖ cắt L7 | vừa ‖ cắt L7 |
| discovery | vượt sau cắt (L4) | vượt sau cắt (L4) ‖ L1–3 vượt (L3) | vừa ‖ vượt sau cắt (L4) | vừa ‖ vượt sau cắt (L4) | vừa ‖ vượt sau cắt (L4) |
| reference_processing | vượt sau cắt (L4) | vượt sau cắt (L4) ‖ L1–3 vượt (L3) | vừa ‖ vượt sau cắt (L4) | vừa ‖ vượt sau cắt (L4) | vừa ‖ vượt sau cắt (L4) |
| evidence_retrieval | vừa | vừa ‖ L1–3 vượt (L3) | vừa ‖ cắt L6, L5 | vừa | vừa |
| synthesis | cắt L6, L5, L4 | cắt L6, L5, L4 ‖ L1–3 vượt (L3) | cắt L6 ‖ cắt L6, L5, L4 | vừa ‖ cắt L6, L5, L4 | vừa ‖ cắt L6, L5, L4 |
| writing | cắt L6, L5, L4 | cắt L6, L5, L4 ‖ L1–3 vượt (L3) | vừa ‖ cắt L6, L5, L4 | vừa ‖ cắt L6, L5, L4 | vừa ‖ cắt L6, L5, L4 |
| verification | vừa ‖ cắt L5, L4 | cắt L5 ‖ L1–3 vượt (L3) | vừa ‖ cắt L5, L4 | vừa ‖ cắt L5 | vừa ‖ cắt L5 |
| analysis | vừa ‖ cắt L6, L5 | cắt L6, L5 ‖ L1–3 vượt (L3) | vừa ‖ cắt L6, L5, L4 | vừa ‖ cắt L6, L5 | vừa ‖ cắt L6, L5 |
| diagram | vừa | vừa ‖ L1–3 vượt (L3) | vừa ‖ cắt L4 | vừa | vừa |

**Ca vượt (EC01)** — đầy đủ ở `data/context_size.md`; tóm tắt:

| Agent | Model | Đếm | Lớp vượt | Token lớp đó | Budget | Vì sao |
| --- | --- | --- | --- | ---: | ---: | --- |
| discovery, reference_processing | mọi model (ước lượng: Claude và họ `gpt-5`; cận trên: tất cả) | ước lượng, cận trên | L4 | 809.620–2.156.127 | 272.000–1.048.576 | 5.000 reference của tài khoản (NFR-SCALE-002) đưa vào context để chống trùng; danh sách metadata không có bản tóm tắt nên L4 không cắt được |
| cả 9 agent | `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | cận trên | L3 | ~458.000 | 272.000 | 350 Context Item Active × 800 ký tự (GĐ-04) cộng phản hồi review 10.000 ký tự; lớp 3 không bao giờ bị cắt |

**Lớp 3 chịu được bao nhiêu Context Item** (số Context Item Active tối đa trước khi lớp 1–3 vượt budget, lấy agent có lớp 1–2 lớn nhất):

| Model | `typical` (400 ký tự/item) ước lượng ‖ cận trên | `ceiling` (800 ký tự/item) ước lượng ‖ cận trên |
| --- | ---: | ---: |
| Claude 5.5 (983.616) | 3.481 ‖ 1.289 | 1.992 ‖ 689 |
| `gpt-5` họ (272.000) | 1.429 ‖ 317 | 785 ‖ 129 |
| `gpt-6.2-astra` (922.000) | 4.981 ‖ 1.205 | 2.868 ‖ 641 |
| `gemini-2.5-pro`, `gemini-3.8-flash` (1.048.576) | 5.673 ‖ 1.378 | 3.274 ‖ 740 |
| `gemini-4-carbon` (1.032.192) | 5.583 ‖ 1.356 | 3.221 ‖ 727 |

**Điều rút ra từ S01:**

1. Ở mức điển hình, context không phải vấn đề: lớn nhất ~98 nghìn token ước lượng Anthropic, ~247 nghìn theo cận trên, dưới budget của mọi model.
2. Lớp 3 là rủi ro thật vì “không cắt” mà số Context Item Active không có giới hạn (NFR-SCALE-001 không nêu, `listContextItemsForAssembly` không phân trang). Với họ `gpt-5`, từ khoảng 129–785 item (tùy độ dài và sai số đếm) Agent Run sẽ `context_too_long` ở mọi agent; với model 1M token là khoảng 640–3.300 item.
3. Discovery và Reference Processing không thể nhận cả Trusted Library (5.000 reference) trong context: sau khi cắt vẫn vượt với Claude và họ `gpt-5` theo ước lượng, với mọi model theo cận trên. Chống trùng nên là việc tất định của System (library), không phải nội dung context.
4. Thứ tự cắt của 14.2 bỏ evidence trước tóm tắt đầu vào: ở `ceiling`, Synthesis và Writing xuống còn 1 đoạn evidence (từ 100 và 50) trước khi L4 bị tóm tắt; Writing với họ `gpt-5` thì L4 tóm tắt 19/128 mục, mục lớn nhất trước, tức là chính file bản thảo cần sửa bị thay bằng tóm tắt.
5. Lớp 7 của Orchestrator ở trần (20 tin × 20.000 ký tự) là ~200 nghìn token ước lượng: với họ `gpt-5` phải bỏ 8/20 tin; cắt đúng thiết kế.
6. Sai số đếm lớn: cận trên gấp 2,6–4 lần ước lượng; phần JSON và UUID của mỗi entry (~100 ký tự) chiếm đáng kể ở các lớp nhiều mục nhỏ (lớp 3, danh sách reference). Kết luận gần ngưỡng (mọi ô “ước lượng ‖ cận trên” khác nhau) cần đo lại bằng count API.

### 3.3 S02 — độ trễ đọc context (AC02, EC03)

**Cách đo.** `read_latency.py` mở 5 tiến trình stub (`spk08_stub.py`), mỗi service một tiến trình trên `127.0.0.1`, method và path lấy từ hợp đồng, payload kiểm theo schema 200 trước khi chạy. Payload là context của Writing Agent (agent duy nhất dùng đủ 5 operation): `typical` 240 KB mỗi lần đọc (workspace 12, planning 26, orchestration 36, research 91, manuscript 75 KB), `ceiling` 3,1 MB (51, 148, 438, 1.494, 1.027 KB). Phía đọc dùng client sinh từ hợp đồng (`sires_common.generated.*`, PID-00007) như Context Assembler sẽ dùng, deadline 2 s mỗi operation. Mức trễ giả định là trung vị trễ mỗi API: 0, 10, 25, 50, 100 ms; σ = 0 là trễ cố định, σ = 0,5 là log-normal (p95 của một API ≈ 2,3 × trung vị, p99 ≈ 3,2 ×). Ba cách đọc: `parallel` (5 operation cùng lúc), `two_wave` (research đợi `prerequisiteOutputs` của planning — phụ thuộc mà hợp đồng hiện có ngụ ý), `sequential` (để so sánh). Mỗi ô 200 lượt đo sau 10 lượt khởi động; percentile `statistics.quantiles(method="inclusive")`.

**Môi trường:** Linux 6.18.58.1-microsoft-standard-WSL2, container `ghcr.io/astral-sh/uv:0.13.7-python3.12-trixie-slim` (`--network host`), Python 3.12.16, AMD Ryzen 7 4800H (16 luồng), 9,5 GiB RAM cho WSL; httpx 0.28.1, httpcore 1.0.9, attrs 26.1.0; stub chạy uvicorn 0.54.0 với uvloop 0.23.0, httptools 0.9.0, FastAPI 0.162.4. Mã nguồn chép sang đĩa cục bộ của container (lý do ở cuối mục). Đo ngày 21/11/2026, 12:04–12:34 UTC. Máy dùng chung: cùng lúc có container của phiên khác chạy (load average 2–6 trên 16 luồng), nên p99 và max có nhiễu; một số ô `sequential` ở trễ 0 có p95 lệch (67,9 ms ở σ = 0 so với 24,7 ms ở σ = 0,5) vì nhiễu này. Dữ liệu thô: `data/read_latency_raw.csv` (12.000 lượt, thời gian từng operation); bảng đủ p50/p95/p99/max: `data/read_latency.md`.

**p95 (ms) theo mức trễ giả định — payload `typical`:**

| Trễ giả định/API (ms) | parallel σ=0 | parallel σ=0,5 | two_wave σ=0 | two_wave σ=0,5 | sequential σ=0 | sequential σ=0,5 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 20.8 | 20.7 | 23.7 | 27.5 | 67.9 | 24.7 |
| 10 | 30.5 | 46.7 | 43.9 | 67.4 | 82.0 | 110.1 |
| 25 | 41.5 | 98.1 | 75.4 | 150.4 | 154.0 | 242.3 |
| 50 | 67.2 | 188.3 | 124.3 | 263.4 | 284.0 | 462.5 |
| 100 | 116.9 | 368.3 | 229.0 | 510.8 | 530.4 | 897.4 |

**p95 (ms) — payload `ceiling`:**

| Trễ giả định/API (ms) | parallel σ=0 | parallel σ=0,5 | two_wave σ=0 | two_wave σ=0,5 | sequential σ=0 | sequential σ=0,5 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 66.9 | 66.6 | 64.4 | 64.2 | 196.4 | 149.7 |
| 10 | 79.7 | 70.7 | 88.1 | 90.7 | 254.3 | 185.5 |
| 25 | 90.4 | 105.1 | 117.2 | 206.4 | 268.5 | 281.9 |
| 50 | 115.7 | 189.9 | 165.7 | 330.7 | 334.7 | 506.5 |
| 100 | 162.2 | 364.5 | 266.9 | 559.8 | 681.6 | 919.9 |

**Trung vị (ms):**

| Trễ giả định/API (ms) | typical parallel σ=0 | typical parallel σ=0,5 | typical two_wave σ=0 | ceiling parallel σ=0 | ceiling parallel σ=0,5 | ceiling two_wave σ=0 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 13.7 | 14.5 | 15.2 | 41.3 | 39.8 | 39.6 |
| 10 | 23.7 | 27.8 | 35.9 | 52.6 | 45.1 | 61.6 |
| 25 | 38.0 | 55.3 | 67.5 | 65.3 | 65.9 | 91.1 |
| 50 | 63.8 | 102.7 | 116.7 | 90.6 | 107.1 | 141.6 |
| 100 | 113.5 | 189.8 | 218.6 | 138.5 | 194.2 | 240.8 |

**p95 (ms) từng operation ở `parallel`, trễ 0:** `typical` — workspace 12,2; planning 12,7; orchestration 13,0; research 17,9; manuscript 16,1. `ceiling` — 12,9; 16,5; 29,2; 64,2; 50,2 (bảng đủ ở `data/read_latency.md`).

**EC03 — một service trả lời sau 3 × timeout (timeout 500 ms mỗi operation, 5 lượt mỗi service, payload `typical`):**

| Service chậm | Có lớp bắt buộc (1–3)? | Kết quả 5/5 lượt | Có context thiếu lớp? | Lỗi nêu đúng service? | Thời gian tới lỗi (ms, trung vị) |
| --- | --- | --- | --- | --- | ---: |
| workspace | không | thất bại | không | có | 503,5 |
| planning | có | thất bại | không | có | 503,6 |
| orchestration | có | thất bại | không | có | 504,0 |
| research | không | thất bại | không | có | 504,4 |
| manuscript | không | thất bại | không | có | 505,1 |

Hành vi mong đợi (EC03) chạy đúng trên stub: operation hết giờ làm cả lần đọc thất bại sau ≈ timeout, các operation còn lại bị hủy (`asyncio.TaskGroup`), lỗi `ContextAssemblyFailed` nêu service và lớp, không trả context dở dang; Agent Run vì vậy thất bại rõ ràng thay vì chạy với context thiếu lớp. Spike áp cùng một cách cho service có lớp bắt buộc lẫn service chỉ có lớp cắt được, đúng chữ của EC03; có nên cho phép chạy tiếp khi thiếu lớp 4–6 hay không là việc của PO và PID-00072.

**Điều rút ra từ S02:**

1. **Trễ cố định:** `parallel` p95 ≈ trễ + 17 ms (`typical`) hoặc + 62–67 ms (`ceiling`); `two_wave` ≈ 2 × trễ + 24 ms (`typical`); `sequential` ≈ 5 × trễ. Đọc song song là cách mặc định đúng; mỗi đợt thêm một vòng trễ.
2. **Đuôi độ trễ quyết định p95:** với σ = 0,5, `parallel` p95 ≈ 3,7 × trung vị trễ (368 ms ở trễ 100 ms, cả hai payload), sát p99 của một API (3,2 ×) cộng chi phí đọc. p95 của cả lần lắp context bị chi phối bởi đuôi của service chậm nhất trong 5; ngân sách độ trễ của từng service nên đặt theo p99, không theo p95.
3. **Chi phí phía agent-core:** ở trễ 0 một lần đọc tốn 14 ms trung vị (240 KB) đến 41 ms trung vị, 67 ms p95 (3,1 MB): parse JSON và dựng model của client sinh trên một event loop, khoảng 20 ms mỗi MB. Đọc song song không làm phần này nhanh hơn (`ceiling`, trễ 0: `parallel` 66,9 ms so với `two_wave` 64,4 ms p95). Research (1,5 MB) là operation đắt nhất ở trần.
4. **Nhiễu môi trường đã loại:** lần chạy đầu từ worktree trên ổ `H:` mount vào container (9p) cho mỗi request async 35–80 ms kể cả khi trễ 0. Nguyên nhân: httpcore 1.0.9 thử `import sniffio` ở mỗi request async (gói không cài; anyio 4.16 không còn phụ thuộc), mỗi lần thử quét lại `sys.path` có thư mục trên ổ chậm — đo được 10 lần import thất bại mất 98 ms; một GET async 35,1 ms còn 2,8 ms khi bỏ các thư mục đó khỏi `sys.path`. Số đo trên là từ bản chép ở đĩa cục bộ. Trong image sản phẩm mã nằm trên đĩa cục bộ nên chi phí này nhỏ, nhưng PID-00072 nên kiểm lại hoặc cài `sniffio`.
5. Stub không có truy vấn database, ký và kiểm token nội bộ (ES256) hay mạng giữa pod: số đo là phần truyền tải và parse cộng trễ giả định, chưa phải độ trễ của service thật.

### 3.4 Mã thử không vào build sản phẩm (YC1)

Lệnh chạy trong container Linux trên worktree ngày 21/11/2026:

| Kiểm | Lệnh | Kết quả |
| --- | --- | --- |
| Wheel | `uv build --package sires-agent-core --wheel` | `sires_agent_core-0.0.0-py3-none-any.whl`, 30 file, chỉ `agent_core/…` và `sires_agent_core-0.0.0.dist-info`; 0 file chứa `spike` hay `spk` (hatch: `packages = ["src/agent_core"]`) |
| Image, trên `main` trước #51 | `docker build -f infra/docker/python/Dockerfile --build-arg PACKAGE=sires-agent-core --build-arg MODULE=agent_core.main .` rồi `ls /repo/apps/agent-core/spikes/spk-08` | **Có** 10 file của spike trong image: Dockerfile `COPY apps/agent-core apps/agent-core` và `infra/docker/python/Dockerfile.dockerignore` lúc đó chưa loại `spikes/`. Không vào đường chạy: `sys.path` chỉ có site-packages, `/repo/apps/agent-core/src`, `/repo/libs/py/sires_common/src`; `import agent_core.main` không nạp module nào của spike; chạy `context_size.py` trong image lỗi `ModuleNotFoundError: No module named 'jsonschema'` |
| Image, sau khi gộp `main` có [#51](https://github.com/toilatrung/sires/pull/51) | Cùng lệnh build; `ls /repo/apps/agent-core`, `ls …/spikes/spk-08` | `/repo/apps/agent-core` gồm `README.md`, `alembic.ini`, `deploy`, `migrations`, `project.json`, `pyproject.toml`, `src`, `tests` — **không có `spikes/`**; `ls …/spikes/spk-08`: `No such file or directory`; `import agent_core.main` không nạp module nào của spike |

Kết luận: mã spike không vào wheel, không vào image (từ #51, PO chốt 21/11/2026: `apps/*/spikes` trong `Dockerfile.dockerignore` của Python và Node) và không vào đường chạy của service. PR này không sửa `infra/`.

### 3.5 Kết luận từng giả định

- **ASM-04 — sơ bộ, kiểm lại ở PID-00072.** Kết luận là **sơ bộ** vì chưa có prompt thật (lớp 1 là ước lượng, registry và prompt template thuộc PID-00071), chưa có định dạng render của Context Assembler và chưa có tokenizer chính xác (tiếng Việt chỉ là giả định GĐ-T1). Trong các giới hạn đó: ở mức điển hình ASM-04 **đúng** với cả 10 model, kể cả theo cận trên; ở mức trần ASM-04 **đúng sau cắt gọn** với 7/9 agent trên các model 1M token (theo ước lượng), **không đúng** với Discovery và Reference Processing khi danh sách reference chống trùng là cả thư viện 5.000 reference (vượt sau cắt với Claude và họ `gpt-5` theo ước lượng, với mọi model theo cận trên), và **có rủi ro** với họ `gpt-5` (272.000 token đầu vào) khi lớp 3 có trên vài trăm Context Item. PID-00072 (Context Assembler) phải đo lại bằng prompt thật và count API của provider (Anthropic `messages/count_tokens`, Gemini `countTokens`, OpenAI usage `input_tokens`) trên cùng `profile.json`.
- **ADR-17 — lắp context qua 5 service: chấp nhận được khi đuôi độ trễ của từng service được giữ thấp (sơ bộ).** Đọc 5 API song song tốn trễ của service chậm nhất cộng 17 ms (context điển hình) đến khoảng 65 ms (context trần); khi trễ có đuôi (σ = 0,5), p95 lên khoảng 3,7 × trung vị trễ mỗi service. Phụ thuộc planning → research làm thêm một vòng trễ. Sơ bộ vì stub không có database, xác thực token nội bộ và mạng giữa pod; đo lại khi các API context-bundle có thật (staging). Chưa đặt ngưỡng: PO quyết sau khi xem số (ticket “Không gồm”).
- **TR-09 (rủi ro lắp context nhiều service):** biện pháp ghi ở kiến trúc 12 (bundle theo lô, gọi song song, timeout và lỗi rõ) chạy đúng trên stub: lỗi một service làm cả lần đọc thất bại, nêu đúng service, không có context thiếu lớp (EC03). Phần còn lại của rủi ro là đuôi độ trễ của từng service (mục 3.3).

### 3.6 Đề xuất cho Context Assembler (PID-00072)

Đề xuất kỹ thuật trong phạm vi PID-00072; mục nào đổi hành vi PRD hay hợp đồng ghi lại ở mục 6 cho PO.

1. Đọc context một đợt song song, deadline riêng mỗi operation, hủy cả nhóm khi một operation lỗi và trả lỗi nêu operation, lớp (như `Reader._group`); bước Failed để thử lại theo ORCH-FAILURE-001.
2. Tránh đợt thứ hai: hợp đồng chỉ chắc chắn có tham chiếu đầu ra Task tiên quyết trong response của planning (`prerequisiteOutputs`), nên research phải đợi planning. Nếu `AgentRunWorkOrder.inputRefs` luôn gồm các tham chiếu này thì đọc được một đợt, tiết kiệm một vòng trễ (ví dụ trễ cố định 50 ms: p95 67 ms thay vì 124 ms, `typical`).
3. Đặt và theo dõi ngân sách độ trễ của từng API context-bundle theo p99.
4. Giữ bundle nhỏ: xin đúng lớp và đúng tham chiếu cần, dùng `summary` có sẵn ở nguồn; parse ~20 ms/MB trên event loop, nên cân nhắc parse ngoài event loop khi bundle lớn.
5. Đếm token bằng count API hoặc tokenizer chính thức của provider, hiệu chỉnh lại tỉ lệ cho tiếng Việt, chạy lại `context_size.py` với lớp 1 thật; ghi số đếm vào context manifest.
6. Research nhận tối đa 200 tham chiếu mỗi lần (`ContextBundleRequest.refs`): chia lô song song (spike đã làm). Ở trần Synthesis cần 300 tham chiếu (150 claim, 50 artifact, 100 evidence) nên 2 lô.
7. Lớp 3, chống trùng của Discovery/Reference Processing, file đích của Writing và số đoạn evidence tối thiểu: chờ PO (mục 6), vì đổi hành vi của PRD 14.2, 3.3.
8. Đo thêm hai nguồn không thuộc 5 operation ở đây: truy xuất RAG qua knowledge (lớp 5) và tin chat gần đây của workspace (lớp 7).
9. Đo trên đĩa cục bộ (xem điểm 4 của 3.3); cân nhắc cài `sniffio` để httpcore không thử import ở mỗi request.

### 3.7 Chạy lại

```bash
uv sync --all-packages
uv run python apps/agent-core/spikes/spk-08/context_size.py --out agent/execution/PID-00022/data   # S01, ~5 s
pnpm nx run @sires/contracts:generate-python                                                     # client sinh (PID-00007)
uv run python apps/agent-core/spikes/spk-08/read_latency.py --out agent/execution/PID-00022/data   # S02, Linux/WSL2
pnpm nx run agent-core:test                                                                      # gồm smoke test spike
```

S01 tất định: chạy lại cho đúng các bảng trên. S02 phụ thuộc máy; tham số mặc định là tham số đã dùng (`--help`). Không cần `pnpm local:up` (spec mục 2.5): stub thay cho service và database, không gọi model.

## 4. Việc còn lại

Không có trong phạm vi. Các đề xuất ở mục 6 chờ PO.

## 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | Phiên điều phối (PO yêu cầu 21/11/2026: “Gọi thêm các phiên để chạy tiếp công việc PID của toilatrung”) | “Mã spike không được lọt vào gói/image sản phẩm của agent-core (kiểm `infra/docker/python/Dockerfile` và `.dockerignore` liên quan; chứng minh bằng lệnh).” | Trong phạm vi: kiểm O1 “không vào build sản phẩm” | Làm phần kiểm; không sửa `infra/` (luồng khác, quy tắc 1.4.1). Đã hỏi phiên điều phối; PO loại `apps/*/spikes` khỏi image ở #51 | Mục 3.4 (build image trước và sau #51) |
| YC2 | Phiên điều phối (như trên) | “Phép đo độ trễ: ghi môi trường, số lượt, trung vị, p95, dữ liệu thô.” | Trong phạm vi: chi tiết của AC02 | Làm | Mục 3.3, `data/read_latency_raw.csv` |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. **Lớp 3 không giới hạn** (PRD 14.2, `listContextItemsForAssembly`): lớp 3 không bao giờ bị cắt nhưng số Context Item Active không có trần và hợp đồng không phân trang. Với họ `gpt-5` (272.000 token đầu vào) Agent Run sẽ `context_too_long` từ khoảng 129–785 item; với model 1M token từ khoảng 640–3.300 item (3.2). PO chọn: đặt trần số item, lọc theo liên quan, hay cho lớp 3 dùng tóm tắt.
  2. **Chống trùng của Discovery và Reference Processing** (PRD 3.3, 8.2 “danh sách Trusted Reference (tránh trùng)”): cả thư viện 5.000 reference (NFR-SCALE-002) không vừa context sau cắt gọn. Đề xuất chống trùng tất định ở library, hoặc chỉ đưa reference đã chọn của project (500).
  3. **Thứ tự cắt PRD 14.2:** giữ file bản thảo đích của Writing Agent (không tóm tắt) và giữ tối thiểu một số đoạn evidence cho Synthesis, Writing, Verification trước khi tóm tắt lớp 4; hiện thứ tự bỏ evidence xuống 1 đoạn trước, và tóm tắt file lớn nhất (chính là file cần sửa) trước.
  4. **Hợp đồng:** làm rõ trong `internal/schemas.yaml` rằng `AgentRunWorkOrder.inputRefs` gồm cả đầu vào khai báo và đầu ra Task tiên quyết, để Context Assembler đọc một đợt (3.6 điểm 2). Nếu đồng ý, PO cập nhật bằng `contract-updating-skill`; không chặn PID này.
  5. **Ngưỡng độ trễ lắp context:** PO đặt sau khi xem 3.3 (ticket “Không gồm”).
  6. **Luồng infra:** `apps/*/spikes` đã được loại khỏi image ở #51 (3.4); `apps/*/tests/` vẫn vào image (như G3 của PID-00027), PO quyết có loại không.
  7. **Danh sách model trên giao diện:** `docs/ui-design/source/SettingsAgents.dc.html` dùng `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gemini-2.5-pro` đều đã deprecated ngày 21/11/2026; cập nhật khi PO thấy cần.
  8. **Hiệu chỉnh tokenizer trước PID-00072 (tùy chọn):** đo sai số tiếng Việt ngay cần PO cho phép tải `tiktoken` và file mã hóa của OpenAI, hoặc đặt API key Anthropic, Gemini trong biến môi trường để gọi count API (chỉ gửi văn bản tổng hợp). Spike không làm vì EC02 đã định cách xử lý.
  9. **Giả định của spike** (không phải ASM của PRD; PO nâng thành ASM nếu cần): GĐ-01 Research Context; GĐ-02 chỉ dẫn và tool của lớp 1; GĐ-03 độ dài định nghĩa Task, chỉ dẫn bước, phản hồi review; GĐ-04 số Context Item Active (50 điển hình, 350 trần); GĐ-05 độ dài tóm tắt có sẵn; GĐ-06 độ dài artifact, claim, file bản thảo; GĐ-07 Problem Brief, Context Snapshot, Deliberation Entry; GĐ-08 số lần truy xuất mỗi bước; GĐ-09 độ dài tin chat; GĐ-10 lớp áp dụng và số tool từng agent; GĐ-11 16.384 token dành cho đầu ra; GĐ-T1 tỉ lệ ký tự/token của tiếng Việt. Giá trị và nguồn ở `apps/agent-core/spikes/spk-08/profile.json`, `spk08_tokens.py`.
- **Yêu cầu hợp đồng:** không có (đề xuất 4 là cải tiến, không chặn slice nào).
- **Còn mở:** không có. Câu hỏi về image gửi phiên điều phối ngày 21/11/2026 đã được PO giải quyết bằng #51 (3.4).
- **Bước tiếp theo:** PO review PR và QC độc lập `spec-converge-skill PID-00022`; PID-00072 dùng lại `profile.json`, `context_size.py`, `read_latency.py` để đo với prompt thật.
- **Tài liệu đi kèm** (trong `agent/execution/PID-00022/`):
  - `data/context_size.md` — S01: bảng token từng lớp theo agent và profile, vừa/không vừa theo model, ca vượt, số Context Item tối đa.
  - `data/context_size.json` — S01: số đầy đủ (ký tự, byte, ước lượng theo provider, cận trên mỗi lớp; kết quả cắt gọn cho 10 model × 2 cách đếm).
  - `data/read_latency.md` — S02: môi trường, p50/p95/p99/max mỗi ô, p95 từng operation, EC03.
  - `data/read_latency.json` — S02: số đầy đủ mỗi ô và từng operation, kích thước payload, các lượt EC03.
  - `data/read_latency_raw.csv` — S02: dữ liệu thô, 12.000 lượt đo (tổng và từng operation, byte nhận).

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
