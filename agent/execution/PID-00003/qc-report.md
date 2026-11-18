# PID-00003 — Báo cáo QC độc lập

**Kết luận mới nhất:** Còn việc — 0 CRITICAL, 0 HIGH, 1 MEDIUM (Lần 1, 18/11/2026)

- **Ticket:** [PID-00003](../../../docs/tickets/issues/PID-00003/index.html)
- **Kết quả của Dev:** `report.md`, `implement.md`, `self-qc.md` trong thư mục này

QC chạy độc lập với Dev, không sửa mã, không sửa `docs/`. Mỗi lần chạy thêm một mục mới ở cuối file, không ghi đè. Chỉ giữ mục hợp với skill đã chạy.

## Lần 1 — 18/11/2026 · spec-converge-skill

Người chạy: agent QC độc lập do PO giao. Mã nguồn: nhánh `platform/ts-service-auth`, commit `877a361` (PR #34). Phạm vi đọc: `docs/tickets/issues/PID-00003/` (index, specs, slice S01–S04, `designs/notes.html`), `docs/api-design/internal/schemas.yaml#/ServiceTokenClaims`, `internal/responses.yaml`, toàn bộ `libs/ts/platform/src/service-auth/` (mã và test), `libs/ts/platform/src/errors/`, `logging/redact.ts`; đối chiếu chéo với bản Python `libs/py/sires_common/src/sires_common/service_auth.py` (PID-00005, đã merge).

Rà bảo mật: `alg` khác ES256 (kể cả `none`, `HS256`) bị chặn hai lớp (`token.ts:107` và `algorithms: ['ES256']` của jose, khóa là KeyObject EC nên không nhầm sang HMAC được); `kid` phải là `ServiceName` rồi mới tra bộ khóa (không có đường prototype); `iss`, `exp` bắt buộc, giới hạn 5 phút + 30 s; `aud` kiểm trong `checkSignerRules`; bộ khóa chỉ nạp từ cấu hình, không tải từ mạng, JWK riêng bị bỏ phần `d` khi dựng khóa công khai; log từ chối chỉ ghi `reason`, logger PID-00001 che trường `*token`, `authorization`; không có so sánh bí mật theo chuỗi; route có guard mà không khai x-callers → 403 (EC09). Không thấy lỗ hổng chặn chức năng.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | P5, EC08, H3; `designs/notes.html` (“token Agent Run có aud là mảng”); ServiceTokenClaims.aud (“Token `act.type = agent` có `aud` là mảng”); nhất quán với PID-00005 | contradicts | MEDIUM | `libs/ts/platform/src/service-auth/token.ts:149` coi `aud` một giá trị của token agent là mảng một phần tử; `guard.spec.ts:234-235` khẳng định token agent `aud = 'planning'` qua (200). Bản Python từ chối cùng token: `service_auth.py:331` (`not isinstance(claims.aud, list)` → 401). Không ghi là lệch ở `report.md` mục 5 hay `self-qc.md` | Token `act.type = agent` có `aud` không phải mảng → `401 invalid_service_token` (ví dụ lý do `audience_mismatch`); sửa test `guard.spec.ts › aud mảng` thành kỳ vọng 401 cho `agentClaims('planning')` |
| G2 | Nguyên tắc: thông báo lỗi không lộ chi tiết kiểm bảo mật; nhất quán với PID-00005 | partial | LOW | `token.ts:75` đưa `detail` theo lý do từ chối (`token.ts:44-60`: “kid không có trong bộ khóa công khai”, “Endpoint x-apr chỉ nhận Researcher do gateway ký”…) vào body 401; Python cố ý không nói lý do (`service_auth.py:54`) | Body 401 không mang lý do cụ thể (lý do chỉ ở log `warn`), hoặc PO chốt cho phép nêu lý do và bản Python theo cùng |
| G3 | `internal/responses.yaml` (ví dụ InvalidServiceToken, CallerNotAllowed) | partial | LOW | `token.ts:75`, `guard.ts:80` không đặt `title` → bộ lọc dùng tiêu đề mặc định theo status (`errors/catalog.ts:104-105`: “Chưa đăng nhập”, “Không được phép”); hợp đồng và bản Python dùng “Token nội bộ không hợp lệ”, “Service không được phép gọi endpoint này” | Truyền `title` theo ví dụ hợp đồng cho hai mã này |
| G4 | Nguyên tắc: khóa không xuất hiện trong log, thông báo lỗi | partial | LOW | `keys.ts:148` `JSON.parse(privateJwk)`: giá trị không phải JSON (ví dụ khóa DER base64 dán nhầm) làm V8 ném lỗi chứa 10 ký tự đầu của giá trị (QC thử trên Node 22: `Unexpected token 'M', "MHcCAQEEIB"... is not valid JSON`), lỗi này đi vào log khởi động. Tương tự `keys.ts:65` với JWKS (khóa công khai, không bí mật) | Bọc `JSON.parse` của `SERVICE_AUTH_PRIVATE_KEY`, ném lỗi chỉ nêu tên biến |
| G5 | `designs/notes.html` (bộ khóa dev “không dùng ở staging hay production”) | partial | LOW | `keys.ts:146-158`: chỉ đặt một trong hai `SERVICE_AUTH_PRIVATE_KEY`, `SERVICE_AUTH_PUBLIC_KEYS` mà có `SERVICE_AUTH_DEV_SEED` thì lặng lẽ dùng seed; chặn seed chỉ dựa vào `NODE_ENV === 'production'` | Cấu hình nửa vời → lỗi khởi động thay vì rơi về seed; cân nhắc chặn seed theo tiêu chí rộng hơn `NODE_ENV` (PO chốt) |
| G6 | EC01, ActorRef | unrequested | LOW | `token.ts:145`: token agent có `act.agentRunId` khác `agentRunId` → 401. Dev đã nêu (self-qc G1). Bản Python không kiểm luật này | PO xác nhận giữ; nếu giữ, ghi cho PID-00005 để hai bản cùng luật |

Không có CRITICAL, HIGH.

### AC

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00003-AC01 | đạt | stub (test đơn vị, HTTP thật trên Fastify) | `token.spec.ts › hết hạn và sai chữ ký (PID-00003-AC01)`; `guard.spec.ts › hết hạn và sai chữ ký qua guard: handler không chạy (PID-00003-AC01)` | CI: `token.spec.ts` 10/10, `guard.spec.ts` 12/12 đạt |
| PID-00003-AC02 | đạt | stub | `guard.spec.ts › service ngoài x-callers (PID-00003-AC02)` | CI đạt |
| PID-00003-AC03 | đạt | stub | `token.spec.ts › sub khác service ký (PID-00003-AC03)` | CI đạt |
| PID-00003-AC04 | đạt | stub | `guard.spec.ts › luật token agent (PID-00003-AC04)`, `› token agent thiếu agentScope (EC01)` | CI đạt |
| PID-00003-AC05 | đạt | stub | `guard.spec.ts › luật x-apr (PID-00003-AC05, NFR-AUTHZ-001-AC01)`, `› researcher không do gateway ký ở x-apr (EC02)` | CI đạt |
| PID-00003-AC06 | đạt | stub (hai app Fastify) | `client.spec.ts › lời gọi đi qua guard (PID-00003-AC06)` | CI: `client.spec.ts` 4/4 đạt |
| PID-00003-AC07 | đạt | stub | `guard.spec.ts › token chuyển tiếp aud orchestration (PID-00003-AC07, EC07)`, `› aud orchestration không do gateway ký (EC11)` | CI đạt |
| PID-00003-AC08 | đạt; EC08 một phần (G1) | stub | `guard.spec.ts › aud mảng (PID-00003-AC08, EC08)`; `token.spec.ts › phát token Agent Run (PID-00003-AC08)` | CI đạt; test đang khẳng định hành vi của G1 |
| NFR-AUTHZ-001-AC01 (phần thư viện) | đạt | stub | `guard.spec.ts › luật x-apr` (token agent hợp lệ bị 401 ở route x-apr) | CI đạt |
| NFR-TRANSIT-001-AC01 | không áp dụng | — | — | Kiểm ở PID-00048, PID-00153 (acceptance.html) |

Edge case EC01–EC11 đều có test đúng tên trong `scope.html`; EC08 xem G1.

### Lệnh đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm nx run @sires/platform:test` | không chạy — máy QC không truy cập được registry npm (không `pnpm install`). CI (job `build` 134657256537, commit `877a361`): 11 file, 68/68 test đạt, gồm `token.spec.ts` 10, `guard.spec.ts` 12, `client.spec.ts` 4 |
| `pnpm nx run sires-common:test` | không chạy — không truy cập PyPI. CI job `build` chạy `sires-common` lint, typecheck, test: đạt |
| `pnpm nx affected -t lint typecheck test build` | không chạy — như trên. CI job `build`: “Successfully ran targets lint, typecheck, test, build for 19 projects and 1 task they depend on” |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: infra, platform, repo`; cảnh báo 2 luồng (infra do `pnpm-workspace.yaml`, `pnpm-lock.yaml` thêm `jose`, quy tắc 1.4.7); exit 0. CI job `tracks`: success |
| `node scripts/docs/add-license.mjs --check` | “0 file chưa có thông báo giấy phép.” |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00003 --result` | “PID-00003: KẾT QUẢ ĐỦ (0 cảnh báo).” |
| `node -e 'JSON.parse("MHcCAQEEIB…")'` (Node 22.23.5) | Thông báo lỗi chứa `"MHcCAQEEIB"...` — bằng chứng G4 |
| `gh api …/commits/877a361…/check-runs` | `tracks` success, `build` success |

### Lệch với Self-QC

- Self-QC ghi EC08 “đã giải quyết” và không có `contradicts`. QC thấy token agent có `aud` một giá trị vẫn qua (G1), trái P5, ghi chú thiết kế, mô tả ServiceTokenClaims và trái bản Python; test `guard.spec.ts:234-235` khẳng định hành vi này.
- Self-QC không nêu G2–G5. G6 trùng self-qc G1. Self-qc G2–G4 (khóa dev cho Python, `sub` gốc của token chuyển tiếp trong x-callers, chạm luồng infra qua catalog) QC đồng ý là LOW, đã đưa sang đề xuất cho PO.
- Kết quả lệnh của Dev (68/68, 19 project) khớp CI; QC không tự chạy được.

### Việc còn lại, theo thứ tự phụ thuộc

1. Token `act.type = agent` có `aud` không phải mảng → 401; sửa test `aud mảng` (G1, P5, EC08).
2. Body 401 không nêu lý do cụ thể, hoặc chờ PO chốt (G2).
3. Đặt `title` theo ví dụ hợp đồng cho `invalid_service_token`, `caller_not_allowed` (G3).
4. Bọc `JSON.parse` của `SERVICE_AUTH_PRIVATE_KEY` để lỗi không chứa giá trị (G4).
5. Cấu hình khóa nửa vời → lỗi khởi động, không rơi về seed (G5).

Việc 2–5 là LOW, có thể làm cùng lần sửa G1 hoặc để sau theo PO.

### Đề xuất cho PO

- **Nhất quán TS–Python (PID-00005, đã merge):** `TokenVerifier` của Python mặc định `clock_skew_seconds = 0` (`service_auth.py:271`, `:318`) trong khi bản TS phát token `exp = iat + 300` đúng giới hạn. Service Python nhận token TS mà đồng hồ chậm hơn bên ký vài mili giây có thể từ chối `ttl_too_long`. Đề xuất PID-00005 lấy cùng lệch 30 s như TS (`SERVICE_TOKEN_CLOCK_TOLERANCE_SECONDS`), hoặc PO chốt một con số chung cho cả hai.
- Cũng cho PID-00005: bản Python chưa có luật `x-apr`, chưa nạp khóa từ biến môi trường và chưa có khóa dev từ seed (self-qc G2 của Dev). Service Python hiện không có route `x-apr`, nhưng chạy cục bộ thì cần chung bộ khóa và tên biến `SERVICE_AUTH_*`.
- Chốt G2 (body 401 có nêu lý do hay không) và G6 (luật `act.agentRunId = agentRunId`) để hai bản cùng hành vi.
- Guard gắn theo controller (`@UseGuards`); controller nội bộ quên gắn guard sẽ không được bảo vệ. Cân nhắc kiểm ở luồng service (PID-00007, PID-00008 khi sinh x-callers) hoặc một test chung cho route `/internal/*`.
- Ghi chú x-callers cho token chuyển tiếp (`gateway`, `agent-core` phải có trong x-callers của route nhận token chuyển tiếp — self-qc G3): QC đồng ý, chuyển cho PID-00065, PID-00007, PID-00008.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
