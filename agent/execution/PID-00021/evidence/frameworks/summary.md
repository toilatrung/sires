| Framework | Import được | Thời gian import (s) | Dòng mã nối | Số gói phụ thuộc | MB cài |
| --- | --- | --- | --- | --- | --- |
| plain | có | 0.0 | 0 | 0 | 0.0 |
| pydantic-ai | có | 3.71 | 93 | 17 | 24.6 |
| langgraph | có | 3.96 | 73 | 38 | 26.5 |

| Adapter | Framework | Kết quả | Lời gọi model | Tool call | Token vào / ra | Chi phí ước tính (USD) | Thời gian (s) | Usage framework tự đếm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fake | plain | đạt | 4 | 3 | 40 / 20 | — | 0.21 |  |
| fake | pydantic-ai | đạt | 4 | 3 | 40 / 20 | — | 2.63 | {"requests": 4, "input_tokens": 40, "output_tokens": 20, "tool_calls": 3} |
| fake | langgraph | đạt | 4 | 3 | 40 / 20 | — | 2.34 |  |
| openai | plain | đạt | 3 | 4 | 1506 / 187 | 0.00023 | 5.32 |  |
| openai | pydantic-ai | đạt | 3 | 4 | 1440 / 191 | 0.00022 | 5.72 | {"requests": 3, "input_tokens": 1440, "output_tokens": 191, "tool_calls": 4} |
| openai | langgraph | đạt | 3 | 4 | 1506 / 189 | 0.00023 | 4.84 |  |
| anthropic | plain | đạt | 3 | 4 | 1506 / 193 | — | 7.32 |  |
| anthropic | pydantic-ai | đạt | 3 | 4 | 1440 / 191 | — | 6.35 | {"requests": 3, "input_tokens": 1440, "output_tokens": 191, "tool_calls": 4} |
| anthropic | langgraph | đạt | 3 | 3 | 1296 / 174 | — | 7.13 |  |
| google | plain | đạt | 3 | 4 | 2068 / 219 | 0.00029 | 58.78 |  |
| google | pydantic-ai | đạt | 3 | 3 | 1862 / 180 | 0.00026 | 89.06 | {"requests": 3, "input_tokens": 1862, "output_tokens": 180, "tool_calls": 3} |
| google | langgraph | đạt | 3 | 3 | 1989 / 179 | 0.00027 | 116.58 |  |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../../LICENSES.md).
