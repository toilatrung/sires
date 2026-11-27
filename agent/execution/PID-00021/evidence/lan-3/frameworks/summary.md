| Framework | Import được | Thời gian import (s) | Dòng mã nối | Số gói phụ thuộc | MB cài |
| --- | --- | --- | --- | --- | --- |
| plain | có | 0.0 | 0 | 0 | 0.0 |
| pydantic-ai | có | 9.1 | 93 | 17 | 24.6 |
| langgraph | có | 7.99 | 73 | 38 | 26.5 |

| Adapter | Framework | Kết quả | Lời gọi model | Tool call | Token vào / ra | Chi phí ước tính (USD) | Thời gian (s) | Usage framework tự đếm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fake | plain | đạt | 4 | 3 | 40 / 20 | — | 0.16 |  |
| fake | pydantic-ai | đạt | 4 | 3 | 40 / 20 | — | 2.45 | {"requests": 4, "input_tokens": 40, "output_tokens": 20, "tool_calls": 3} |
| fake | langgraph | đạt | 4 | 3 | 40 / 20 | — | 2.22 |  |
| openai | plain | đạt | 3 | 4 | 1506 / 205 | 0.00093 | 5.81 |  |
| openai | pydantic-ai | đạt | 3 | 3 | 1234 / 173 | 0.00077 | 5.29 | {"requests": 3, "input_tokens": 1234, "output_tokens": 173, "tool_calls": 3} |
| openai | langgraph | đạt | 4 | 4 | 1888 / 191 | 0.00106 | 6.4 |  |
| openai-responses | plain | đạt | 3 | 4 | 1467 / 195 | 0.00090 | 5.27 |  |
| openai-responses | pydantic-ai | đạt | 3 | 3 | 1217 / 178 | 0.00077 | 5.87 | {"requests": 3, "input_tokens": 1217, "output_tokens": 178, "tool_calls": 3} |
| openai-responses | langgraph | đạt | 3 | 4 | 1467 / 206 | 0.00092 | 5.82 |  |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../../../LICENSES.md).
