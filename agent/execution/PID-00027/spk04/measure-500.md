| Project (ref / chunk body) | Phương án | p50 ms | p95 ms | p99 ms | max ms | vector p95 | keyword p95 | recall@50 (TB / min) | top-8 trùng | thiếu < 50 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 500 (500 / 46154) | `exact/vector` | 603 | 1040 | 1222 | 1431 | 479 | 714 | 1.000 / 1.00 | 1.000 | 0 |
| 500 (500 / 46154) | `exact/halfvec` | 529 | 961 | 1041 | 1136 | 339 | 703 | 1.000 / 0.98 | 0.999 | 0 |
| 500 (500 / 46154) | `hnsw/vector/ef40/relaxed` | 359 | 846 | 1224 | 3936 | 368 | 718 | 0.884 / 0.00 | 0.930 | 0 |
| 500 (500 / 46154) | `hnsw/vector/ef100/relaxed` | 307 | 761 | 933 | 1136 | 141 | 729 | 0.902 / 0.00 | 0.936 | 0 |
| 500 (500 / 46154) | `hnsw/vector/ef200/relaxed` | 381 | 905 | 1204 | 16228 | 418 | 732 | 0.931 / 0.00 | 0.958 | 0 |
| 500 (500 / 46154) | `hnsw/vector/ef100/strict` | 296 | 1431 | 7956 | 25274 | 1177 | 738 | 0.836 / 0.00 | 0.885 | 0 |
| 500 (500 / 46154) | `hnsw/vector/ef40/off` | 280 | 758 | 828 | 870 | 63 | 721 | 0.572 / 0.00 | 0.884 | 200 |
| 500 (500 / 46154) | `hnsw/halfvec/ef40/relaxed` | 353 | 880 | 1496 | 1906 | 518 | 740 | 0.889 / 0.00 | 0.948 | 0 |
| 500 (500 / 46154) | `hnsw/halfvec/ef100/relaxed` | 305 | 777 | 985 | 1481 | 100 | 745 | 0.923 / 0.00 | 0.956 | 0 |
| 500 (500 / 46154) | `hnsw/halfvec/ef200/relaxed` | 356 | 866 | 1253 | 1872 | 383 | 717 | 0.940 / 0.00 | 0.965 | 0 |
| 500 (500 / 46154) | `auto/vector/ef100/relaxed` | 578 | 1026 | 1209 | 1528 | 400 | 736 | 1.000 / 1.00 | 1.000 | 0 |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
