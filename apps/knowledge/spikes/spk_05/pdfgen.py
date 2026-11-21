# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Minimal PDF writer for the SPK-05 fixtures and derived samples (no third-party writer needed).

Builds text pages (Helvetica, visible or invisible like an OCR layer), image-only pages (a scan) with an optional
text stamp, and the RC4 40-bit standard security handler (a password-protected PDF, EC01).
"""

from __future__ import annotations

import hashlib
import struct
import zlib
from collections.abc import Sequence
from dataclasses import dataclass, field

A4 = (595.0, 842.0)

# Standard security handler padding (PDF 32000-1, 7.6.3.3, algorithm 2).
_PAD = bytes.fromhex("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A")
_PERMISSIONS = -44  # print, copy and modify allowed; only the open password matters here.


@dataclass(frozen=True)
class Run:
    """One line of text at (x, y) in PDF points, origin bottom-left."""

    x: float
    y: float
    text: str
    size: float = 10.0
    invisible: bool = False  # text render mode 3, as an OCR layer under a scan


@dataclass(frozen=True)
class Image:
    """A grayscale image drawn over the whole page."""

    data: bytes
    width: int
    height: int
    filter: str = "DCTDecode"  # or "FlateDecode" for raw 8-bit gray samples


@dataclass
class Page:
    runs: list[Run] = field(default_factory=list)
    image: Image | None = None
    size: tuple[float, float] = A4
    contents_override: bytes | None = None  # raw (possibly broken) content stream, for limit tests


def _escape(text: str) -> bytes:
    raw = text.encode("cp1252", errors="replace")
    return raw.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")


def _content(page: Page) -> bytes:
    if page.contents_override is not None:
        return page.contents_override
    parts: list[bytes] = []
    if page.image is not None:
        w, h = page.size
        parts.append(f"q {w:.2f} 0 0 {h:.2f} 0 0 cm /Im1 Do Q\n".encode())
    for run in page.runs:
        mode = 3 if run.invisible else 0
        parts.append(
            f"BT {mode} Tr /F1 {run.size:.2f} Tf 1 0 0 1 {run.x:.2f} {run.y:.2f} Tm (".encode()
            + _escape(run.text)
            + b") Tj ET\n"
        )
    return b"".join(parts)


def _rc4(key: bytes, data: bytes) -> bytes:
    s = list(range(256))
    j = 0
    for i in range(256):
        j = (j + s[i] + key[i % len(key)]) % 256
        s[i], s[j] = s[j], s[i]
    out = bytearray()
    i = j = 0
    for byte in data:
        i = (i + 1) % 256
        j = (j + s[i]) % 256
        s[i], s[j] = s[j], s[i]
        out.append(byte ^ s[(s[i] + s[j]) % 256])
    return bytes(out)


def _pad(password: str) -> bytes:
    return (password.encode("latin-1") + _PAD)[:32]


@dataclass(frozen=True)
class _Encryption:
    key: bytes
    owner: bytes
    user: bytes

    @classmethod
    def create(cls, user_password: str, owner_password: str, file_id: bytes) -> _Encryption:
        owner = _rc4(hashlib.md5(_pad(owner_password)).digest()[:5], _pad(user_password))
        key = hashlib.md5(_pad(user_password) + owner + struct.pack("<i", _PERMISSIONS) + file_id).digest()[:5]
        return cls(key=key, owner=owner, user=_rc4(key, _PAD))

    def stream(self, number: int, data: bytes) -> bytes:
        object_key = hashlib.md5(self.key + number.to_bytes(3, "little") + (0).to_bytes(2, "little")).digest()[:10]
        return _rc4(object_key, data)


def build(pages: Sequence[Page], *, user_password: str | None = None, padding: int = 0) -> bytes:
    """Serialise pages into one PDF. `user_password` encrypts it; `padding` adds an unused stream of that many bytes."""
    file_id = hashlib.md5(f"spk05:{len(pages)}:{user_password}".encode()).digest()
    enc = _Encryption.create(user_password, "spk05-owner", file_id) if user_password is not None else None
    objects: dict[int, bytes] = {}

    def stream(number: int, entries: str, data: bytes) -> bytes:
        if enc is not None:
            data = enc.stream(number, data)
        return f"<< {entries} /Length {len(data)} >>\nstream\n".encode() + data + b"\nendstream"

    font, pages_root = 1, 2
    objects[font] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    next_number = 3
    kids: list[int] = []
    for page in pages:
        page_no, content_no = next_number, next_number + 1
        next_number += 2
        xobject = ""
        if page.image is not None:
            image_no = next_number
            next_number += 1
            img = page.image
            objects[image_no] = stream(
                image_no,
                f"/Type /XObject /Subtype /Image /Width {img.width} /Height {img.height} "
                f"/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /{img.filter}",
                img.data,
            )
            xobject = f" /XObject << /Im1 {image_no} 0 R >>"
        objects[content_no] = stream(content_no, "", _content(page))
        w, h = page.size
        objects[page_no] = (
            f"<< /Type /Page /Parent {pages_root} 0 R /MediaBox [0 0 {w:.2f} {h:.2f}] "
            f"/Resources << /Font << /F1 {font} 0 R >>{xobject} >> /Contents {content_no} 0 R >>"
        ).encode()
        kids.append(page_no)
    objects[pages_root] = f"<< /Type /Pages /Kids [{' '.join(f'{k} 0 R' for k in kids)}] /Count {len(kids)} >>".encode()
    catalog = next_number
    objects[catalog] = f"<< /Type /Catalog /Pages {pages_root} 0 R >>".encode()
    next_number += 1
    if padding:
        objects[next_number] = stream(next_number, "", b"\0" * padding)
        next_number += 1
    encrypt_ref = ""
    if enc is not None:
        objects[next_number] = (
            f"<< /Filter /Standard /V 1 /R 2 /O <{enc.owner.hex()}> /U <{enc.user.hex()}> /P {_PERMISSIONS} >>"
        ).encode()
        encrypt_ref = f" /Encrypt {next_number} 0 R"
        next_number += 1

    out = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0] * next_number
    for number in range(1, next_number):
        offsets[number] = len(out)
        out += f"{number} 0 obj\n".encode() + objects[number] + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {next_number}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{offsets[n]:010d} 00000 n \n".encode() for n in range(1, next_number))
    ident = file_id.hex()
    out += (
        f"trailer\n<< /Size {next_number} /Root {catalog} 0 R /ID [<{ident}> <{ident}>]{encrypt_ref} >>\n"
        f"startxref\n{xref}\n%%EOF\n"
    ).encode()
    return bytes(out)


def text_page(lines: Sequence[str], *, size: tuple[float, float] = A4, font_size: float = 10.0) -> Page:
    """One single-column page with the given lines from the top margin down."""
    w, h = size
    leading = font_size * 1.3
    return Page(runs=[Run(72, h - 72 - i * leading, line, font_size) for i, line in enumerate(lines)], size=size)


def two_column_page(
    left: Sequence[str], right: Sequence[str], *, row_major: bool, size: tuple[float, float] = A4
) -> Page:
    """Two columns of lines. `row_major` writes L1, R1, L2, R2 … into the content stream (column order is lost)."""
    w, h = size
    leading = 13.0
    left_runs = [Run(50, h - 72 - i * leading, t) for i, t in enumerate(left)]
    right_runs = [Run(w / 2 + 12, h - 72 - i * leading, t) for i, t in enumerate(right)]
    if not row_major:
        return Page(runs=left_runs + right_runs, size=size)
    runs: list[Run] = []
    for i in range(max(len(left_runs), len(right_runs))):
        runs += left_runs[i : i + 1] + right_runs[i : i + 1]
    return Page(runs=runs, size=size)


def gray_image(width: int, height: int, seed: int = 0) -> Image:
    """A noisy gray raster (Flate, raw samples) standing in for a scanned page in tests."""
    rows = bytearray()
    state = seed or 1
    for _ in range(height):
        for _ in range(width):
            state = (state * 1103515245 + 12345) & 0x7FFFFFFF
            rows.append(200 + (state >> 16) % 56)
    return Image(zlib.compress(bytes(rows)), width, height, "FlateDecode")


def scan_page(
    image: Image, *, stamp: str | None = None, ocr: Sequence[Run] = (), size: tuple[float, float] = A4
) -> Page:
    """An image-only page; `stamp` adds one visible line of text (a download banner), `ocr` an invisible layer."""
    runs = list(ocr)
    if stamp:
        runs.append(Run(36, 18, stamp, 6.5))
    return Page(runs=runs, image=image, size=size)
