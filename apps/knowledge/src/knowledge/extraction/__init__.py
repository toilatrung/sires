# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Trích xuất PDF (kiến trúc 7.1 bước 2, 4, 5; 7.2): kiểm PDF (magic bytes, ≤ 50 MB, ≤ 500 trang, có lớp văn bản),
văn bản theo trang và khối đoạn, tách cột, làm sạch header/footer, chuẩn hóa NFC; metadata so với Reference.

Thư viện theo ADR-15: pypdfium2 (văn bản theo trang, phát hiện lớp văn bản) và pdfplumber (tọa độ từ để tách cột,
khối đoạn); số đo ở spike SPK-05 (PID-00028). Ghi `app.source_document` (`extractor_version`). Nội dung: PID-00051.
Khung từ PID-00026 S05: chưa có logic.
"""
