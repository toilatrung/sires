// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

/** PDF tự tạo, không chứa tài liệu bên thứ ba. Bản scan chỉ có image, không có text layer. */
export function samplePdf(kind: 'text' | 'scan', text = 'SIRes synthetic research document'): Buffer {
  const content = kind === 'text'
    ? `BT /F1 12 Tf 30 200 Td (${text.replace(/[^a-zA-Z0-9 .-]/g, ' ')}) Tj ET`
    : 'q 128 0 0 128 30 50 cm /Im1 Do Q';
  const stream = (value: string, extra = '') =>
    `<< /Length ${Buffer.byteLength(value)} ${extra} >>\nstream\n${value}\nendstream`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources ${kind === 'text'
      ? '<< /Font << /F1 5 0 R >> >>' : '<< /XObject << /Im1 5 0 R >> >>'} /Contents 4 0 R >>`,
    stream(content),
    kind === 'text' ? '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
      : stream('FFFFFFFFFF818181FFBDBDBDFF818181FFFFFFFF>',
        '/Type /XObject /Subtype /Image /Width 8 /Height 20 /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /ASCIIHexDecode'),
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
