Môi trường: Linux-6.18.58.1-microsoft-standard-WSL2-x86_64-with-glibc2.41, Python 3.12.16, AMD Ryzen 7 4800H with Radeon Graphics (16 luồng); HTTP/1.1 keep-alive over 127.0.0.1, one stub process per service; httpx 0.28.1, uvicorn 0.54.0, uvloop 0.23.0. 200 lượt đo + 10 lượt khởi động mỗi ô; percentile theo statistics.quantiles(method='inclusive').

- Payload `typical` (agent writing): getProjectContextBundle 12 KB, getTaskContextBundle 26 KB, listContextItemsForAssembly 36 KB, getResearchContextBundle 91 KB, getManuscriptContextBundle 75 KB
- Payload `ceiling` (agent writing): getProjectContextBundle 51 KB, getTaskContextBundle 148 KB, listContextItemsForAssembly 438 KB, getResearchContextBundle 1,494 KB, getManuscriptContextBundle 1,027 KB

| Payload | Cách đọc | σ | Trễ giả định (trung vị/API, ms) | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| typical | parallel | 0.0 | 0 | 13.7 | 20.8 | 27.1 | 39.8 |
| typical | parallel | 0.0 | 10 | 23.7 | 30.5 | 41.1 | 50.2 |
| typical | parallel | 0.0 | 25 | 38.0 | 41.5 | 44.3 | 69.1 |
| typical | parallel | 0.0 | 50 | 63.8 | 67.2 | 69.3 | 90.8 |
| typical | parallel | 0.0 | 100 | 113.5 | 116.9 | 120.4 | 139.3 |
| typical | parallel | 0.5 | 0 | 14.5 | 20.7 | 24.5 | 64.8 |
| typical | parallel | 0.5 | 10 | 27.8 | 46.7 | 59.6 | 71.3 |
| typical | parallel | 0.5 | 25 | 55.3 | 98.1 | 139.5 | 172.3 |
| typical | parallel | 0.5 | 50 | 102.7 | 188.3 | 268.7 | 310.2 |
| typical | parallel | 0.5 | 100 | 189.8 | 368.3 | 531.6 | 612.9 |
| typical | two_wave | 0.0 | 0 | 15.2 | 23.7 | 37.5 | 70.7 |
| typical | two_wave | 0.0 | 10 | 35.9 | 43.9 | 52.1 | 65.2 |
| typical | two_wave | 0.0 | 25 | 67.5 | 75.4 | 81.2 | 113.8 |
| typical | two_wave | 0.0 | 50 | 116.7 | 124.3 | 127.8 | 140.2 |
| typical | two_wave | 0.0 | 100 | 218.6 | 229.0 | 239.1 | 246.6 |
| typical | two_wave | 0.5 | 0 | 17.4 | 27.5 | 33.9 | 51.8 |
| typical | two_wave | 0.5 | 10 | 42.9 | 67.4 | 81.0 | 87.3 |
| typical | two_wave | 0.5 | 25 | 87.9 | 150.4 | 186.4 | 203.7 |
| typical | two_wave | 0.5 | 50 | 159.4 | 263.4 | 363.0 | 378.4 |
| typical | two_wave | 0.5 | 100 | 305.8 | 510.8 | 707.2 | 736.2 |
| typical | sequential | 0.0 | 0 | 21.3 | 67.9 | 80.1 | 94.5 |
| typical | sequential | 0.0 | 10 | 74.3 | 82.0 | 85.2 | 86.5 |
| typical | sequential | 0.0 | 25 | 148.8 | 154.0 | 161.6 | 163.9 |
| typical | sequential | 0.0 | 50 | 275.6 | 284.0 | 286.5 | 324.8 |
| typical | sequential | 0.0 | 100 | 524.0 | 530.4 | 535.9 | 538.5 |
| typical | sequential | 0.5 | 0 | 17.5 | 24.7 | 30.3 | 53.0 |
| typical | sequential | 0.5 | 10 | 78.3 | 110.1 | 124.1 | 134.5 |
| typical | sequential | 0.5 | 25 | 163.9 | 242.3 | 283.5 | 300.7 |
| typical | sequential | 0.5 | 50 | 305.3 | 462.5 | 530.3 | 572.8 |
| typical | sequential | 0.5 | 100 | 578.9 | 897.4 | 1049.4 | 1121.4 |
| ceiling | parallel | 0.0 | 0 | 41.3 | 66.9 | 75.6 | 86.3 |
| ceiling | parallel | 0.0 | 10 | 52.6 | 79.7 | 90.1 | 95.9 |
| ceiling | parallel | 0.0 | 25 | 65.3 | 90.4 | 97.5 | 101.5 |
| ceiling | parallel | 0.0 | 50 | 90.6 | 115.7 | 124.5 | 133.0 |
| ceiling | parallel | 0.0 | 100 | 138.5 | 162.2 | 170.4 | 254.8 |
| ceiling | parallel | 0.5 | 0 | 39.8 | 66.6 | 73.0 | 84.1 |
| ceiling | parallel | 0.5 | 10 | 45.1 | 70.7 | 75.9 | 85.9 |
| ceiling | parallel | 0.5 | 25 | 65.9 | 105.1 | 152.2 | 184.7 |
| ceiling | parallel | 0.5 | 50 | 107.1 | 189.9 | 281.4 | 319.2 |
| ceiling | parallel | 0.5 | 100 | 194.2 | 364.5 | 542.3 | 621.8 |
| ceiling | two_wave | 0.0 | 0 | 39.6 | 64.4 | 78.2 | 90.9 |
| ceiling | two_wave | 0.0 | 10 | 61.6 | 88.1 | 99.8 | 110.6 |
| ceiling | two_wave | 0.0 | 25 | 91.1 | 117.2 | 121.2 | 121.6 |
| ceiling | two_wave | 0.0 | 50 | 141.6 | 165.7 | 216.3 | 321.4 |
| ceiling | two_wave | 0.0 | 100 | 240.8 | 266.9 | 270.6 | 279.8 |
| ceiling | two_wave | 0.5 | 0 | 39.9 | 64.2 | 73.4 | 80.6 |
| ceiling | two_wave | 0.5 | 10 | 61.6 | 90.7 | 101.5 | 134.4 |
| ceiling | two_wave | 0.5 | 25 | 129.1 | 206.4 | 247.6 | 275.5 |
| ceiling | two_wave | 0.5 | 50 | 198.8 | 330.7 | 400.6 | 435.1 |
| ceiling | two_wave | 0.5 | 100 | 344.9 | 559.8 | 723.6 | 781.7 |
| ceiling | sequential | 0.0 | 0 | 88.7 | 196.4 | 256.3 | 304.3 |
| ceiling | sequential | 0.0 | 10 | 157.6 | 254.3 | 304.0 | 360.9 |
| ceiling | sequential | 0.0 | 25 | 200.0 | 268.5 | 316.4 | 328.3 |
| ceiling | sequential | 0.0 | 50 | 304.1 | 334.7 | 357.9 | 407.4 |
| ceiling | sequential | 0.0 | 100 | 570.7 | 681.6 | 755.1 | 781.9 |
| ceiling | sequential | 0.5 | 0 | 47.6 | 149.7 | 464.3 | 1011.9 |
| ceiling | sequential | 0.5 | 10 | 116.5 | 185.5 | 226.4 | 279.0 |
| ceiling | sequential | 0.5 | 25 | 197.1 | 281.9 | 313.4 | 338.6 |
| ceiling | sequential | 0.5 | 50 | 338.6 | 506.5 | 572.2 | 600.8 |
| ceiling | sequential | 0.5 | 100 | 612.8 | 919.9 | 1073.8 | 1149.5 |

p95 theo operation ở chế độ `parallel` (ms):

| Payload | σ | Trễ (ms) | workspace | planning | orchestration | research | manuscript |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| typical | 0.0 | 0 | 12.2 | 12.7 | 13.0 | 17.9 | 16.1 |
| typical | 0.0 | 10 | 21.6 | 21.8 | 22.4 | 27.6 | 25.5 |
| typical | 0.0 | 25 | 37.0 | 36.2 | 36.6 | 38.7 | 38.0 |
| typical | 0.0 | 50 | 64.7 | 62.5 | 62.6 | 64.3 | 63.6 |
| typical | 0.0 | 100 | 113.2 | 112.2 | 112.7 | 113.9 | 113.2 |
| typical | 0.5 | 0 | 11.4 | 13.0 | 13.1 | 17.6 | 15.5 |
| typical | 0.5 | 10 | 32.5 | 30.8 | 29.1 | 34.3 | 34.1 |
| typical | 0.5 | 25 | 67.9 | 67.1 | 62.0 | 79.5 | 73.2 |
| typical | 0.5 | 50 | 129.9 | 123.1 | 107.8 | 133.5 | 132.7 |
| typical | 0.5 | 100 | 244.9 | 242.2 | 204.7 | 260.8 | 260.3 |
| ceiling | 0.0 | 0 | 12.9 | 16.5 | 29.2 | 64.2 | 50.2 |
| ceiling | 0.0 | 10 | 21.3 | 25.7 | 36.8 | 76.5 | 65.8 |
| ceiling | 0.0 | 25 | 39.4 | 41.4 | 53.6 | 87.6 | 75.2 |
| ceiling | 0.0 | 50 | 63.2 | 65.6 | 76.4 | 112.6 | 99.8 |
| ceiling | 0.0 | 100 | 113.1 | 113.9 | 124.8 | 159.3 | 149.9 |
| ceiling | 0.5 | 0 | 11.5 | 15.3 | 24.4 | 62.5 | 50.6 |
| ceiling | 0.5 | 10 | 39.5 | 41.4 | 42.7 | 67.7 | 58.1 |
| ceiling | 0.5 | 25 | 68.5 | 67.0 | 66.6 | 85.0 | 82.2 |
| ceiling | 0.5 | 50 | 124.4 | 125.9 | 123.3 | 143.0 | 141.4 |
| ceiling | 0.5 | 100 | 245.0 | 240.6 | 222.3 | 271.8 | 267.1 |

EC03 — một service trả lời sau 3 × timeout (500 ms/operation):

| Service chậm | Lớp bắt buộc? | Lượt | Kết quả | Có context thiếu lớp? | Nêu đúng service? | Thời gian tới lỗi (ms, trung vị) |
| --- | --- | ---: | --- | --- | --- | ---: |
| workspace | không | 5 | failed | không | có | 503.5 |
| planning | có | 5 | failed | không | có | 503.6 |
| orchestration | có | 5 | failed | không | có | 504.0 |
| research | không | 5 | failed | không | có | 504.4 |
| manuscript | không | 5 | failed | không | có | 505.1 |

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../../LICENSES.md).
