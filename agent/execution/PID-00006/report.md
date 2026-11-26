# PID-00006 — Báo cáo thực thi

**Trạng thái:** Xong — chờ QC

- **Ticket:** [PID-00006](../../../docs/tickets/issues/PID-00006/index.html) · **Luồng:** `platform` · **Giai đoạn:** PH-01
- **Nhánh:** `platform/pid-00006-sample-service` · **PR:** [#62](https://github.com/toilatrung/sires/pull/62) · đã merge; sửa sau rà 24/11: [#86](https://github.com/toilatrung/sires/pull/86)
- **Cập nhật:** 25/11/2026 (dòng PR sau merge; kết quả rà 24/11/2026 ở `self-qc.md` Lần 3, PC-04 A7)
- **Triển khai:** [implement.md](implement.md) · **Self-QC:** [self-qc.md](self-qc.md)

## 1. Tóm tắt

**S01–S07 xong.** Năm AC chính và NFR-MAINT-004-AC01 đạt bằng 13 test trên PostgreSQL thật,
gồm chạy chặn Internet. S07 có năm lần CI toàn repo đạt trên cùng PR/SHA sau khi đồng bộ
bản sửa knowledge từ main: **185 / 203 / 143 / 177 / 203 giây**, tất cả dưới 10 phút.
EC11 đã ghi và báo trước kết luận: PR thực tế chọn **20 project**, không trình bày đây là
phép đo chỉ một affected project. PO quyết định cổng PH-01; kết luận Dev là đạt ngưỡng thời gian
trên chính PR của ticket. Chi tiết và lịch sử trước sửa ở Lần 2 cuối file.

Số đo S07 làm trong worktree riêng khi PR #62 còn mở (nay đã merge). Baseline ban đầu ae1ac60, baseline
bộ đo chính 281a022; chỉ đồng bộ thay đổi đã merge từ main, không tự sửa luồng khác.

## 2. Trạng thái công việc

| Slice | Mục tiêu | Trạng thái | File tạo / sửa |
| --- | --- | --- | --- |
| S01 | Project và migration mẫu | Xong | `libs/ts/sample-service/`: package, tsconfig, README, drizzle config, migration SQL và journal; `src/migration.spec.ts`, `src/migrations.ts`, `src/migrate.ts` |
| S02 | Trạng thái, audit, outbox cùng giao dịch | Xong | `src/sample.service.ts`, `src/sample.module.ts`, `src/schema.ts`, `src/sample.spec.ts` |
| S03 | Inbox khử trùng tuần tự và đồng thời | Xong | `src/sample.service.ts`, `src/sample.spec.ts` |
| S04 | RLS và chạy không mạng ngoài | Xong | `src/sample.spec.ts`, `validation-offline.txt` |
| S05 | 12 DDL, 11 database PostgreSQL 16 | Xong | `src/ddl-pg16.spec.ts`, `src/database.testkit.ts` |
| S06 | Endpoint có service-auth guard | Xong | `src/sample.module.ts`, `src/sample.spec.ts`, `README.md` |
| S07 | SPK-10, năm lần CI trên cùng PR | Xong — 5/5 success, đều dưới 600s | `report.md`, `measure-spk10.cjs`, `spk10/` |

## 3. Kết quả

`check-pid.mjs PID-00006`: đủ để thực thi, 0 cảnh báo. Docker Engine 29.8.2 trong WSL Ubuntu-24.04; truy cập qua `tcp://localhost:2375`. `pnpm nx run @sires/sample-service:test`: 3 file, 13 test đạt. Lint, typecheck, build riêng của project đạt. Target Nx migrate chạy hai lần, journal vẫn một dòng (kiểm bằng `check-migrate.cjs`).

EC06: toàn bộ 13 test đạt trên Linux Node 22 trong **28,14 giây**, runner chặn OUTPUT IPv4/IPv6,
chỉ cho loopback và gateway Docker `172.17.0.1`. Kiểm kết nối Internet thất bại trước khi chạy test.
Ryuk và PostgreSQL thật vẫn truy cập cục bộ; không đổi firewall máy chủ. Bốn target build phụ thuộc
được Nx đọc từ cache, target test thực sự chạy 13 test. Lượt thử Docker internal trước đó lỗi Reaper,
đã thay cách cô lập mạng và không dùng kết quả lỗi đó để kết luận đạt.

Kết quả S05: PostgreSQL **16.16**, pgvector **0.8.7**. Không sửa DDL tham chiếu.

| Database | File service sau `00-common.sql` | Kết quả |
| --- | --- | --- |
| ddl_agent_core | agent-core.sql | Đạt |
| ddl_audit | audit.sql | Đạt |
| ddl_gateway | gateway.sql | Đạt |
| ddl_identity | identity.sql | Đạt |
| ddl_knowledge | knowledge.sql | Đạt; vector(1536), HNSW |
| ddl_library | library.sql | Đạt |
| ddl_manuscript | manuscript.sql | Đạt |
| ddl_orchestration | orchestration.sql | Đạt |
| ddl_planning | planning.sql | Đạt |
| ddl_research | research.sql | Đạt |
| ddl_workspace | workspace.sql | Đạt |

### SPK-10 — lịch sử Lần 1, trước khi mở PR

Workflow hiện tại: `.github/workflows/ci.yml`, commit sửa gần nhất **426c8eb**; baseline code
**ae1ac60**, Node theo `.nvmrc`, pnpm **10.34.9**, Ubuntu runner, pnpm cache hiện tại,
`nx.json.neverConnectToCloud=true`; không bật remote cache, không sửa CI.

EC11: `nx show projects --affected --base=origin/main --json` trên cây làm việc chọn **20 project**:
`@sires/sample-service`, `sires-common`, `@sires/sandbox-runner`, `@sires/orchestration`,
`@sires/contracts`, `@sires/platform`, `@sires/manuscript`, `@sires/workspace`, `@sires/identity`,
`@sires/planning`, `@sires/research`, `@sires/gateway`, `@sires/library`, `@sires/audit`,
`@sires/testing`, `@sires/web`, `agent-core`, `knowledge`, `eval`, `@sires/e2e`.
Nguyên nhân là importer mới trong `pnpm-lock.yaml`; lockfile chỉ thêm 49 dòng của package mẫu,
không đổi dependency phiên bản. Đây chưa phải danh sách lấy từ PR đã mở. Đã báo trong chat;
PO cần xử lý EC11 trước khi kết luận phép đo “PR một service”, không tự đổi PR hay phương pháp.

| Lần | Liên kết Actions | Tổng workflow | tracks | build | pnpm install / uv sync / nx affected |
| --- | --- | --- | --- | --- | --- |
| 1 | Chưa chạy | Chưa có | Chưa có | Chưa có | Chưa có |
| 2 | Chưa chạy | Chưa có | Chưa có | Chưa có | Chưa có |
| 3 | Chưa chạy | Chưa có | Chưa có | Chưa có | Chưa có |
| 4 | Chưa chạy | Chưa có | Chưa có | Chưa có | Chưa có |
| 5 | Chưa chạy | Chưa có | Chưa có | Chưa có | Chưa có |

Chưa kết luận so với 10 phút. Khi có PR, đo toàn bộ workflow năm lần trên cùng PR/SHA, giữ
cấu hình; một lần ≥ 600 giây thì không đạt cổng và chuyển PID-00009 theo EC07.

## 4. Việc còn lại

Không còn việc triển khai trong S01–S07. PO review PR #62 và QC độc lập bằng
spec-converge-skill; ghi kết quả S05 vào database 12.4 và kết quả S07 (kèm EC11) vào kiến trúc
12.2 nếu chấp nhận. Không tự merge PR hoặc xác nhận cổng PH-01 thay PO.

## 5. Yêu cầu thêm

Không có.

## 6. Cần PO và tài liệu đi kèm

- **Đề xuất cho PO:** gắn sample-service vào luồng platform trong bảng 1.4 và check-tracks theo H1/N13; không sửa ở ticket này. Ghi kết quả S05 vào database 12.4, kết quả S07 kèm phạm vi 20 project vào kiến trúc 12.2; dùng bộ số đo này làm baseline cho PID-00009. Không có DBQ mới: cả 12 DDL đều chạy đạt.
- **Yêu cầu hợp đồng:** không có; endpoint và bảng chỉ dùng trong mẫu, theo spec 2.3 và 4.2.
- **Còn mở:** không còn việc Dev trong ticket. EC11 là lưu ý nghiệm thu: đã công khai danh sách và báo trước kết luận, không đổi PR/phương pháp. Timeout local giữ trong lịch sử; năm lần CI chính đều đạt toàn repo. Race knowledge đã được PR #61 sửa trên main.
- **Bước tiếp theo:** PO review PR #62, QC độc lập bằng spec-converge-skill và quyết định nghiệm thu/merge.
- **Tài liệu đi kèm:** `implement.md` — luồng thực thi; `self-qc.md` — kiểm tra và đối chiếu spec; `check-migrate.cjs` — kiểm target migrate hai lần; `linux-qc.sh` và `linux-qc.Dockerfile` — tái lập kiểm không mạng ngoài; `validation-offline.txt` — stdout lần chạy đạt trên runner chặn Internet; `measure-spk10.cjs` — thu số đo GitHub; `spk10/README.md` và JSON liên kết ở Lần 2 — cấu hình và bằng chứng từng attempt.

## Lần 2 — 22/11/2026

Người dùng yêu cầu “triển khai nốt” sau khi đã nhận thông tin S07 cần PR, EC11 chọn 20 project
và kiểm toàn repo timeout. Tiếp tục commit mã, mở PR và đo năm lần CI của chính PR theo H5;
giữ nguyên workflow và phương pháp, ghi EC11 trước khi kết luận. Không cần đổi spec: EC11 yêu
cầu báo danh sách và báo PO trước kết luận, không yêu cầu thu hẹp affected hoặc đổi PR.

Baseline `origin/main` vẫn ae1ac60. Mã S01–S06 không đổi so với lần kiểm trước.

Đã commit và push mã tại **a1ab73811494bcff19e4d4860607daa5e25b2fb9**, GitHub verification
`verified=true`, `reason=valid`; mở PR #62 ở draft để đo S07. Workflow run **44927856447**.
Danh sách affected của PR bằng `--base=origin/main --head=HEAD` đúng 20 project đã liệt kê ở
Lần 1. Đã báo lại trong chat trước đo và kết luận; không thay danh sách hoặc cấu hình để né EC11.

Lần đo 1: **200 giây**, `tracks` đạt, `build` lỗi duy nhất ở `knowledge:test`, ca
`spikes/spk_05/test_text_layer.py::test_corrupt_never_hangs`. Worker `_die` thoát nhưng kết quả
là `corrupt/timeout` thay vì lý do có `exited`. Đọc mã chỉ ra khả năng race: `parent.recv()`
nhận EOF trước khi `proc.is_alive()` phản ánh trạng thái đã thoát; đây là suy luận từ mã và log,
không sửa `apps/knowledge` trong PID platform. Test nền platform **167/167 đạt** và mẫu
**13/13 đạt** trên runner CI: timeout container local lần trước không tái hiện trong lần CI này.

Tiếp tục bốn lần chạy lại **toàn bộ job** trên cùng workflow run và SHA, ghi cả kết quả lỗi.
Phép đo nhanh nhưng có test lỗi không chứng minh cổng CI đạt. Đề xuất luồng knowledge xử lý
ca crash worker của PID-00028; không tối ưu CI hoặc sửa file ngoài phạm vi chỉ để làm xanh.

Trong lúc bộ khảo sát chạy, main nhận PR **#61** tại **a2e7bf6**, sửa race trên. Remote nhánh
ticket được đồng bộ tại **6941a51** và CI **44928750267** đạt. Đã fast-forward giữ thay đổi
remote, merge main mới nhất **281a022** thành **d900765b561a2b9738935ec237890b56b0222083**,
chữ ký GitHub verified. Diff PR so main vẫn chỉ có package mẫu, lockfile và hồ sơ PID-00006;
không tự sửa knowledge hoặc docs ngoài phạm vi. Chạy bộ đo chính mới **44929131563** gồm năm
attempt cùng SHA d900765, giữ bộ cũ làm bằng chứng trước sửa và không trộn số đo.

### Bộ khảo sát trước sửa — SHA a1ab738, không dùng làm bộ nghiệm thu cuối

| Attempt | Kết quả CI | Tổng workflow | Bằng chứng |
| --- | --- | --- | --- |
| 1 | failure | 200s | [JSON](spk10/44927856447/attempt-1.json) |
| 2 | success | 153s | [JSON](spk10/44927856447/attempt-2.json) |
| 3 | success | 139s | [JSON](spk10/44927856447/attempt-3.json) |
| 4 | failure | 144s | [JSON](spk10/44927856447/attempt-4.json) |
| 5 | failure | 160s | [JSON](spk10/44927856447/attempt-5.json) |

Các lần lỗi cùng ca knowledge đã nêu. Bộ chính sau khi đồng bộ bản sửa có run ID riêng;
không chọn bỏ lần lỗi hoặc thay số đo cũ thành số đo sau sửa.

Tài liệu bổ sung S07: [measure-spk10.cjs](measure-spk10.cjs) — thu API và chạy lại toàn bộ job;
[spk10/README.md](spk10/README.md) — cấu hình, cách đọc số đo và phân biệt hai SHA.

### Bộ đo chính sau sửa — 5 lần CI cùng SHA d900765

- PR [#62](https://github.com/toilatrung/sires/pull/62); run **44929131563**; năm attempt liên tiếp,
  lần đầu và bốn lần chạy lại **toàn bộ job**, không chỉ job lỗi.
- SHA **d900765b561a2b9738935ec237890b56b0222083**; base **281a0220420e62c0fb2e276bbe0bfbb0262e2002**.
- Workflow `.github/workflows/ci.yml` không đổi: commit **426c8ebb8224ef58a9952d9d8af6dce21509c25a**,
  blob **a618df943877c9fe91ab7123a27203f4575359cc**. Runner `ubuntu-latest`, Node **24**, pnpm
  **10.34.9**, pnpm cache hiện tại, `uv sync --all-packages`, `nx affected`,
  `neverConnectToCloud=true`, không Nx remote cache. Không tối ưu hay đổi CI trong ticket.
- Thời gian workflow là `run_duration_ms / 1000` do GitHub trả về tại cuối mỗi attempt, trước
  lần chạy lại; job/step là hiệu timestamp GitHub. JSON giữ cả timing gốc và nguồn số đo.

| Lần | Liên kết và bằng chứng | Tổng workflow | tracks | build | pnpm install / uv sync / nx affected | CI |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | [Actions](https://github.com/toilatrung/sires/actions/runs/44929131563/attempts/1) / [JSON](spk10/44929131563/attempt-1.json) | 185s | 5s | 183s | 4s / 2s / 163s | success |
| 2 | [Actions](https://github.com/toilatrung/sires/actions/runs/44929131563/attempts/2) / [JSON](spk10/44929131563/attempt-2.json) | 203s | 11s | 199s | 3s / 3s / 171s | success |
| 3 | [Actions](https://github.com/toilatrung/sires/actions/runs/44929131563/attempts/3) / [JSON](spk10/44929131563/attempt-3.json) | 143s | 6s | 138s | 2s / 2s / 117s | success |
| 4 | [Actions](https://github.com/toilatrung/sires/actions/runs/44929131563/attempts/4) / [JSON](spk10/44929131563/attempt-4.json) | 177s | 6s | 172s | 4s / 2s / 153s | success |
| 5 | [Actions](https://github.com/toilatrung/sires/actions/runs/44929131563/attempts/5) / [JSON](spk10/44929131563/attempt-5.json) | 203s | 6s | 199s | 3s / 3s / 174s | success |

**Kết luận:** bộ chính **5/5 CI đạt**, cả năm workflow **dưới 600 giây**, chậm nhất **203 giây
(3 phút 23 giây)**. Đạt ngưỡng thời gian H5 trên PR thực tế. EC07 không phát sinh vượt ngưỡng;
PID-00009 có thể dùng số liệu để so sánh khi đổi CI. **EC11:** affected vẫn 20 project như danh
sách đã báo, không chứng nhận phạm vi chỉ một affected project hoặc tự xác nhận cổng PH-01.

Đã đọc log CI chính: `nx affected` chạy đủ lint/typecheck/test/build cho 20 project và hai tác vụ
phụ thuộc, kết thúc thành công; platform 167 test đạt, sample-service 13 test đạt. Không bỏ qua
test để lấy thời gian. Các thay đổi báo cáo/bằng chứng sau phép đo không nằm trong năm attempt;
không trộn thời gian kiểm commit hồ sơ cuối với bộ đo chính.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
