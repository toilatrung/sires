### Profile `typical` — token theo lớp (ước lượng tỉ lệ Anthropic; cận trên = byte UTF-8)

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

### Profile `typical` — vừa context window? (ước lượng ‖ cận trên; budget = token đầu vào)

| Agent | claude-opus-5-5 / claude-sonnet-5-5 / claude-haiku-5-5 (983,616) | gpt-5 / gpt-5-mini / gpt-5-nano (272,000) | gpt-6.2-astra (922,000) | gemini-2.5-pro / gemini-3.8-flash (1,048,576) | gemini-4-carbon (1,032,192) |
| --- | --- | --- | --- | --- | --- |
| orchestrator | vừa | vừa | vừa | vừa | vừa |
| discovery | vừa | vừa | vừa | vừa | vừa |
| reference_processing | vừa | vừa | vừa | vừa | vừa |
| evidence_retrieval | vừa | vừa | vừa | vừa | vừa |
| synthesis | vừa | vừa | vừa | vừa | vừa |
| writing | vừa | vừa | vừa | vừa | vừa |
| verification | vừa | vừa | vừa | vừa | vừa |
| analysis | vừa | vừa | vừa | vừa | vừa |
| diagram | vừa | vừa | vừa | vừa | vừa |

### Profile `typical` — ca vượt (EC01): không có

### Profile `typical` — số Context Item Active tối đa trước khi L1–3 vượt budget

| Model | Đếm | Budget | L1–3 trừ Context Item (lớn nhất) | Token/Context Item | Số Context Item tối đa |
| --- | --- | ---: | ---: | ---: | ---: |
| claude-opus-5-5 / claude-sonnet-5-5 / claude-haiku-5-5 | estimate | 983,616 | 15,877 | 278 | 3,481 |
| claude-opus-5-5 / claude-sonnet-5-5 / claude-haiku-5-5 | upper | 983,616 | 39,337 | 732 | 1,289 |
| gpt-5 / gpt-5-mini / gpt-5-nano | estimate | 272,000 | 10,340 | 183 | 1,429 |
| gpt-5 / gpt-5-mini / gpt-5-nano | upper | 272,000 | 39,337 | 732 | 317 |
| gpt-6.2-astra | estimate | 922,000 | 10,340 | 183 | 4,981 |
| gpt-6.2-astra | upper | 922,000 | 39,337 | 732 | 1,205 |
| gemini-2.5-pro / gemini-3.8-flash | estimate | 1,048,576 | 10,340 | 183 | 5,673 |
| gemini-2.5-pro / gemini-3.8-flash | upper | 1,048,576 | 39,337 | 732 | 1,378 |
| gemini-4-carbon | estimate | 1,032,192 | 10,340 | 183 | 5,583 |
| gemini-4-carbon | upper | 1,032,192 | 39,337 | 732 | 1,356 |

### Profile `ceiling` — token theo lớp (ước lượng tỉ lệ Anthropic; cận trên = byte UTF-8)

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

### Profile `ceiling` — vừa context window? (ước lượng ‖ cận trên; budget = token đầu vào)

| Agent | claude-opus-5-5 / claude-sonnet-5-5 / claude-haiku-5-5 (983,616) | gpt-5 / gpt-5-mini / gpt-5-nano (272,000) | gpt-6.2-astra (922,000) | gemini-2.5-pro / gemini-3.8-flash (1,048,576) | gemini-4-carbon (1,032,192) |
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

### Profile `ceiling` — ca vượt sau cắt gọn (EC01)

| Agent | Model | Đếm | Kết quả | Lớp lớn nhất | Token lớp đó | Tổng (sau cắt, nếu có cắt) | Budget |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| orchestrator | gpt-5 / gpt-5-mini / gpt-5-nano | upper | L1–3 vượt | L3 | 457,909 | 1,315,928 | 272,000 |
| discovery | claude-opus-5-5 / claude-sonnet-5-5 / claude-haiku-5-5 | estimate | vượt sau cắt | L4 | 809,620 | 1,013,056 | 983,616 |
| discovery | claude-opus-5-5 / claude-sonnet-5-5 / claude-haiku-5-5 | upper | vượt sau cắt | L4 | 2,022,650 | 2,566,424 | 983,616 |
| discovery | gpt-5 / gpt-5-mini / gpt-5-nano | estimate | vượt sau cắt | L4 | 504,959 | 638,919 | 272,000 |
| discovery | gpt-5 / gpt-5-mini / gpt-5-nano | upper | L1–3 vượt | L3 | 458,154 | 2,587,400 | 272,000 |
| discovery | gpt-6.2-astra | upper | vượt sau cắt | L4 | 2,022,650 | 2,566,424 | 922,000 |
| discovery | gemini-2.5-pro / gemini-3.8-flash | upper | vượt sau cắt | L4 | 2,022,650 | 2,566,424 | 1,048,576 |
| discovery | gemini-4-carbon | upper | vượt sau cắt | L4 | 2,022,650 | 2,566,424 | 1,032,192 |
| reference_processing | claude-opus-5-5 / claude-sonnet-5-5 / claude-haiku-5-5 | estimate | vượt sau cắt | L4 | 863,002 | 1,059,525 | 983,616 |
| reference_processing | claude-opus-5-5 / claude-sonnet-5-5 / claude-haiku-5-5 | upper | vượt sau cắt | L4 | 2,156,127 | 2,682,715 | 983,616 |
| reference_processing | gpt-5 / gpt-5-mini / gpt-5-nano | estimate | vượt sau cắt | L4 | 538,361 | 667,815 | 272,000 |
| reference_processing | gpt-5 / gpt-5-mini / gpt-5-nano | upper | L1–3 vượt | L3 | 457,873 | 2,865,316 | 272,000 |
| reference_processing | gpt-6.2-astra | upper | vượt sau cắt | L4 | 2,156,127 | 2,682,715 | 922,000 |
| reference_processing | gemini-2.5-pro / gemini-3.8-flash | upper | vượt sau cắt | L4 | 2,156,127 | 2,682,715 | 1,048,576 |
| reference_processing | gemini-4-carbon | upper | vượt sau cắt | L4 | 2,156,127 | 2,682,715 | 1,032,192 |
| evidence_retrieval | gpt-5 / gpt-5-mini / gpt-5-nano | upper | L1–3 vượt | L3 | 457,989 | 963,953 | 272,000 |
| synthesis | gpt-5 / gpt-5-mini / gpt-5-nano | upper | L1–3 vượt | L3 | 458,273 | 3,816,878 | 272,000 |
| writing | gpt-5 / gpt-5-mini / gpt-5-nano | upper | L1–3 vượt | L3 | 458,290 | 2,989,048 | 272,000 |
| verification | gpt-5 / gpt-5-mini / gpt-5-nano | upper | L1–3 vượt | L3 | 458,112 | 1,329,378 | 272,000 |
| analysis | gpt-5 / gpt-5-mini / gpt-5-nano | upper | L1–3 vượt | L3 | 458,238 | 1,152,694 | 272,000 |
| diagram | gpt-5 / gpt-5-mini / gpt-5-nano | upper | L1–3 vượt | L3 | 457,833 | 935,027 | 272,000 |

### Profile `ceiling` — số Context Item Active tối đa trước khi L1–3 vượt budget

| Model | Đếm | Budget | L1–3 trừ Context Item (lớn nhất) | Token/Context Item | Số Context Item tối đa |
| --- | --- | ---: | ---: | ---: | ---: |
| claude-opus-5-5 / claude-sonnet-5-5 / claude-haiku-5-5 | estimate | 983,616 | 41,378 | 473 | 1,992 |
| claude-opus-5-5 / claude-sonnet-5-5 / claude-haiku-5-5 | upper | 983,616 | 107,830 | 1,270 | 689 |
| gpt-5 / gpt-5-mini / gpt-5-nano | estimate | 272,000 | 27,068 | 312 | 785 |
| gpt-5 / gpt-5-mini / gpt-5-nano | upper | 272,000 | 107,830 | 1,270 | 129 |
| gpt-6.2-astra | estimate | 922,000 | 27,068 | 312 | 2,868 |
| gpt-6.2-astra | upper | 922,000 | 107,830 | 1,270 | 641 |
| gemini-2.5-pro / gemini-3.8-flash | estimate | 1,048,576 | 27,068 | 312 | 3,274 |
| gemini-2.5-pro / gemini-3.8-flash | upper | 1,048,576 | 107,830 | 1,270 | 740 |
| gemini-4-carbon | estimate | 1,032,192 | 27,068 | 312 | 3,221 |
| gemini-4-carbon | upper | 1,032,192 | 107,830 | 1,270 | 727 |


---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
