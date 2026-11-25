# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Embedding theo tài khoản (kiến trúc 7.3; DEC-31): gọi theo lô bằng Provider Connection (key) của người dùng qua
Model Gateway, model của tài khoản (`replica.account_embedding`); vector tách bảng theo model
(`vec.emb_<slug>`, danh mục `app.embedding_model_catalog`, thêm model = revision mới; danh mục MVP chờ DBQ-05);
usage ghi `app.embedding_usage`. Nhúng lại khi đổi model (INT-VECTOR-003) từ văn bản chunk đã lưu.

Nội dung: PID-00077. Khung từ PID-00026 S05: chưa có logic.
"""
