| Project (ref / chunk body) | Phương án | p50 ms | p95 ms | p99 ms | max ms | vector p95 | keyword p95 | recall@50 (TB / min) | top-8 trùng | thiếu < 50 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 500 (500 / 46154) | `exact/vector` | 788 | 1280 | 1429 | 1546 | 545 | 874 | 1.000 / 1.00 | 1.000 | 0 |
| 500 (500 / 46154) | `exact/vector_plain` | 565 | 1121 | 1201 | 1218 | 144 | 974 | 1.000 / 1.00 | 1.000 | 0 |
| 500 (500 / 46154) | `exact/halfvec_plain` | 569 | 1140 | 1212 | 1220 | 118 | 1033 | 1.000 / 0.98 | 0.999 | 0 |
| 500 (500 / 46154) | `hnsw/vector/ef100/relaxed` | 808 | 1847 | 3703 | 4099 | 1202 | 1101 | 0.902 / 0.00 | 0.936 | 0 |
| 500 (500 / 46154) | `hnsw/halfvec/ef100/relaxed` | 603 | 1415 | 1830 | 3289 | 772 | 1091 | 0.923 / 0.00 | 0.956 | 0 |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
