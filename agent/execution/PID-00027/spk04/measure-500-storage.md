| Project (ref / chunk body) | Phương án | p50 ms | p95 ms | p99 ms | max ms | vector p95 | keyword p95 | recall@50 (TB / min) | top-8 trùng | thiếu < 50 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 500 (500 / 46154) | `exact/vector` | 609 | 1083 | 1272 | 1584 | 506 | 697 | 1.000 / 1.00 | 1.000 | 0 |
| 500 (500 / 46154) | `exact/vector_plain` | 414 | 803 | 890 | 954 | 211 | 673 | 1.000 / 1.00 | 1.000 | 0 |
| 500 (500 / 46154) | `exact/halfvec` | 528 | 931 | 1071 | 2641 | 332 | 666 | 1.000 / 0.98 | 0.999 | 0 |
| 500 (500 / 46154) | `exact/halfvec_plain` | 384 | 779 | 915 | 951 | 120 | 670 | 1.000 / 0.98 | 0.999 | 0 |
| 500 (500 / 46154) | `hnsw/vector/ef100/relaxed` | 477 | 1379 | 3228 | 14260 | 1087 | 674 | 0.902 / 0.00 | 0.936 | 0 |
| 500 (500 / 46154) | `hnsw/halfvec/ef100/relaxed` | 395 | 960 | 1259 | 2282 | 583 | 678 | 0.923 / 0.00 | 0.956 | 0 |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
