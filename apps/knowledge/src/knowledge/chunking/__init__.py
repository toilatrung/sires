# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Chia chunk (kiến trúc 7.2): gom đoạn liên tiếp tới khoảng 500–800 token, không cắt giữa đoạn, chồng lấn một đoạn;
nhận diện vùng References và phụ lục. Mỗi chunk giữ vị trí ổn định (page, paragraph, char_start, char_end) và
chunk_key = sha256(sourceDocumentId | page | paragraph | char_start).

Ghi `app.chunk` và `app.chunk_text` (tsvector do trigger `chunk_text_tsv` tính). Nội dung: PID-00051.
Khung từ PID-00026 S05: chưa có logic.
"""
