# CI của SIRes

`changes` chọn chế độ lọc cho PR vào `develop` và chạy toàn bộ cho các nhánh đích khác, push vào `main`, thay đổi file dùng chung hoặc thiếu merge-base. Để thử một đường dẫn cục bộ từ gốc repo trong PowerShell, chạy:

```powershell
'apps/gateway/src/main.ts' | node scripts/development/ci-changes.mjs --event pull_request --target develop --stdin
```

| Nhóm | Job |
| --- | --- |
| Tất cả lần chạy | `docs`, `secrets`, `changes`, `build` |
| PR | `tracks` |
| Project TS hoặc Python bị ảnh hưởng | `typescript` hoặc `python` |
| Hợp đồng API | `contracts` và các project TS phụ thuộc contracts |
| Lock file hoặc manifest | `dependencies` |
| Service có deploy values hoặc Dockerfile tương ứng | `images` |
| Project bị ảnh hưởng | `contract-test` và `asyncapi-payload` |

Gitleaks dùng bộ luật mặc định và chế độ che giá trị. Nếu fixture cần ngoại lệ, thêm phạm vi đường dẫn cụ thể và lý do vào `gitleaks.toml`. Đối với Trivy, `dependency-exceptions.json` nhận mục có `id` của cảnh báo, `package` và `reason` để PO duyệt.

## Đăng ký kiểm hợp đồng

- Khai target Nx `contract-test` trong project. Target khởi động và chờ service thử trên loopback, chuẩn bị dữ liệu và token thử trong project, rồi gọi `uv run --locked python infra/ci/openapi_contract.py <service> http://127.0.0.1:<port>` từ gốc repo. Thêm tùy chọn Schemathesis để chọn operation và gửi header thử. Target chịu trách nhiệm dừng service sau lần chạy.
- Khai target Nx `asyncapi-payload` trong project. Cất file JSON mẫu trong project và gọi `uv run --locked --all-packages python infra/ci/asyncapi_payload.py <components.messages key> <fixture.json>` từ gốc repo cho từng mẫu.
- Mỗi target cần truyền mã thoát của công cụ về Nx. CI chạy tự kiểm fixture kể cả khi chưa project nào khai target.

Ví dụ cấu hình `targets` trong `project.json` của service:

```json
{
  "contract-test": {
    "executor": "nx:run-commands",
    "options": {
      "command": "node apps/identity/tests/run-contract.mjs"
    }
  },
  "asyncapi-payload": {
    "executor": "nx:run-commands",
    "options": {
      "command": "uv run --locked --all-packages python infra/ci/asyncapi_payload.py accountCreated apps/identity/tests/fixtures/account-created.json"
    }
  }
}
```

Trong ví dụ, service tự cung cấp script khởi động fixture và file payload mẫu ở các đường dẫn trên.

## Số đo

Chạy `node infra/ci/measure.mjs` với GitHub CLI đã đăng nhập để đếm mẫu và tính p95 cộng 20% khi mỗi loại đủ 20 lần chạy.

---

<!-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 -->
SIRes — Copyright © 2026 The eTroy development team · eTroy One platform. Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited. See [LICENSES.md](../../LICENSES.md).
