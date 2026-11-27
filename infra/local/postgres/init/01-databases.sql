-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- One database per service (architecture 3.3, docs/database 3.1). Roles, database owners and CONNECT come from
-- 02-roles.sql (database 3.2, PID-00159), which also creates the untrusted extension vector in sires_knowledge.
-- Schemas and trusted extensions come from each service's migrations, starting from docs/database/ddl/00-common.sql.
CREATE DATABASE sires_gateway;
CREATE DATABASE sires_identity;
CREATE DATABASE sires_workspace;
CREATE DATABASE sires_planning;
CREATE DATABASE sires_orchestration;
CREATE DATABASE sires_library;
CREATE DATABASE sires_research;
CREATE DATABASE sires_manuscript;
CREATE DATABASE sires_audit;
CREATE DATABASE sires_agent_core;
CREATE DATABASE sires_knowledge;
