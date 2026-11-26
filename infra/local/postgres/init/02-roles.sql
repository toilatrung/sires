-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- Vai trò database theo service, đúng database 3.1–3.3 (PID-00159; PC-05 P15, P26). Chạy bằng superuser sires:
-- entrypoint của image chạy file này sau 01-databases.sql khi volume còn trống; `pnpm local:up` và
-- `pnpm local:roles` chạy lại file trên volume đã có. Chạy lại không đổi: vai trò thiếu thì tạo, thuộc tính và
-- mật khẩu luôn đặt lại theo bảng dưới (sửa cả vai trò Dev tạo tay trước đây).
--
--   sires_<svc>_owner     NOLOGIN, NOBYPASSRLS   chủ database sires_<svc> và mọi đối tượng migration tạo
--   sires_<svc>_migrator  LOGIN, NOBYPASSRLS     thành viên owner, mỗi phiên SET role = owner (H3); lệnh migrate
--   sires_<svc>_app       LOGIN, NOBYPASSRLS     service khi phục vụ request (có RLS)
--   sires_<svc>_system    LOGIN, BYPASSRLS       job hệ thống
--   sires_<svc>_purge     LOGIN, BYPASSRLS       job xóa dữ liệu
--
-- Mọi vai trò: NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, INHERIT. Mật khẩu `sires-local` chỉ cho máy
-- phát triển, không dùng ở staging hay production (Terraform tạo vai trò ở đó, PID-00035). Chỉ vai trò của service
-- kết nối được database của service (database 3.1). Quyền trên bảng do DDL của service cấp (app.grant_standard,
-- database 11.2): file này không cấp quyền bảng. Owner là chủ database nên có CREATE trên database (schema app,
-- replica, extension tin cậy) và trên schema public (PostgreSQL 15+ giao schema public cho pg_database_owner).

\set ON_ERROR_STOP on
SET client_min_messages = warning;

DO $roles$
DECLARE
  -- Khóa service trong tên database và vai trò; agent-core dùng agent_core như DDL agent-core.sql. sandbox-runner,
  -- web không có database (database 3.1).
  services CONSTANT text[] := ARRAY['gateway', 'identity', 'workspace', 'planning', 'orchestration', 'library',
                                    'research', 'manuscript', 'audit', 'agent_core', 'knowledge'];
  kinds CONSTANT text[] := ARRAY['owner', 'migrator', 'app', 'system', 'purge'];
  local_password CONSTANT text := 'sires-local';
  svc text;
  kind text;
  role_name text;
  owner_role text;
  migrator_role text;
  db text;
BEGIN
  FOREACH svc IN ARRAY services LOOP
    owner_role := format('sires_%s_owner', svc);
    migrator_role := format('sires_%s_migrator', svc);

    FOREACH kind IN ARRAY kinds LOOP
      role_name := format('sires_%s_%s', svc, kind);
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('CREATE ROLE %I', role_name);
      END IF;
      EXECUTE format('ALTER ROLE %I NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT %s %s',
        role_name,
        CASE WHEN kind = 'owner' THEN 'NOLOGIN' ELSE 'LOGIN' END,
        CASE WHEN kind IN ('system', 'purge') THEN 'BYPASSRLS' ELSE 'NOBYPASSRLS' END);
      IF kind = 'owner' THEN
        EXECUTE format('ALTER ROLE %I PASSWORD NULL', role_name);
      ELSE
        EXECUTE format('ALTER ROLE %I PASSWORD %L', role_name, local_password);
      END IF;
    END LOOP;

    -- Migrator chạy migration bằng quyền owner: đối tượng do migration tạo thuộc owner (H3, database 3.2).
    EXECUTE format('GRANT %I TO %I', owner_role, migrator_role);
    EXECUTE format('ALTER ROLE %I SET role = %L', migrator_role, owner_role);

    db := format('sires_%s', svc);
    IF EXISTS (SELECT FROM pg_database WHERE datname = db) THEN
      EXECUTE format('ALTER DATABASE %I OWNER TO %I', db, owner_role);
      EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', db);
      -- Bản thử 25/11/2026 (báo cáo PH-01 mục 6) cấp CREATE cho owner; owner là chủ nên lệnh không đổi ACL.
      EXECUTE format('GRANT CREATE ON DATABASE %I TO %I', db, owner_role);
      EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I, %I, %I, %I', db,
        migrator_role, format('sires_%s_app', svc), format('sires_%s_system', svc), format('sires_%s_purge', svc));
    ELSE
      RAISE WARNING 'Chưa có database %: chỉ tạo vai trò, bỏ qua chủ và quyền kết nối', db;
    END IF;
  END LOOP;
END
$roles$;

-- vector 0.8 của image không phải extension tin cậy nên superuser tạo sẵn, chỉ ở sires_knowledge (database 3.3;
-- PC-05 P15). Migration của knowledge gọi CREATE EXTENSION IF NOT EXISTS vector và bỏ qua vì đã có.
SELECT EXISTS (SELECT FROM pg_database WHERE datname = 'sires_knowledge') AS sires_has_knowledge \gset
\if :sires_has_knowledge
\connect sires_knowledge
SET client_min_messages = warning;
CREATE EXTENSION IF NOT EXISTS vector;
\endif
