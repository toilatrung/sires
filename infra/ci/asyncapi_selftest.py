# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
from asyncapi_payload import message_errors

ident = "f93a4681-71de-4977-9494-38cf2487877b"
payload = {
    "id": ident,
    "type": "account.created",
    "schemaVersion": 1,
    "producer": "identity",
    "occurredAt": "2026-11-20T00:00:00Z",
    "accountId": ident,
    "aggregate": {"type": "account", "id": ident, "version": 1},
    "data": {"issuer": "fixture"},
}
assert not (errors := message_errors("accountCreated", payload)), errors
del payload["aggregate"]
assert any("aggregate" in error for error in message_errors("accountCreated", payload))
print("AsyncAPI: payload đúng hợp lệ và payload thiếu aggregate bị từ chối.")
