| Adapter | Tình huống | Nguồn | Mã mong đợi | Mã ánh xạ | Khớp | Thử lại | Retry-After (s) | Tín hiệu |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| anthropic | rate_limit | proxy | rate_limited | rate_limited | đúng | True | 7.0 | HTTP 429 rate_limit_error |
| anthropic | quota | proxy | quota_exceeded | quota_exceeded | đúng | False | None | HTTP 402 billing_error |
| anthropic | overloaded | proxy | provider_unavailable | provider_unavailable | đúng | True | None | HTTP 529 overloaded_error |
| anthropic | server_error | proxy | provider_unavailable | provider_unavailable | đúng | True | None | HTTP 500 api_error |
| anthropic | gateway_timeout | proxy | timeout | timeout | đúng | True | None | HTTP 504 timeout_error |
| anthropic | context | proxy | context_too_long | context_too_long | đúng | False | None | HTTP 400 invalid_request_error |
| anthropic | forbidden | proxy | permission_denied | permission_denied | đúng | False | None | HTTP 403 permission_error |
| anthropic | slow | proxy | timeout | timeout | đúng | True | None | transport APITimeoutError |
| anthropic | refusal | proxy | content_refused | content_refused | đúng |  |  | stop_reason=refusal |
| anthropic | no_usage | proxy | no_data | no_data | đúng |  |  | phản hồi không có usage |
| anthropic | bad_schema | proxy | invalid_response | invalid_response | đúng |  |  | 4 lỗi; đầu tiên: topic: Input should be a valid string |
| anthropic | malformed | proxy | invalid_response | invalid_response | đúng | False | None | phản hồi không đọc được (AttributeError) |
| anthropic | invalid_key | real | auth_failed | auth_failed | đúng | False | None | HTTP 401 authentication_error |
| anthropic | timeout_client | gateway | timeout | timeout | đúng | True | None | transport APITimeoutError |
| anthropic | network_refused | real | network_error | network_error | đúng | True | None | transport APIConnectionError |
| anthropic | network_dns | real | network_error | network_error | đúng | True | None | transport APIConnectionError |
| anthropic | invalid_key | gateway | auth_failed | auth_failed | đúng | False | None | HTTP 401 proxy_api_error |
| anthropic | model_not_found | gateway | model_not_found | provider_unavailable | LỆCH | True | None | HTTP 503 proxy_api_error |
| openai | rate_limit | proxy | rate_limited | rate_limited | đúng | True | 7.0 | HTTP 429 requests/rate_limit_exceeded |
| openai | quota | proxy | quota_exceeded | quota_exceeded | đúng | False | None | HTTP 429 insufficient_quota/insufficient_quota |
| openai | overloaded | proxy | provider_unavailable | provider_unavailable | đúng | True | None | HTTP 503 server_error |
| openai | server_error | proxy | provider_unavailable | provider_unavailable | đúng | True | None | HTTP 500 server_error |
| openai | gateway_timeout | proxy | timeout | timeout | đúng | True | None | HTTP 504 server_error |
| openai | context | proxy | context_too_long | context_too_long | đúng | False | None | HTTP 400 invalid_request_error/context_length_exceeded |
| openai | forbidden | proxy | permission_denied | permission_denied | đúng | False | None | HTTP 403 request_forbidden/unsupported_country |
| openai | slow | proxy | timeout | timeout | đúng | True | None | transport APITimeoutError |
| openai | refusal | proxy | content_refused | content_refused | đúng |  |  | stop_reason=stop |
| openai | no_usage | proxy | no_data | no_data | đúng |  |  | phản hồi không có usage |
| openai | bad_schema | proxy | invalid_response | invalid_response | đúng |  |  | 4 lỗi; đầu tiên: topic: Input should be a valid string |
| openai | malformed | proxy | invalid_response | invalid_response | đúng | False | None | phản hồi không đọc được (AttributeError) |
| openai | invalid_key | real | auth_failed | auth_failed | đúng | False | None | HTTP 401 invalid_request_error/invalid_api_key |
| openai | timeout_client | gateway | timeout | timeout | đúng | True | None | transport APITimeoutError |
| openai | network_refused | real | network_error | network_error | đúng | True | None | transport APIConnectionError |
| openai | network_dns | real | network_error | network_error | đúng | True | None | transport APIConnectionError |
| openai | invalid_key | gateway | auth_failed | auth_failed | đúng | False | None | HTTP 401 proxy_api_error |
| openai | model_not_found | gateway | model_not_found | provider_unavailable | LỆCH | True | None | HTTP 503 proxy_api_error/model_not_found |
| openai-responses | rate_limit | proxy | rate_limited | rate_limited | đúng | True | 7.0 | HTTP 429 requests/rate_limit_exceeded |
| openai-responses | quota | proxy | quota_exceeded | quota_exceeded | đúng | False | None | HTTP 429 insufficient_quota/insufficient_quota |
| openai-responses | overloaded | proxy | provider_unavailable | provider_unavailable | đúng | True | None | HTTP 503 server_error |
| openai-responses | server_error | proxy | provider_unavailable | provider_unavailable | đúng | True | None | HTTP 500 server_error |
| openai-responses | gateway_timeout | proxy | timeout | timeout | đúng | True | None | HTTP 504 server_error |
| openai-responses | context | proxy | context_too_long | context_too_long | đúng | False | None | HTTP 400 invalid_request_error/context_length_exceeded |
| openai-responses | forbidden | proxy | permission_denied | permission_denied | đúng | False | None | HTTP 403 request_forbidden/unsupported_country |
| openai-responses | slow | proxy | timeout | timeout | đúng | True | None | transport APITimeoutError |
| openai-responses | refusal | proxy | content_refused | content_refused | đúng |  |  | stop_reason=completed |
| openai-responses | no_usage | proxy | no_data | no_data | đúng |  |  | phản hồi không có usage |
| openai-responses | bad_schema | proxy | invalid_response | invalid_response | đúng |  |  | 4 lỗi; đầu tiên: topic: Input should be a valid string |
| openai-responses | malformed | proxy | invalid_response | invalid_response | đúng | False | None | phản hồi không đọc được (AttributeError) |
| openai-responses | invalid_key | real | auth_failed | auth_failed | đúng | False | None | HTTP 401 invalid_request_error/invalid_api_key |
| openai-responses | timeout_client | gateway | timeout | timeout | đúng | True | None | transport APITimeoutError |
| openai-responses | network_refused | real | network_error | network_error | đúng | True | None | transport APIConnectionError |
| openai-responses | network_dns | real | network_error | network_error | đúng | True | None | transport APIConnectionError |
| openai-responses | invalid_key | gateway | auth_failed | auth_failed | đúng | False | None | HTTP 401 proxy_api_error |
| openai-responses | model_not_found | gateway | model_not_found | provider_unavailable | LỆCH | True | None | HTTP 503 proxy_api_error/model_not_found |
| google | rate_limit | proxy | rate_limited | rate_limited | đúng | True | 7.0 | HTTP 429 RESOURCE_EXHAUSTED quotaId=GenerateRequestsPerMinutePerProjectPerModel |
| google | quota | proxy | quota_exceeded | quota_exceeded | đúng | False | 7.0 | HTTP 429 RESOURCE_EXHAUSTED quotaId=GenerateRequestsPerDayPerProjectPerModel |
| google | overloaded | proxy | provider_unavailable | provider_unavailable | đúng | True | None | HTTP 503 UNAVAILABLE |
| google | server_error | proxy | provider_unavailable | provider_unavailable | đúng | True | None | HTTP 500 INTERNAL |
| google | gateway_timeout | proxy | timeout | timeout | đúng | True | None | HTTP 504 DEADLINE_EXCEEDED |
| google | context | proxy | context_too_long | context_too_long | đúng | False | None | HTTP 400 INVALID_ARGUMENT |
| google | forbidden | proxy | permission_denied | permission_denied | đúng | False | None | HTTP 403 PERMISSION_DENIED |
| google | slow | proxy | timeout | timeout | đúng | True | None | transport ReadTimeout |
| google | refusal | proxy | content_refused | content_refused | đúng |  |  | stop_reason=SAFETY |
| google | no_usage | proxy | no_data | no_data | đúng |  |  | phản hồi không có usage |
| google | bad_schema | proxy | invalid_response | invalid_response | đúng |  |  | 4 lỗi; đầu tiên: topic: Input should be a valid string |
| google | malformed | proxy | invalid_response | invalid_response | đúng | False | None | transport JSONDecodeError |
| google | invalid_key | real | auth_failed | auth_failed | đúng | False | None | HTTP 400 INVALID_ARGUMENT/API_KEY_INVALID |
| google | timeout_client | gateway | timeout | timeout | đúng | True | None | transport ReadTimeout |
| google | network_refused | real | network_error | network_error | đúng | True | None | transport ConnectError |
| google | network_dns | real | network_error | network_error | đúng | True | None | transport ConnectError |
| google | invalid_key | gateway | auth_failed | auth_failed | đúng | False | None | HTTP 401 None |
| google | model_not_found | gateway | model_not_found | provider_unavailable | LỆCH | True | None | HTTP 503 None |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../../../LICENSES.md).
