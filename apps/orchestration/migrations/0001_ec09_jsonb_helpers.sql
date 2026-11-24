-- SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
-- Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
-- SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

-- EC09 (PID-00029; PO 24/11/2026): app.is_actor_ref, app.is_approval_record, app.is_provenance trả false thay vì NULL
-- khi JSON thiếu trường, vì CHECK coi NULL là đạt; trong is_actor_ref, thiếu instance coi như không phải A/B để agent
-- khác analysis vẫn hợp lệ. Văn bản hàm chép nguyên từ docs/database/ddl/00-common.sql để schema dựng từ migration
-- khớp DDL tham chiếu. CREATE OR REPLACE giữ chủ sở hữu, quyền và các CHECK đang dùng hàm.
CREATE OR REPLACE FUNCTION app.is_actor_ref(a jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((a IS NOT NULL AND jsonb_typeof(a) = 'object' AND CASE a->>'type'
    WHEN 'researcher' THEN a ? 'accountId'
    WHEN 'agent' THEN a->>'agent' IN ('orchestrator','discovery','reference_processing','evidence_retrieval',
                                       'synthesis','writing','verification','diagram','analysis')
                      AND a ? 'agentRunId'
                      AND ((a->>'agent' = 'analysis') = COALESCE(a->>'instance' IN ('A','B'), false))
    WHEN 'system' THEN a ? 'component'
    ELSE false END), false)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.is_approval_record(r jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((r IS NULL OR (
    jsonb_typeof(r) = 'object'
    AND r->'approvedBy'->>'type' = 'researcher'
    AND r->>'decision' IN ('approved','rejected','edited_and_approved')
    AND r->>'apr' ~ '^APR-(0[1-9]|10)$'
    AND r ? 'decidedAt' AND r ? 'objectType' AND r ? 'objectId' AND r ? 'objectVersion')), false)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.is_provenance(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((p IS NOT NULL AND jsonb_typeof(p) = 'object'
    AND app.is_actor_ref(p->'createdBy')
    AND jsonb_typeof(p->'inputs') = 'array'
    AND app.is_versioned_refs(p->'inputs')), false)
$$;
