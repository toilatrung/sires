| Project (ref / chunk body) | Phương án | p50 ms | p95 ms | p99 ms | max ms | vector p95 | keyword p95 | recall@50 (TB / min) | top-8 trùng | thiếu < 50 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1000 (1000 / 91056) | `exact/vector` | 1493 | 2860 | 9917 | 14420 | 2068 | 1319 | 1.000 / 1.00 | 1.000 | 0 |
| 1000 (1000 / 91056) | `exact/vector_plain` | 1114 | 1979 | 16347 | 25529 | 792 | 1348 | 1.000 / 1.00 | 1.000 | 0 |
| 1000 (1000 / 91056) | `exact/halfvec_plain` | 879 | 1851 | 2477 | 2804 | 970 | 1298 | 1.000 / 1.00 | 0.997 | 0 |
| 1000 (1000 / 91056) | `hnsw/vector/ef40/relaxed` | 693 | 1401 | 1438 | 1445 | 399 | 1286 | 0.880 / 0.00 | 0.951 | 0 |
| 1000 (1000 / 91056) | `hnsw/vector/ef100/relaxed` | 607 | 1336 | 1375 | 1391 | 475 | 1288 | 0.898 / 0.00 | 0.954 | 0 |
| 1000 (1000 / 91056) | `hnsw/halfvec/ef100/relaxed` | 801 | 2511 | 3395 | 3430 | 1965 | 1308 | 0.834 / 0.00 | 0.903 | 0 |
| 1000 (1000 / 91056) | `auto/vector/ef100/relaxed` | 559 | 1521 | 1726 | 1730 | 463 | 1358 | 0.898 / 0.00 | 0.954 | 0 |
| library (1960 / 177170) | `exact/vector` | 2671 | 5595 | 45243 | 54200 | 4017 | 2464 | 1.000 / 1.00 | 1.000 | 0 |
| library (1960 / 177170) | `exact/vector_plain` | 3140 | 5030 | 25038 | 37664 | 2182 | 2766 | 1.000 / 1.00 | 1.000 | 0 |
| library (1960 / 177170) | `exact/halfvec_plain` | 2342 | 3731 | 38834 | 61224 | 1293 | 3086 | 1.000 / 1.00 | 1.000 | 0 |
| library (1960 / 177170) | `hnsw/vector/ef40/relaxed` | 1749 | 3004 | 3194 | 3206 | 653 | 2638 | 0.794 / 0.00 | 0.880 | 0 |
| library (1960 / 177170) | `hnsw/vector/ef100/relaxed` | 1129 | 2480 | 2630 | 2643 | 448 | 2446 | 0.894 / 0.00 | 0.924 | 0 |
| library (1960 / 177170) | `hnsw/halfvec/ef100/relaxed` | 1278 | 2990 | 3253 | 3381 | 699 | 2502 | 0.917 / 0.00 | 0.963 | 0 |
| library (1960 / 177170) | `auto/vector/ef100/relaxed` | 1085 | 2719 | 2741 | 2746 | 252 | 2469 | 0.894 / 0.00 | 0.924 | 0 |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
