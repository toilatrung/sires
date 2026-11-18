# PID-00003 — Báo cáo QC độc lập

**Kết luận mới nhất:** Có thể nghiệm thu — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW (Lần 2, 18/11/2026). G1–G5 của Lần 1 đã đóng, G6 PO giữ; G7–G9 là LOW, không chặn merge PR #34.

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

### Quyết định của PO (18/11/2026)

PO Trịnh Quang Trung chốt trong phiên QC: “G6 giữ, còn lại chốt theo đề xuất của bạn”. Hồ sơ `docs/tickets/issues/PID-00003/` chưa ghi các quyết định này; PO ghi sau (R-01–R-07). Dev làm theo mục này, không chờ hồ sơ.

| Điểm | Quyết định | Ai làm |
| --- | --- | --- |
| G1 (MEDIUM) | **Sửa**: token `act.type = agent` có `aud` không phải mảng → `401 invalid_service_token`; sửa test `guard.spec.ts › aud mảng` (token agent `aud = 'planning'` phải bị từ chối) | Dev PID-00003, Lần 2 |
| G2 | Body 401 **không nêu lý do cụ thể** (như bản Python): `detail` chung; lý do từ chối chỉ ghi ở log mức `warn` (không kèm token) | Dev PID-00003, Lần 2 |
| G3 | Đặt `title` theo ví dụ hợp đồng: `invalid_service_token` → “Token nội bộ không hợp lệ”, `caller_not_allowed` → “Service không được phép gọi endpoint này” | Dev PID-00003, Lần 2 |
| G4 | Bọc `JSON.parse` của `SERVICE_AUTH_PRIVATE_KEY` (và `SERVICE_AUTH_PUBLIC_KEYS`): lỗi chỉ nêu tên biến, không chứa giá trị | Dev PID-00003, Lần 2 |
| G5 | Chỉ đặt một trong `SERVICE_AUTH_PRIVATE_KEY`, `SERVICE_AUTH_PUBLIC_KEYS` → **lỗi khởi động** nêu biến thiếu, không rơi về seed. Giữ tiêu chí chặn seed theo `NODE_ENV === 'production'` | Dev PID-00003, Lần 2 |
| G6 | **Giữ** luật `act.agentRunId` phải bằng `agentRunId` của token agent (khác → 401), cho **cả TS và Python** | TS: đã có. Python: PID-00005 lần sau |
| Lệch đồng hồ | **Chung 30 giây** cho mọi bên kiểm token (TS `SERVICE_TOKEN_CLOCK_TOLERANCE_SECONDS = 30` đã có) | Python: PID-00005 lần sau (`TokenVerifier` mặc định 30 s, áp cho `exp` và giới hạn TTL) |
| Tên biến, định dạng khóa | **Chung tên biến `SERVICE_AUTH_*` của bản TS** cho mọi service: `SERVICE_AUTH_PRIVATE_KEY` (JWK riêng), `SERVICE_AUTH_PUBLIC_KEYS` (JWKS), `SERVICE_AUTH_DEV_SEED` (chỉ cục bộ, test) | Python: PID-00005 lần sau (nạp từ biến môi trường, khóa dev từ seed như TS). PID-00020 (`agent_core.config`, nhánh `agent-core/migration-skeleton`) đổi tên biến `SERVICE_TOKEN_SIGNING_KEY_PEM`, `SERVICE_TOKEN_PUBLIC_KEYS` sang tên trên trước khi QC |
| Body 401 bản Python | Giữ như hiện tại (đã không nêu lý do) | — |
| Guard gắn theo controller | Thêm kiểm chung “mọi route `/internal/*` có guard service-auth” khi sinh và kiểm x-callers | PID-00008 (kiểm lệch spec) — PO ghi vào hồ sơ khi làm rõ |
| x-callers cho token chuyển tiếp | `gateway`, `agent-core` phải có trong x-callers của route nhận token chuyển tiếp (self-qc G3 của Dev) | PID-00065, PID-00007, PID-00008 — PO ghi vào hồ sơ |

Việc của Dev PID-00003 Lần 2: G1 (bắt buộc trước merge), G2–G5; chạy lại lệnh spec mục 6, ghi kết quả thật ở `self-qc.md`, `report.md` Lần 2, đặt `Xong — chờ QC`.

## Lần 2 — 18/11/2026 · spec-converge-skill

Người chạy: agent QC độc lập do PO giao, không mang kết luận của Dev. Mã nguồn: nhánh `platform/ts-service-auth`, commit `da5fec5` (PR #34; Dev ghi lượt sửa ở `report.md`, `self-qc.md` mục “Lần 2”, trạng thái `Xong — chờ QC`; mã sửa ở `1ceecb5`). Nhánh đã chứa `origin/main` (`eb31e4d`); diff của PR so với `main` chỉ gồm `libs/ts/platform/` (README, `package.json`, `src/index.ts`, `src/service-auth/`), `pnpm-workspace.yaml`, `pnpm-lock.yaml` và `agent/execution/PID-00003/`.

Phạm vi đọc: trạng thái hiện tại của toàn bộ `libs/ts/platform/src/service-auth/` (mã và test), `errors/problem.exception.ts`, `errors/problem.filter.ts`, `libs/ts/platform/README.md`; hồ sơ `docs/tickets/issues/PID-00003/` (`specs/index.html`, `acceptance.html`, `scope.html`, `designs/notes.html`); `docs/api-design/internal/schemas.yaml#/ServiceTokenClaims`, `internal/responses.yaml`; đối chiếu `libs/py/sires_common/src/sires_common/service_auth.py` (PID-00005); Lần 1 và mục “Quyết định của PO” ở trên.

Rà bảo mật lần này: kiểm `aud` mảng của token agent đặt sau luật x-apr và trước `includes`, nên chuỗi `aud` không còn lọt qua `String.prototype.includes`; body 401 nay là hằng (cùng một body cho mọi lý do, QC dựng thử 4 lý do); log từ chối vẫn chỉ ghi `reason`; lỗi nạp khóa không giữ `cause`, không trích giá trị (QC thử 8 giá trị sai); cấu hình khóa nửa vời bị chặn kể cả khi có seed; seed vẫn bị chặn khi `NODE_ENV=production`. Không thấy lỗ hổng mới.

### Khoảng trống

| Mã | Nguồn (AC, O, B, nguyên tắc) | Loại | Mức | Bằng chứng (file:dòng) | Việc cần làm |
| --- | --- | --- | --- | --- | --- |
| G1 | P5, EC08, H3; ServiceTokenClaims.aud; quyết định PO G1 | — | đóng | `token.ts:157`: token `act.type = agent` có `aud` không phải mảng → `agent_audience_not_array` (401); nằm sau luật x-apr (`:156`), trước kiểm “mảng chứa service này” (`:158`). Test `guard.spec.ts:238` (`agentClaims('planning')` → 401), `:239` (`['planning']` → 200). QC thử trên bản build: `aud = "planning"` → `agent_audience_not_array`; cùng token ở route x-apr → `apr_actor_not_gateway_researcher`; `aud = []` → `bad_claims`; `issueAgentRunToken` một service vẫn phát mảng và qua. Bỏ dòng 157 thì `'planning'.includes('planning')` trả đúng nên test `:238` lỗi. Nay cùng hành vi bản Python (`service_auth.py:331`) | Không còn |
| G2 | Quyết định PO G2 | — | đóng | `token.ts:82-84`: `toInvalidServiceToken` chỉ đặt `title`, `cause`; bộ lọc chỉ đưa `detail` khi có (`errors/problem.filter.ts:64`). QC dựng body cho `missing`, `bad_signature`, `agent_audience_not_array`, `apr_actor_not_gateway_researcher`: cả bốn giống hệt `{type, title, status, code, correlationId}`. Lý do chỉ ở log `warn` (`guard.ts:76`). `expect401` kiểm `not.toHaveProperty('detail')` cho mọi ca 401 (`guard.spec.ts:96`) | Không còn (chú thích cũ: G7) |
| G3 | `internal/responses.yaml` | — | đóng | `token.ts:76` “Token nội bộ không hợp lệ”, `guard.ts:31` “Service không được phép gọi endpoint này”, khớp ví dụ hợp đồng (`responses.yaml:16`, `:29`). Test `guard.spec.ts:95`, `:120` | Không còn |
| G4 | Quyết định PO G4; nguyên tắc khóa không vào log | — | đóng | `keys.ts:168-174`: mọi lỗi dựng khóa riêng (JSON, JWK, đường cong) thành lỗi chỉ nêu `SERVICE_AUTH_PRIVATE_KEY`, không giữ `cause`; `keys.ts:176-182` bọc `JSON.parse` của `SERVICE_AUTH_PUBLIC_KEYS`. QC thử 8 giá trị sai (DER base64, PEM, số JSON, JWK có `d` sai, JWK P-384, JWKS không phải JSON, `null`, `{"keys":[null]}`): không thông báo, stack nào chứa giá trị hay `d`. Test `token.spec.ts:214-229` | Không còn (lỗi cấu trúc JWKS không nêu tên biến: G9) |
| G5 | Quyết định PO G5 | — | đóng | `keys.ts:149-153`: chỉ một trong hai biến khóa → “service auth keys incomplete: <biến> is missing”, kể cả khi có `SERVICE_AUTH_DEV_SEED`; biến rỗng coi như chưa đặt (cả hai rỗng + seed → dùng seed, đúng ý “chưa cấu hình khóa”). Seed bị chặn khi `NODE_ENV=production` (`:156`), như PO giữ. Test `token.spec.ts:206-213`, `:230-232` | Không còn |
| G6 | Quyết định PO G6 | — | đóng (PO giữ) | `token.ts:153` không đổi. Phần Python thuộc PID-00005 | Không còn ở PID này |
| G7 | Quyết định PO G2 | partial | LOW | `token.ts:26`: chú thích của `ServiceTokenFailure` vẫn ghi lý do “Logged and returned as `detail`”, trái hành vi mới (`token.ts:78-84`); `FAILURE_DETAIL` (`:45`) nay chỉ là thông điệp lỗi nội bộ | Sửa chú thích (lý do chỉ ghi log, không trả trong body); không đổi hành vi |
| G8 | Nguyên tắc như G2 Lần 1; nhất quán với PID-00005 | partial | LOW | `guard.ts:85`: body `403 caller_not_allowed` có `detail` (“Endpoint chưa khai x-callers” hoặc “<sub> không có trong x-callers”); bản Python không có `detail` (`service_auth.py:59-62`), ví dụ hợp đồng cũng không (`responses.yaml:27-31`). Chỉ service đã có token hợp lệ mới thấy, rủi ro thấp; quyết định PO G2 chỉ nói body 401 | PO chốt: bỏ `detail` của 403 (log `warn` ở `guard.ts:82` đã đủ) hay giữ và ghi cho PID-00005 |
| G9 | Quyết định PO G4 (“lỗi chỉ nêu tên biến”) | partial | LOW | `keys.ts:183` gọi `servicePublicKeysFromJwks` ngoài khối bọc: `SERVICE_AUTH_PUBLIC_KEYS` là JSON hợp lệ nhưng sai dạng thì lỗi không nêu tên biến — `null` → “servicePublicKeysFromJwks: expected {"keys": [...]}” (`:66`), `{"keys":[null]}` → “Cannot read properties of null (reading 'kid')” (`:68-69`). Không lộ giá trị (JWKS là khóa công khai), chỉ khó chẩn đoán | Nêu `SERVICE_AUTH_PUBLIC_KEYS` trong lỗi cấu trúc JWKS; từ chối phần tử không phải object bằng thông báo rõ |

Không có CRITICAL, HIGH, MEDIUM.

### AC

Rà lại toàn bộ AC, EC trên mã hiện tại: lần sửa chỉ đổi `token.ts`, `guard.ts`, `keys.ts` và test tương ứng; không AC nào hỏng. Mọi test có tên trong `acceptance.html`, `scope.html` vẫn có (token 10, guard 12, client 4).

| AC | Trạng thái | Mức kiểm | Test | Kết quả lệnh |
| --- | --- | --- | --- | --- |
| PID-00003-AC01 | đạt | stub (test đơn vị, HTTP thật trên Fastify) | `token.spec.ts › hết hạn và sai chữ ký (PID-00003-AC01)`; `guard.spec.ts › hết hạn và sai chữ ký qua guard: handler không chạy (PID-00003-AC01)` | Tại chỗ và CI: `token.spec.ts` 10/10, `guard.spec.ts` 12/12 |
| PID-00003-AC02 | đạt | stub | `guard.spec.ts › service ngoài x-callers (PID-00003-AC02)` (nay kiểm cả `title` 403) | Đạt |
| PID-00003-AC03 | đạt | stub | `token.spec.ts › sub khác service ký (PID-00003-AC03)` | Đạt |
| PID-00003-AC04 | đạt | stub | `guard.spec.ts › luật token agent (PID-00003-AC04)`, `› token agent thiếu agentScope (EC01)` | Đạt |
| PID-00003-AC05 | đạt | stub | `guard.spec.ts › luật x-apr (PID-00003-AC05, NFR-AUTHZ-001-AC01)`, `› researcher không do gateway ký ở x-apr (EC02)` | Đạt |
| PID-00003-AC06 | đạt | stub (hai app Fastify) | `client.spec.ts › lời gọi đi qua guard (PID-00003-AC06)` | Tại chỗ và CI: `client.spec.ts` 4/4 |
| PID-00003-AC07 | đạt | stub | `guard.spec.ts › token chuyển tiếp aud orchestration (PID-00003-AC07, EC07)`, `› aud orchestration không do gateway ký (EC11)` | Đạt |
| PID-00003-AC08 | đạt; EC08 nay đạt đủ (G1 đóng) | stub | `guard.spec.ts › aud mảng (PID-00003-AC08, EC08)`; `token.spec.ts › phát token Agent Run (PID-00003-AC08)` | Đạt |
| NFR-AUTHZ-001-AC01 (phần thư viện) | đạt | stub | `guard.spec.ts › luật x-apr` (token agent hợp lệ bị 401 ở route x-apr) | Đạt |
| NFR-TRANSIT-001-AC01 | không áp dụng | — | — | Kiểm ở PID-00048, PID-00153 (acceptance.html) |

Edge case EC01–EC11: 11/11 có test đúng tên trong `scope.html`, đều đạt.

### Lệnh đã chạy

Máy PO, Windows 11, Node 24.21.0, pnpm 10.34.9; Docker trong WSL (`DOCKER_HOST=tcp://localhost:2375`). Chạy trong worktree checkout ở `da5fec5`.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | Đạt: 881 gói, không đổi lockfile |
| `pnpm nx run @sires/platform:test --skip-nx-cache` | Đạt: 11 file, 68/68 test (`token.spec.ts` 10, `guard.spec.ts` 12, `client.spec.ts` 4; test tenancy chạy PostgreSQL thật qua Testcontainers) |
| `pnpm nx run-many -t lint typecheck build -p @sires/platform --skip-nx-cache` | Đạt (kèm `@sires/contracts:generate-ts`, `:build`) |
| `pnpm nx affected -t lint typecheck test build --base=origin/main` | 19 project. Mọi tác vụ của 15 project TS đạt. 9 tác vụ Python lỗi vì môi trường: `uv run` không chạy được `ruff`, `mypy`, `pytest` trong `.venv` (Smart App Control của máy chặn) — `sires-common` lint/typecheck/test, `agent-core` lint/typecheck, `knowledge` lint/typecheck, `eval` lint/typecheck. PR không chạm mã Python. CI job `build` 134715393434 trên `da5fec5`: “Successfully ran targets lint, typecheck, test, build for 19 projects and 2 tasks they depend on”, gồm `sires-common:test` 79 passed |
| `pytest` của `sires-common` qua trình thông dịch gốc của uv (nạp `site-packages` của `.venv`, cách vòng qua chặn của máy), 4 lần | 3 lần 79/79 đạt; 1 lần lỗi `tests/test_messaging.py::test_envelope_and_rollback` (`:215`, thứ tự outbox ra `['audit', 'event']`) — test chập chờn của PID-00005, không liên quan PID này (xem đề xuất) |
| `ruff check .` của `sires-common` (cùng cách vòng) | “All checks passed!” |
| Thử hành vi trên bản build `libs/ts/platform/dist` bằng script đọc nằm ngoài repo (không sửa mã) | Kết quả ghi ở G1, G2, G4, G5, G9 và đề xuất (khóa riêng không khớp JWKS) |
| `node scripts/development/check-tracks.mjs --base origin/main` | `tracks touched: infra, platform, repo`; cảnh báo 2 luồng (`infra` do `pnpm-workspace.yaml`, `pnpm-lock.yaml` thêm `jose`, quy tắc 1.4.7, như Lần 1); exit 0. CI job `tracks` 134715393814: success |
| `node agent/skills/dev/spec-execution-skill/scripts/check-pid.mjs PID-00003 --result` | “PID-00003: KẾT QUẢ ĐỦ (0 cảnh báo).”, trạng thái `Xong — chờ QC` |
| `node scripts/docs/add-license.mjs --check` | “0 file chưa có thông báo giấy phép.” (sau khi xoá `.pytest_cache`, `.ruff_cache` do chính lượt QC này tạo khi chạy pytest, ruff) |
| `node scripts/docs/update-index.mjs --check` | Khớp: 159 PID, taskboard, `docs/index.html` |
| `gh api …/commits/da5fec5…/check-runs`; `gh pr view 34` | `tracks` success, `build` success; PR `MERGEABLE`, `mergeStateStatus = BLOCKED` theo ruleset `protect-main-develop`, `reviewDecision` trống |
| Thử phá mã (tắt từng sửa đổi) | không chạy — QC không sửa mã. Đọc test thay: mỗi sửa G1–G5 có ít nhất một kiểm sẽ lỗi khi gỡ (G1 `guard.spec.ts:238`; G2 `:96`; G3 `:95`, `:120`; G4 `token.spec.ts:227-228` với giá trị không phải JSON; G5 `:208-213`) |

### Lệch với Self-QC

- Kết luận khớp: QC cũng thấy G1–G5 đã sửa, G6 giữ, không còn CRITICAL, HIGH.
- Dẫn chứng dòng lệch nhẹ: `report.md`, `self-qc.md` Lần 2 ghi G1 ở `token.ts:147` (đó là dòng khai báo `checkSignerRules`; kiểm nằm ở `:157`), G6 ở `token.ts:147` (thực tế `:153`). Không ảnh hưởng kết luận.
- Self-QC ghi `nx affected` 19 project đạt: khớp CI; tại chỗ QC chỉ xác nhận được phần TS (phần Python lỗi môi trường, ghi ở trên).
- Self-QC khai thử phá mã 6/6 có test bắt: QC không tái hiện bằng lệnh, chỉ xác nhận bằng đọc test (bảng lệnh).
- Self-QC không nêu G7–G9.

### Việc còn lại, theo thứ tự phụ thuộc

Không có việc bắt buộc trước merge. Việc LOW, Dev làm cùng PR này hoặc để PR sau theo PO:

1. Sửa chú thích `token.ts:26` cho đúng hành vi body 401 không nêu lý do (G7, quyết định PO G2).
2. Lỗi cấu trúc `SERVICE_AUTH_PUBLIC_KEYS` nêu tên biến (G9, quyết định PO G4).
3. Bỏ hoặc giữ `detail` của 403 sau khi PO chốt (G8).

### Đề xuất cho PO

- Có thể merge PR #34 và nghiệm thu PID-00003: 0 CRITICAL, 0 HIGH, 0 MEDIUM; CI `tracks`, `build` đạt trên `da5fec5`. GitHub báo PR `BLOCKED` theo ruleset (chưa có review), PO duyệt hoặc dùng quyền bypass khi merge.
- Chốt G8 (body 403 có `detail` hay không) để TS và Python cùng hành vi; nếu giữ thì ghi cho PID-00005.
- Hồ sơ `docs/tickets/issues/PID-00003/` vẫn chưa ghi các quyết định 18/11/2026 (G2 body 401, G3 title, G4, G5, G6); PO ghi khi tiện (R-01–R-07), kèm các việc đã giao cho PID-00005, PID-00008, PID-00065, PID-00007, PID-00020.
- Kiểm khởi động không có trong hồ sơ, PO cân nhắc cho PID-00035 hoặc PID sau: (1) khóa riêng không khớp mục `kid = <service>` của JWKS hiện vẫn khởi động bình thường và mọi lời gọi đi bị bên nhận từ chối `bad_signature` (QC thử); (2) JWKS chứa JWK riêng (có `d`) được nhận lặng lẽ, phần `d` bị bỏ — an toàn khi kiểm nhưng che lỗi cấu hình làm lộ khóa riêng vào cấu hình dùng chung.
- PID-00005: `tests/test_messaging.py:215` chập chờn (1/4 lần tại chỗ) vì `_outbox_rows` sắp `ORDER BY created_at, id` (`:113`) mà `app.outbox.created_at` là `DEFAULT now()` (`docs/database/ddl/00-common.sql:186`, thời điểm bắt đầu giao dịch), nên hai dòng ghi trong cùng giao dịch trùng `created_at` và thứ tự rơi vào `id`. Đề xuất sửa ở lượt sau của PID-00005 để CI không đỏ ngẫu nhiên.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../../LICENSES.md).
