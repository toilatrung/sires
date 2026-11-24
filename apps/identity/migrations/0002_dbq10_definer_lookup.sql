-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- DBQ-10 — ĐỀ XUẤT phương án (a), chờ PO chốt; khi PO chốt, đoạn này vào docs/database/ddl/identity.sql ngay sau
-- `SELECT app.enable_tenant_rls();` và bỏ PENDING_REFERENCE_PATCHES ở src/db/database.testkit.ts.
--
-- app.find_account_by_identity là SECURITY DEFINER nên chạy bằng sires_identity_owner. Owner không BYPASSRLS
-- (database 3.2) và app.account bị FORCE RLS, nên trước khi có tenant context policy tenant_isolation lọc hết dòng.
-- Policy thứ hai chỉ áp cho owner (TO …, PostgreSQL không xét policy này với vai trò khác), chỉ cho SELECT:
-- _app, _system, _purge không đổi; owner vốn sở hữu bảng (tự tắt được RLS) nên không nhận thêm quyền thực chất.
-- Thành viên của owner (sires_identity_migrator) cũng thấy mọi dòng khi đọc — như owner.
CREATE POLICY definer_lookup ON app.account AS PERMISSIVE FOR SELECT TO sires_identity_owner USING (true);
