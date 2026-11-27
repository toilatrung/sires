# PID-00021 — Triển khai

- **Ticket:** [PID-00021](../../../docs/tickets/issues/PID-00021/index.html) · **Báo cáo:** [report.md](report.md)
- **Cập nhật:** 27/11/2026 (Lần 3)

File này mô tả mã **đang thật sự chạy**, đọc từ mã sau khi làm, để người sau hiểu nhanh và QC biết nên soi ở đâu. Không chép lại spec. Sửa mã thì sửa file này cho đúng.

## 1. Luồng đã triển khai

Mã thử ở `apps/agent-core/spikes/spk-01/`, ngoài `src/`, không có route hay bảng. Mỗi script là một phép đo, chạy tay bằng `run.ps1 <script>` (Python gốc của uv, `PYTHONPATH` trỏ gói của spike ở `%LOCALAPPDATA%\sires\spikes\spk-01`), ghi evidence vào `agent/execution/PID-00021/evidence/<script>/`.

Luồng một phép đo (S01, `capabilities.py`):

1. Điểm vào `main()` → `run_variant()` cho từng adapter: đọc kết nối của provider (`connection`: key và base URL lấy từ **cùng một nguồn**, biến môi trường kể cả biến cấp User trong registry, không có thì file key của máy Dev `SIRES_PROVIDER_KEYS_FILE`, mặc định `<checkout chính>/.sires/provider-keys.env`), dựng adapter bằng `make_adapter()` — `capabilities.py:230`, `common.py:147`, `:111`, `:117`, `adapters.py:1014`. Model lấy từ `SPK01_MODEL_*` (môi trường, rồi file), mặc định model giá thấp — `common.py:70`.
2. Mỗi phép thử dựng `ModelRequest` trung lập (message, tool, schema đầu ra, chế độ native hay output tool) rồi gọi `Adapter.generate()` hoặc `stream_text()`; adapter dịch sang tham số của SDK chính thức, gọi một lần (SDK tắt tự thử lại), dịch phản hồi về `ModelResult` (văn bản, tool call, structured, lý do dừng, usage) — `adapters.py:449–480` (Anthropic), `:614–644` (OpenAI Chat), `:755–798` (Responses), `:914–962` (Gemini).
3. Lỗi của SDK đi qua `map_exception()` thành `GatewayError(code ∈ 11 mã chuẩn PRD 8.6, retryable, retry_after, signal)`; phản hồi không đọc được thành `invalid_response` trong `Adapter._parsed()` — `adapters.py:214`, `:356`.
4. Structured output được kiểm bằng Pydantic (`validate_answer`), không tin cờ của provider; vòng tool + schema chạy qua `tool_loop()` (≤ 8 vòng, sửa định dạng ≤ 2 lần) — `common.py:261`, `loop.py:75`.
5. Mọi bản ghi qua `Evidence.record()` → `redact()` che giá trị key, chuỗi có dạng key, host của cổng trung gian, request id và tên nhóm tài khoản trong thông báo lỗi của cổng (`redact_ids`, QC G8) trước khi ghi file hay in — `common.py:270`, `:231`, `:225`.

S02:

- `base_url.py compare`: dựng proxy Starlette cục bộ trong một thread (`ProxyServer`), chạy cùng bốn phép thử (`probe`: structured, tool call, stream, liệt kê model) trên endpoint cấu hình của kết nối (`SIRES_BASE_URL_*`, tên cũ `SPK01_BASE_URL_*`) và proxy chuyển tiếp tới đúng endpoint đó; so kết quả đã chuẩn hóa (`comparable`) — `base_url.py:487`, `:402`, `:464`, `:469`. Key của kết nối chỉ gửi tới base URL của chính nó (SCOPE-13, kiến trúc 8.2; QC G9): endpoint chính thức chỉ được gọi với key chính thức (`official_key`: key của kết nối khi không đặt base URL, còn không thì `*_API_KEY_OFFICIAL`); thiếu thì cột đó ghi “bỏ qua” — `common.py:179`. Proxy chỉ ghi method, path, status, thời gian, số byte — `base_url.py:297`.
- `errors.py`: gọi thật (key sai, model không có, timeout client 10 ms, cổng đóng, DNS không phân giải, 50 lời gọi đồng thời 1 token ra) và gọi giả qua proxy với header `x-spk01-fault` (proxy trả thân lỗi theo định dạng tài liệu của provider, không gọi upstream) — `errors.py:157`, `:188`, `base_url.py:276`. Key của kết nối chỉ đi tới endpoint của kết nối (`timeout_client`); key sai, cổng đóng, DNS hỏng dùng key giả. `--no-burst` bỏ 50 lời gọi đồng thời (Lần 3, G10: không thử 429 trên key dùng chung).

S03, `frameworks.py`: cùng `LOOP_PROMPT`, hai tool, schema `ResearchAnswer` dạng output tool `final_result`, `tool_choice=required`, ba cách chạy vòng trên cùng adapter qua `Meter` (đếm lời gọi, cộng usage): vòng thường `tool_loop`, Pydantic AI (`Agent` + `FunctionModel` làm cầu nối sang adapter), LangGraph (`StateGraph` model → tools → model, `compile()` không checkpointer) — `frameworks.py:87`, `:111`, `:222`. Biến thể `fake` dùng `ScriptedAdapter` (kịch bản tìm → đọc hai reference → đáp án sai → đáp án đúng) để kiểm phần nối không cần mạng — `frameworks.py:350`.

## 2. Hàm, thuật toán, class ảnh hưởng cao

| Thành phần | Loại | Vị trí | Làm gì | Vì sao ảnh hưởng cao | Giữ bất biến gì | Test |
| --- | --- | --- | --- | --- | --- | --- |
| `map_exception`, `_map_google` | hàm | `adapters.py:214`, `:300` | Lỗi SDK → mã chuẩn, retryable, retry-after | Bảng AC04; PID-00070 dùng làm điểm xuất phát | Chỉ 11 mã PRD 8.6 hoặc `unmapped` (tín hiệu chưa có trong bảng 8.4) | `errors.py` › chạy tay; `evidence/errors/summary.md` |
| `AnthropicAdapter`, `OpenAIChatAdapter`, `OpenAIResponsesAdapter`, `GoogleAdapter` | class | `adapters.py:385`, `:527`, `:682`, `:825` | Dịch `ModelRequest` ↔ API của từng SDK; native structured output hoặc output tool; usage thô và chuẩn hóa | AC01, AC02, AC03 dựa trên đây | SDK `max_retries=0`; key chỉ trong client; `provider_parts` giữ nội dung gốc để gửi lại (Gemini thought signature, block của Anthropic) | `capabilities.py`, `base_url.py` › chạy tay |
| `Adapter._parsed` | hàm | `adapters.py:356` | Phản hồi đọc không được → `invalid_response` | Không để exception lạ lọt ra ngoài gateway | Mọi lỗi sau lời gọi HTTP thành một mã chuẩn | `errors.py` › `malformed` |
| `tool_loop` | thuật toán | `loop.py:75` | Vòng tool calling + structured output có sửa định dạng | Mốc so sánh cho S03; tình huống `tool_loop_structured` của S01 | ≤ 8 vòng (8.1), ≤ 2 lượt sửa rồi `invalid_response` (8.5), usage cộng mọi lời gọi | `capabilities.py` › `tool_loop_structured`; `frameworks.py --variants fake` |
| `output_schema` | hàm | `common.py:247` | Ba biến thể JSON Schema của cùng model Pydantic | AC01 “cùng một schema” | `additionalProperties: false`, mọi trường required | `capabilities.py` › `structured_*` |
| `connection`, `official_key` | hàm | `common.py:147`, `:179` | Key và base URL của một provider từ một nguồn (môi trường, rồi file key); key cho endpoint chính thức | SCOPE-13, QC G9: key nào đi tới đâu | Key không bao giờ ghép với base URL của nguồn khác; key cổng không gửi tới endpoint chính thức | thử với key giả và `probe` giả (`self-qc.md` Lần 3) |
| `redact`, `redact_ids`, `Evidence` | hàm, class | `common.py:231`, `:225`, `:260` | Che key, chuỗi dạng key, host cổng, request id, tên nhóm trước mọi lần ghi, in | EC04, NFR-OBS-002, QC G8 | Không có giá trị key, host cổng, request id trong file hay stdout; che lại lần nữa không đổi kết quả | `scan_secrets.py` › chạy tay |
| `Proxy` | class | `base_url.py:297` | Chuyển tiếp nguyên request tới upstream; trả lỗi giả theo header | AC03, AC04 phần giả lỗi | Không ghi header, query, thân; header `x-spk01-fault` không chuyển đi | `base_url.py compare`, `errors.py` |
| `run_pydantic_ai`, `build_langgraph` | hàm | `frameworks.py:111`, `:222` | Nối framework với adapter của gateway | AC05 | Không checkpointer, không lưu trạng thái ngoài một lần chạy | `frameworks.py` › chạy tay; biến thể `fake` |

### Thuật toán: vòng tool calling có sửa định dạng (`tool_loop`)

- **Vào, ra:** `ModelRequest` có tool và (tùy chọn) schema đầu ra, native hay output tool → `LoopResult` (ok, answer đã kiểm, số vòng, tool call, số lần sửa, usage cộng dồn, lỗi chuẩn).
- **Các bước:** gọi model; từ chối → `content_refused`; lượt là “lần trả lời cuối” khi có structured, có lời gọi output tool, hoặc không còn tool call → kiểm Pydantic: đạt thì dừng, sai thì gửi lại lỗi ngắn (tool result cho output tool, hoặc message user) tối đa 2 lần rồi `invalid_response`; có tool call thường → chạy tool, thêm tool result, vòng tiếp; quá 8 vòng → `max_rounds`.
- **Độ phức tạp, chi phí:** mỗi vòng một lời gọi model; context tăng theo lịch sử, đo được 3–5 lời gọi cho `LOOP_PROMPT`.
- **Trường hợp biên đã xử lý:** model gọi cả tool thường lẫn output tool trong một lượt (nhận đáp án nếu hợp lệ); output tool có tham số không phải JSON; model trả văn bản khi phải trả JSON; usage thiếu ở một lời gọi (`no_data_calls`).

## 3. Quyết định kỹ thuật trong phạm vi

- Một file một phép đo, theo tên ở acceptance (`capabilities.py`, `base_url.py`, `errors.py`); phần dùng chung tách ra `adapters.py`, `loop.py`, `common.py`; S03 ở `frameworks.py` (spec không đặt tên) — để PID-00070 đọc riêng phần adapter.
- OpenAI đo trên cả Chat Completions và Responses — Chat Completions là thứ proxy, cổng và model tự host hay hỗ trợ; Responses là API OpenAI đang khuyến nghị.
- Đầu ra có cấu trúc đo hai cách (native và output tool) với ba biến thể schema — kiến trúc 8.2 nêu output tool là đường dự phòng của Anthropic; cần biết đường nào chung được cho cả ba.
- Gói của spike cài vào thư mục ngoài repo bằng `uv pip install --target` và chạy bằng Python gốc của uv — không đụng `pyproject.toml`, `uv.lock` của workspace; Smart App Control không chặn Python gốc.
- Proxy dùng Starlette + uvicorn + httpx trong thread riêng — chuyển tiếp được SSE mà không thêm công cụ ngoài.
- Che host của cổng trung gian trong evidence — repo public; lựa chọn nhà cung cấp cổng của PO không phải kết quả đo. Che thêm request id và tên nhóm tài khoản trong thông báo lỗi của cổng (QC G8).
- Key và base URL đọc từ file key của máy Dev khi môi trường chưa có (Lần 3, D-KEY): mọi worktree dùng chung một file ngoài Git; `scan_secrets.py` quét cả key chính thức và host cổng.
- Evidence Lần 3 ghi vào `evidence/lan-3/<script>/` (đặt `SPK01_EVIDENCE`), giữ nguyên evidence Lần 1 làm lịch sử; `frameworks.py` mặc định ghi `evidence/frameworks` như các script khác (QC G6).
- Ước tính chi phí bằng `genai-prices` (đi kèm `pydantic-ai-slim`), luôn ghi là ước tính (NFR-USAGE-003); model không có giá thì ghi “không có giá”.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
