# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Truy xuất lai (kiến trúc 7.4, 7.5): phạm vi bắt buộc lọc theo tài khoản, project và reference (account_id,
project_id từ token nội bộ; reference_id từ bản sao `replica.project_reference_scope`, `replica.reference_state`,
không nhận từ model — INT-VECTOR-001); nhánh vector theo cosine (quét chính xác hoặc HNSW, ngưỡng do SPK-04 đo),
nhánh từ khóa trên `app.chunk_text.tsv`, gộp RRF; đọc chunk và kiểm tra quote có thật trong chunk.

Nội dung: PID-00093. Khung từ PID-00026 S05: chưa có logic.
"""
