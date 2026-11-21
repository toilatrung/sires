# PID-00021 — Báo cáo thực thi

**Trạng thái:** Bị chặn — EC01: chưa có key chính thức Anthropic, Google; key cổng trung gian không có kênh Claude, cổng không giữ structured output của Gemini

- **Ticket:** [PID-00021](../../../docs/tickets/issues/PID-00021/index.html) · **Luồng:** `agent-core` · **Giai đoạn:** PH-01
- **Nhánh:** `agent-core/spk-01-providers` (đã commit, đã merge `origin/main` tại `1fe6d66`) · **PR:** [#55](https://github.com/toilatrung/sires/pull/55) → `main`
- **Cập nhật:** 21/11/2026
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

Lần chạy sau cập nhật trạng thái ở trên và thêm mục `Lần N — dd/mm/yyyy` ở cuối file, không ghi đè.

## 1. Tóm tắt

- Slice: 1/3 xong. Bị chặn: S01 cho Claude và Gemini (EC01), S02 phần so với endpoint chính thức (AC03) — cùng lý do: key PO cấp là key của một cổng trung gian, không phải key chính thức của ba hãng.
- AC: 2/5 đạt (AC04, AC05); AC01, AC02, AC03 đạt một phần (OpenAI đo thật qua cổng; Claude, Gemini, endpoint chính thức chưa đo được). Edge case: 3/4 đã giải quyết (EC02, EC03, EC04); EC01 đang áp dụng.
- Kết luận: ASM-02 đạt với OpenAI, chưa kết luận cho Claude, Gemini; ASM-10 đạt phần token, phần chi phí không có trong phản hồi; ASM-03 đạt phần cơ chế base URL, “tương thích API chính thức” của một cổng không đủ bảo đảm năng lực. Đề xuất framework: **Pydantic AI**. Chi phí đã tiêu: ước tính dưới 0,01 USD.
- Yêu cầu thêm: 2 (YC1 quy tắc cài môi trường; YC2 loại spike khỏi image, nay đã có trên `main` qua #51).

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Năng lực ba provider | Chặn — OpenAI xong; Claude: cổng không có kênh Claude (HTTP 503); Gemini: cổng bỏ structured output, hết giờ chập chờn; chờ key chính thức (EC01) | tạo: `apps/agent-core/spikes/spk-01/` (`adapters.py`, `loop.py`, `common.py`, `capabilities.py`, `run.ps1`, `README.md`, `requirements.in`, `requirements.txt`); sửa: `apps/agent-core/pyproject.toml` (sdist loại `spikes`); evidence `capabilities/` |
| S02 | Base URL và ánh xạ lỗi | Chặn một phần — bảng ánh xạ lỗi (AC04) xong; base URL qua cổng và proxy cục bộ xong; chưa so với endpoint chính thức (AC03) vì không có key chính thức | tạo: `base_url.py`, `errors.py`; evidence `base_url/`, `errors/` |
| S03 | Đề xuất framework và báo cáo | Xong — đề xuất Pydantic AI, chi phí đã tiêu; kết luận ASM đủ cho phần đo được (phần chặn ghi rõ) | tạo: `frameworks.py`, `scan_secrets.py`; `report.md`, `implement.md`, `self-qc.md`; evidence `frameworks/` |

## 3. Kết quả

### Môi trường, key và cách chạy lại

- Windows 11, PowerShell; Python 3.12.16 gốc của uv; gói của spike (PO duyệt tải 21/11/2026): anthropic 2.12.0, openai 3.57.0, google-genai 2.34.0, pydantic-ai-slim 2.71.0, langgraph 1.2.24, genai-prices 0.2.5 (đủ danh sách và hash trong `requirements.txt`; cài 80 MB vào `%LOCALAPPDATA%\sires\spikes\spk-01`, ngoài repo). Mọi script chạy trên Windows; không cần WSL (YC1).
- Key PO đặt ở biến cấp User `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`: cả ba là **cùng một key của một cổng trung gian** (PO xác nhận trong phiên), cùng base URL của cổng ở `SPK01_BASE_URL_ANTHROPIC`, `_OPENAI`, `_GOOGLE`. Endpoint chính thức của cả ba từ chối key này (Anthropic 401, OpenAI 401 `invalid_api_key`, Gemini 400 `API_KEY_INVALID`). Host của cổng được che thành `[gateway-host]` trong mọi evidence: repo public, lựa chọn nhà cung cấp cổng không phải kết quả đo.
- Model giá thấp: `gpt-4.1-nano` (OpenAI), `gemini-2.5-flash-lite` (Gemini), `claude-haiku-4-5` (Claude, bị chặn). Danh sách model của cổng: 173 model, không có model Claude nào.

Chạy lại (từ gốc repo, PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\development\setup-windows.ps1 -Spikes -SkipDeps
```

```powershell
powershell -ExecutionPolicy Bypass -File apps\agent-core\spikes\spk-01\run.ps1 capabilities.py --fail-fast
```

Thay `capabilities.py --fail-fast` bằng `base_url.py compare`, `errors.py`, `frameworks.py --variants fake openai anthropic google`, `capabilities.py --list-models`; đổi model bằng `SPK01_MODEL_<PROVIDER>`, endpoint bằng `SPK01_BASE_URL_<PROVIDER>` (không đặt thì dùng endpoint chính thức). Các lần chạy trong báo cáo này: lượt (b) đặt `SPK01_MODEL_ANTHROPIC=claude-haiku-4-5`; lượt (c), `base_url.py`, `errors.py`, `frameworks.py` đặt `SPK01_MODEL_ANTHROPIC=gpt-4.1-nano` (API dạng Anthropic của cổng, model không phải Claude); lượt (e) đặt `SPK01_MODEL_OPENAI=gemini-2.5-flash-lite`. Chi tiết từng lời gọi ở `evidence/<script>/results.jsonl`, bảng ở `summary.md`.

### S01 — năng lực theo provider (AC01, AC02)

Cùng schema `ResearchAnswer` (model Pydantic, lồng `Finding`, enum, số thực, trường nullable) ở ba biến thể: `raw` (Pydantic sinh, có `$defs`/`$ref`, `anyOf` null), `inline` (bỏ `$ref`, `title`), `inline_typelist` (`type: [T, "null"]`). Tool `search_library`, `get_reference` trên thư viện giả (R1–R3). Một lần chạy mỗi phép thử.

| Lượt | Adapter (API) | Model | Tool calling | Nhiều tool một lượt | Structured native raw / inline / typelist | Structured qua output tool | Tool + schema (vòng, ≤ 8) | Streaming | Usage không stream / trong stream |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| a | openai (Chat Completions) | gpt-4.1-nano | đạt | đạt (2 lời gọi) | đạt / đạt / đạt | đạt | đạt (3 vòng, 4 tool call, 0 lần sửa) | đạt (27 mảnh) | có / có |
| a | openai-responses (Responses) | gpt-4.1-nano | đạt | đạt (2) | đạt / đạt / đạt | đạt | đạt (3 vòng) | đạt (24 mảnh, TTFT 0,68 s) | có / có |
| b | anthropic (Messages) | claude-haiku-4-5 | **Bị chặn** — HTTP 503 “No available channel for model … under group cheap” | | | | | | |
| c | anthropic (Messages, API của cổng) | gpt-4.1-nano (không phải Claude) | đạt | đạt (2) | không / không / không — cổng bỏ `output_config`, trả văn bản | đạt | không — `invalid_response` sau 2 lần sửa | đạt (47 mảnh) | có / có |
| d | google (`generateContent` gốc) | gemini-2.5-flash-lite | đạt | đạt (2) | không / hết giờ 60 s / không — cổng bỏ `response_json_schema`, trả văn bản | đạt | không — hết giờ ở vòng 3 | đạt (3 mảnh, TTFT 55 s) | có / có |
| e | openai (Chat, API của cổng) | gemini-2.5-flash-lite | không — HTTP 400: cổng từ chối `strict` trong khai báo tool | không | không / không / không | không (400) | không (400) | đạt | có / có |

Đọc kết quả:

- **OpenAI đạt đủ** trên cả Chat Completions và Responses: tool calling, nhiều tool một lượt, structured output strict với cả ba biến thể schema (kể cả `$ref`, `anyOf` null, mảng kiểu), output tool, vòng tool + schema, streaming, usage. Đo qua cổng: cổng chuyển nguyên tham số tới OpenAI.
- **Claude chưa đo được** (EC01): key không có kênh Claude. Đường mã của adapter Anthropic (SDK `anthropic` 2.12, Messages API, `output_config.format = json_schema`, `tool_choice`, stream event) đã chạy thật qua API dạng Anthropic của cổng ở lượt (c), nhưng đó là model OpenAI sau lớp dịch của cổng, không nói gì về năng lực Claude.
- **Gemini chưa đo được trên API chính thức** (EC01): qua cổng, tool calling và output tool chạy được trên API gốc, nhưng cổng bỏ cấu hình structured output và có lời gọi hết 60 s. Đây là hành vi của cổng, không phải của Gemini.
- **EC02, năng lực không có**: khi đường native structured output không dùng được (ở đây do cổng), **output tool** (ép gọi một tool có `input_schema` là schema đầu ra) chạy được ở cả bốn adapter đo được. Đề xuất cho adapter: native là mặc định khi kiểm tra kết nối xác nhận được; output tool là đường dự phòng cho mọi provider, không chỉ Anthropic như kiến trúc 8.2 đang ghi.

Usage đọc được (AC02):

| Adapter | Trường usage thô (không stream) | Trong stream | Chi phí trong phản hồi |
| --- | --- | --- | --- |
| openai Chat | `prompt_tokens`, `completion_tokens`, `total_tokens`, `prompt_tokens_details.cached_tokens`, `completion_tokens_details.reasoning_tokens` | chunk cuối có `usage` (có `stream_options.include_usage`; cổng trả cả khi không đặt cờ) | không |
| openai Responses | `input_tokens`, `output_tokens`, `total_tokens`, `input_tokens_details.cached_tokens`, `output_tokens_details.reasoning_tokens` | sự kiện `response.completed` | không |
| anthropic Messages (qua cổng) | `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` (+ trường riêng của cổng) | `message_start.usage` (vào), `message_delta.usage` (ra) | không |
| google `generateContent` (qua cổng) | `prompt_token_count`, `candidates_token_count`, `total_token_count` (+ `thoughts_token_count`, `cached_content_token_count` khi có) | mọi chunk có `usage_metadata`, lấy chunk cuối | không |

### S02 — base URL (AC03)

`base_url.py compare` chạy cùng bốn phép thử (structured, tool call, stream, liệt kê model) trên ba đường: endpoint chính thức, cổng trung gian, và proxy cục bộ (`http://127.0.0.1:<port>/<provider>`) chuyển tiếp tới cổng.

| Adapter | Endpoint chính thức | Cổng trung gian | Proxy cục bộ → cổng | Cổng ↔ proxy | Đường dẫn proxy nhận |
| --- | --- | --- | --- | --- | --- |
| anthropic (model gpt-4.1-nano) | `auth_failed` cả 4 (key của cổng) | tool, stream, models đạt; structured không (cổng bỏ) | giống cổng | tương đương 4/4 | `POST /v1/messages`, `GET /v1/models` |
| openai Chat | `auth_failed` cả 4 | đạt 4/4 | đạt 4/4 | tương đương 4/4 | `POST /v1/chat/completions`, `GET /v1/models` |
| openai Responses | `auth_failed` cả 4 | đạt 4/4 | đạt 4/4 | tương đương 4/4 | `POST /v1/responses`, `GET /v1/models` |
| google | `auth_failed` cả 4 | tool, stream đạt; structured hết giờ; models trả 0 | tool, stream đạt; structured không (văn bản); models 0 | tương đương 3/4 (structured khác do cổng chập chờn) | `POST /v1beta/models/…:generateContent`, `…:streamGenerateContent` |

- Ba SDK nhận `base_url` có tiền tố đường dẫn và tự ghép đúng đường dẫn chuẩn (Anthropic không có `/v1` trong base URL, OpenAI có `/v1`, Gemini thêm `/v1beta`) — khớp giá trị điền sẵn của PRD AGENT-PROVIDER-002.
- Proxy chỉ chuyển tiếp nên kết quả qua proxy tương đương đích của nó ở 15/16 phép thử; lệch duy nhất do cổng trả chậm.
- Chưa so được với endpoint chính thức: key không phải key chính thức.
- Proxy dùng `http://127.0.0.1` chỉ để quan sát SDK. Sản phẩm phải chỉ nhận `https://` và chặn loopback, dải private (kiến trúc 8.2, 10.5).

### S02 — ánh xạ lỗi sang mã chuẩn PRD 8.6 (AC04)

Bảng đủ ở `evidence/errors/summary.md` (75 dòng). Nguồn: **thật** trên endpoint chính thức (không cần key hợp lệ), **thật** trên cổng, và **giả** qua proxy với thân lỗi theo định dạng tài liệu của từng provider (proxy trả lời ngay, không gọi upstream; nội dung thông báo là mẫu).

| Tình huống | Nguồn | Anthropic (Messages) | OpenAI (Chat, Responses) | Gemini (`generateContent`) | Mã chuẩn | Thử lại |
| --- | --- | --- | --- | --- | --- | --- |
| Key sai | thật, chính thức | 401 `authentication_error` | 401 `invalid_api_key` | **400** `INVALID_ARGUMENT`, reason `API_KEY_INVALID` | `auth_failed` | không |
| Key sai | thật, cổng | 401 | 401 | 401 | `auth_failed` | không |
| Hết giờ phía client (10 ms) | thật | `APITimeoutError` | `APITimeoutError` | `httpx.ConnectTimeout` (SDK không bọc) | `timeout` | có |
| Cổng đóng, DNS hỏng | thật | `APIConnectionError` | `APIConnectionError` | `httpx.ConnectError` (SDK không bọc) | `network_error` | có |
| Model không có | thật, cổng | 503 `proxy_api_error` | 503, thân `code: model_not_found` | 503 | mong đợi `model_not_found`, ánh xạ ra **`provider_unavailable`** (lệch) | có (sai) |
| Vượt giới hạn tốc độ | thật, cổng: 50 lời gọi đồng thời, 1 token ra | không có 429 (50/50 đạt) | không có 429 (50/50) | không có 429 (47 đạt, 3 hết giờ) | không gây được (EC03) | — |
| Vượt giới hạn tốc độ | giả, theo tài liệu | 429 `rate_limit_error`, `retry-after` | 429 `rate_limit_exceeded`, `retry-after` | 429 `RESOURCE_EXHAUSTED`, `RetryInfo.retryDelay`, quotaId theo phút | `rate_limited`, retry-after 7 s đọc được | có |
| Hết hạn mức thanh toán | giả | 402 `billing_error` | 429 `insufficient_quota` | 429 `RESOURCE_EXHAUSTED`, quotaId theo ngày | `quota_exceeded` | không |
| Quá tải, lỗi máy chủ | giả | 529 `overloaded_error`, 500 `api_error` | 503, 500 `server_error` | 503 `UNAVAILABLE`, 500 `INTERNAL` | `provider_unavailable` | có |
| Hết giờ phía provider | giả | 504 `timeout_error` | 504 | 504 `DEADLINE_EXCEEDED` | `timeout` | có |
| Vượt context | giả | 400 “prompt is too long” | 400 `context_length_exceeded` | 400 “input token count … exceeds” | `context_too_long` | không |
| Không có quyền | giả | 403 `permission_error` | 403 `request_forbidden` | 403 `PERMISSION_DENIED` | `permission_denied` | không |
| Trả lời chậm hơn timeout 2 s | giả | `APITimeoutError` | `APITimeoutError` | `httpx.ReadTimeout` | `timeout` | có |
| Từ chối nội dung | giả, 200 | `stop_reason: refusal` | `message.refusal`, `content` loại `refusal` (Responses) | `finishReason: SAFETY` | `content_refused` | không |
| Phản hồi thiếu usage | giả, 200 | — | — | — | usage `no_data` (không ước tính) | — |
| Đầu ra sai schema | giả, 200 | — | — | — | `invalid_response` sau 2 lần sửa (3 lời gọi) | sửa ≤ 2 |
| Thân không phải JSON | giả, 200 HTML | đọc lỗi | đọc lỗi | `JSONDecodeError` | `invalid_response` | không |
| HTTP 400 khác (cổng từ chối `strict`) | thật, cổng | — | 400 `invalid_request_error` | — | **không có mã** (ghi `unmapped`) | — |

Khớp mã mong đợi: 17/19, 17/19, 17/18, 17/19 (anthropic, openai, openai-responses, google); chỗ lệch là “model không có” qua cổng (503) và burst không gây được 429.

### S03 — framework trong Agent Run (AC05)

Cùng vòng (`LOOP_PROMPT`: tìm trong thư viện, đọc từng reference, trả `ResearchAnswer` qua output tool `final_result`), cùng adapter của gateway, `tool_choice=required`, ≤ 8 vòng, sửa ≤ 2 lần, không checkpointer. Một lần chạy mỗi ô.

| Adapter, model | Vòng thường (`loop.tool_loop`) | Pydantic AI 2.71 | LangGraph 1.2.24 |
| --- | --- | --- | --- |
| fake (kịch bản có một đáp án sai) | đạt, 4 lời gọi, 1 lần sửa | đạt, 4 lời gọi, framework tự sửa | đạt, 4 lời gọi, sửa viết trong graph |
| openai, gpt-4.1-nano | đạt, 3 lời gọi, 1506/187 token, 5,3 s | đạt, 3 lời gọi, 1440/191, 5,7 s | đạt, 3 lời gọi, 1506/189, 4,8 s |
| anthropic API của cổng, gpt-4.1-nano | đạt, 3, 1506/193, 7,3 s | đạt, 3, 1440/191, 6,4 s | đạt, 3, 1296/174, 7,1 s |
| google gốc qua cổng, gemini-2.5-flash-lite | đạt, 3, 2068/219, 58,8 s | đạt, 3, 1862/180, 89,1 s | đạt, 3, 1989/179, 116,6 s |

| Tiêu chí | Pydantic AI | LangGraph |
| --- | --- | --- |
| Phụ thuộc (gói gốc, không extras) | 17 gói, 24,6 MB | 38 gói, 26,5 MB (kéo `langchain-core`, `langsmith`) |
| Thời gian import | 3,7 s | 4,0 s |
| Mã nối với gateway | 93 dòng (chuyển message hai chiều, khai báo tool từ hàm) | 73 dòng (graph, node, cạnh) nhưng phải tự viết kiểm schema, sửa định dạng, output tool |
| Kiểm schema và sửa định dạng | có sẵn (`output_type`, `retries`) | tự viết |
| Giới hạn vòng | `UsageLimits(request_limit=8)` | `recursion_limit` đếm theo bước graph (2 × 8 + 2), không đếm lời gọi model |
| Đếm usage | `RunUsage` của framework khớp số đếm của gateway (requests, token, tool call) | không có |
| Không checkpointer, không giữ trạng thái | mặc định không lưu gì giữa hai lần chạy | `compile()` không truyền checkpointer, `app.checkpointer is None` |
| Trên máy Dev Windows (SAC) | chạy | `_xxhash.pyd` bị chặn ở lần nạp đầu sau khi cài, lần sau chạy |

**Đề xuất: Pydantic AI**, dùng trong ranh giới một Agent Run qua một lớp `Model` riêng nối vào Model Gateway (ADR-08), không dùng model provider có sẵn của Pydantic AI. Lý do:

1. Cả hai chạy cùng vòng với cùng số lời gọi và token trên bốn adapter, nên không có khác biệt năng lực.
2. Pydantic AI có sẵn đúng các quy tắc của kiến trúc 8.1 và 8.5 (kiểm đầu ra bằng Pydantic, sửa định dạng có giới hạn, giới hạn số lời gọi) và đếm usage đối chiếu được.
3. Thế mạnh riêng của LangGraph (checkpointer, lưu trạng thái, ngắt chờ người) là đúng phần ADR-08 không cho dùng trong agent-core.
4. Ít phụ thuộc hơn, không kéo `langchain-core` (ADR-08 đã loại LangChain toàn phần).

Lưu ý khi dùng:
- Pydantic AI đổi API nhanh (bản 2.71) và in banner quảng cáo Logfire trừ khi đặt `PYDANTIC_AI_NO_BANNER=1`.
- `FunctionModel` dùng trong spike là công cụ test; PID-00070, PID-00071 nên viết lớp `Model` riêng.
- Vòng thường (`loop.tool_loop`, 58 dòng, không phụ thuộc) cũng đạt mọi ô. PO có thể chọn không dùng framework: ADR-08 cho phép dùng framework chứ không bắt buộc.

### Chi phí đã tiêu

| Model | Lời gọi có usage | Token vào / ra | Ước tính theo giá niêm yết (genai-prices 0.2.5) |
| --- | --- | --- | --- |
| gpt-4.1-nano | 154 | 21 630 / 3 458 | 0,0035 USD |
| gemini-2.5-flash-lite | 72 | 9 113 / 1 397 | 0,0015 USD |
| Tổng | 226 | | **0,005 USD** |

Chưa cộng: các probe của `base_url.py` (32 lời gọi ngắn), lượt (a) đầu bị lỗi mã spike (11 lời gọi, ~0,0014 USD), các lời gọi bị từ chối (key sai, không có kênh: không tính tiền). Số thật là số cổng trung gian tính trên tài khoản của PO, theo giá của cổng; tổng ước tính dưới 0,01 USD.

### Kết luận theo giả định

| Giả định | Kết luận | Căn cứ |
| --- | --- | --- |
| ASM-02 (tool calling và structured output đủ cho Orchestrator, Specialist Agent; khác biệt chuẩn hóa được qua adapter) | **Đạt với OpenAI** (Chat và Responses: mọi phép thử, cả ba biến thể schema). **Chưa kết luận cho Claude và Gemini** (EC01). Adapter chuẩn hóa được ba định dạng API về một `ModelResult` (đã chạy thật cả ba qua cổng); output tool là đường dự phòng chung | S01 lượt a–e; `evidence/capabilities/` |
| ASM-10 (usage token, chi phí đọc được từ phản hồi) | **Token: đạt** với OpenAI. Định dạng usage của Messages và `generateContent` đọc được qua cổng; chưa xác nhận trên endpoint chính thức. **Chi phí: không** provider nào trả trong phản hồi; phải tính từ bảng giá theo model và luôn ghi là ước tính (NFR-USAGE-003). Thiếu usage thì ghi `no_data` (đã kiểm) | S01 bảng usage; errors `no_usage` |
| ASM-03 (base URL tùy chỉnh trỏ tới endpoint tương thích API chính thức) | **Cơ chế đạt**: ba SDK nhận base URL có tiền tố đường dẫn, gọi qua proxy cho kết quả tương đương đích của nó. **Chưa so với endpoint chính thức** (không có key chính thức). Cổng “tương thích” không bảo đảm năng lực: liệt kê 173 model nhưng không có Claude, bỏ structured output với API dạng Anthropic và Gemini, từ chối `strict`, đổi ngữ nghĩa lỗi (503 cho model không có). Kiểm tra kết nối chỉ bằng liệt kê model là chưa đủ | S02; `evidence/base_url/`, `evidence/errors/` |

## 4. Việc còn lại

- S01 cho Claude và Gemini, AC03 phần endpoint chính thức: cần PO cấp key chính thức của Anthropic và Google AI Studio (và OpenAI nếu muốn so cổng với endpoint chính thức), hoặc nhóm key của cổng có kênh Claude. Có key thì chạy lại theo mục 3 thành **Lần 2**: không cần sửa mã.
- 429 thật chưa gây được (EC03): mã lỗi dựa trên tài liệu. Muốn kiểm thật cần key của tài khoản bậc thấp; không nên thử trên key dùng chung.

## 5. Yêu cầu thêm

| # | Người yêu cầu | Nguyên văn | Phân loại | Quyết định | Đã làm, kiểm bằng |
| --- | --- | --- | --- | --- | --- |
| YC1 | PO (trong phiên, 21/11/2026, khi trả lời câu hỏi tải gói) | “Cho phép tải cả năm gói, thêm rule yêu cầu các môi trường cần wsl thì mới cần cài trên wsl, các môi trường có thể cìa trực tiếp trên ps hãy cài trên ps, khi có gói cài môi trường mới phải cập nhật vào script cài đặt môi trường tự động” | Đổi phạm vi: ngoài P1–P6, chạm luồng `infra` (`scripts/development/`) và `AGENT.md` | Làm (PO yêu cầu trong chat, nguyên văn bên trái) | Đã làm: quy tắc ở `AGENT.md` (Quy tắc bắt buộc), `scripts/development/README.md` (mục Quy tắc cài môi trường), đầu `setup-windows.ps1`, `setup-wsl.sh`; `setup-windows.ps1 -Spikes` cài `apps/*/spikes/*/requirements.txt` vào `%LOCALAPPDATA%\sires\spikes\<spike>`. Kiểm: chạy `setup-windows.ps1 -Spikes -SkipDeps -Yes` (đạt, cài spk-01). Spike không cần WSL nên `setup-wsl.sh` chỉ thêm dòng quy tắc |
| YC2 | PO (trong phiên, 21/11/2026, chọn phương án khi Dev hỏi) | Câu hỏi: image agent-core chép cả `apps/agent-core/spikes/`; muốn loại phải thêm `apps/*/spikes` vào `infra/docker/python/Dockerfile.dockerignore` (luồng infra). PO chọn: “Sửa trong PR này (Recommended)” | Trong phạm vi O1 (“không vào build sản phẩm”) nhưng chạm luồng `infra` | Làm (PO đồng ý: “Sửa trong PR này”) | Đã làm ở commit `f1ee3aa`; trong lúc làm, PO merge #51 (luồng infra) thêm đúng dòng `apps/*/spikes` vào file này trên `main`, nên khi merge `origin/main` lấy bản của `main` và PR không còn đổi file này. Kiểm: dựng thử với cùng `COPY apps/agent-core` và cùng dockerignore — trước: 14 file spike trong image, sau (bản của `main`): 0 (self-qc mục 1) |

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:**
  1. Kiến trúc 12.2 (bảng spike): SPK-01 “Đã chạy một phần 21/11/2026”; framework đề xuất Pydantic AI (mục 3, S03); kết luận ASM-02, ASM-03, ASM-10 như bảng mục 3 — PO ghi sau khi duyệt (ticket mục “Phải sửa ở nguồn”).
  2. Kiến trúc 8.2: output tool là đường dự phòng của **mọi** adapter (không chỉ Anthropic); ghi API đã chốt: Anthropic `messages.create` + `output_config.format` (`json_schema`), OpenAI Chat Completions (proxy, model tự host hỗ trợ rộng nhất) với Responses là tùy chọn, Gemini `generateContent` + `response_json_schema`. Tin nhắn chuẩn hóa cần một chỗ giữ nội dung gốc của provider để gửi lại nguyên văn (Gemini thought signature, block của Anthropic) — đã làm ở `Msg.provider_parts`.
  3. Kiến trúc 8.3, PRD AGENT-PROVIDER-002 (“Kiểm tra kết nối”): với base URL tùy chỉnh, liệt kê model là chưa đủ — thêm một lời gọi thử tool calling và structured output nhỏ rồi mới gán capability; model không qua lời gọi thử thì “chưa xác định”.
  4. Kiến trúc 8.4 (bảng ánh xạ), bổ sung:
     - Gemini key sai là HTTP 400 `INVALID_ARGUMENT` + reason `API_KEY_INVALID` → `auth_failed`.
     - `google-genai` ném thẳng exception của httpx (`ConnectTimeout`, `ConnectError`, `ReadTimeout`) và `JSONDecodeError` → gateway phải tự ánh xạ lỗi transport và thân không đọc được (`timeout`, `network_error`, `invalid_response`).
     - Mã trong thân phản hồi (`model_not_found`, `insufficient_quota`, `context_length_exceeded`) ưu tiên hơn HTTP status, vì cổng trung gian trả 503 cho model không có.
     - 429 của Gemini phân biệt tốc độ với hạn mức ngày bằng `QuotaFailure.quotaId`.
     - Anthropic hết tiền là 402 `billing_error` (theo kiểu lỗi của SDK 2.12, chưa kiểm thật).
     - SDK Anthropic, OpenAI mặc định tự thử lại 2 lần: gateway đặt `max_retries=0` để tự thử lại và đếm `attempts`.
     - OpenAI stream phải luôn đặt `stream_options.include_usage`.
  5. Câu hỏi đề xuất (chưa cấp mã): HTTP 400 không thuộc 11 mã chuẩn (tham số không hợp lệ, schema bị từ chối) ánh xạ về mã nào — thêm mã mới (ví dụ `invalid_request`) hay gộp vào mã có sẵn? PO quyết, cập nhật PRD 8.6.
- **Yêu cầu hợp đồng:** không có.
- **Còn mở:** S01 (Claude, Gemini) và AC03 (endpoint chính thức) chờ key chính thức — PO cấp key hoặc chấp nhận kết luận một phần; câu hỏi đề xuất ở mục 5 của Đề xuất.
- **Bước tiếp theo:** PO xem PR, QC độc lập (`spec-converge-skill PID-00021`); khi có key chính thức Dev chạy Lần 2 (S01, AC03), không cần sửa mã.
- **Tài liệu đi kèm** (mỗi thư mục: `results.jsonl` từng lời gọi, `summary.md` bảng, `environment.json` phiên bản Python và gói). Key và host của cổng đã che; `scan_secrets.py` quét 0 chỗ khớp (EC04).
  - `evidence/capabilities/openai-gpt-4.1-nano/` — S01 lượt a (AC01, AC02); `anthropic-claude-haiku-4-5/` — lượt b, bằng chứng bị chặn (EC01); `anthropic-api-gpt-4.1-nano/` — lượt c; `google-gemini-2.5-flash-lite/` — lượt d; `openai-api-gemini-2.5-flash-lite/` — lượt e.
  - `evidence/base_url/` — S02, AC03. `evidence/errors/` — S02, AC04, EC03. `evidence/frameworks/` — S03, AC05.
  - Danh sách file:
    - `evidence/base_url/environment.json`
    - `evidence/base_url/results.jsonl`
    - `evidence/base_url/summary.md`
    - `evidence/capabilities/anthropic-api-gpt-4.1-nano/environment.json`
    - `evidence/capabilities/anthropic-api-gpt-4.1-nano/results.jsonl`
    - `evidence/capabilities/anthropic-api-gpt-4.1-nano/summary.md`
    - `evidence/capabilities/anthropic-claude-haiku-4-5/environment.json`
    - `evidence/capabilities/anthropic-claude-haiku-4-5/results.jsonl`
    - `evidence/capabilities/anthropic-claude-haiku-4-5/summary.md`
    - `evidence/capabilities/google-gemini-2.5-flash-lite/environment.json`
    - `evidence/capabilities/google-gemini-2.5-flash-lite/results.jsonl`
    - `evidence/capabilities/google-gemini-2.5-flash-lite/summary.md`
    - `evidence/capabilities/openai-api-gemini-2.5-flash-lite/environment.json`
    - `evidence/capabilities/openai-api-gemini-2.5-flash-lite/results.jsonl`
    - `evidence/capabilities/openai-api-gemini-2.5-flash-lite/summary.md`
    - `evidence/capabilities/openai-gpt-4.1-nano/environment.json`
    - `evidence/capabilities/openai-gpt-4.1-nano/results.jsonl`
    - `evidence/capabilities/openai-gpt-4.1-nano/summary.md`
    - `evidence/errors/environment.json`
    - `evidence/errors/results.jsonl`
    - `evidence/errors/summary.md`
    - `evidence/frameworks/environment.json`
    - `evidence/frameworks/results.jsonl`
    - `evidence/frameworks/summary.md`

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
