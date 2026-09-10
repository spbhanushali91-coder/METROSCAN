const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const reportsDir = path.join(__dirname, '..', '..', 'reports');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

/**
 * Generates a PDF compliance report for a scanned product record.
 * @param {object} product - row from products table (id, product_name, status, result_json, scanned_at, image_path)
 * @returns {string} absolute path to generated PDF
 */
function generateReport(product) {
  const result = JSON.parse(product.result_json || '{}');
  const filePath = path.join(reportsDir, `report-${product.id}.pdf`);
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(fs.createWriteStream(filePath));

  // Header
  doc.fontSize(18).fillColor('#1a1a1a').text('Legal Metrology Compliance Report', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#555').text('Legal Metrology (Packaged Commodities) Rules, 2011', { align: 'center' });
  doc.moveDown(1.5);

  // --- Product info (left) + Image thumbnail (right), side by side ---
  const blockStartY = doc.y;
  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.width - doc.page.margins.right;
  const usableWidth = pageRight - pageLeft;

  const thumbMaxSize = 130;           // small thumbnail, not full-width
  const textColumnWidth = usableWidth - thumbMaxSize - 20; // 20px gap

  // Left column: product details
  doc.fontSize(11).fillColor('#000');
  doc.text(`Product Name: ${product.product_name || 'N/A'}`, pageLeft, blockStartY, { width: textColumnWidth });
  doc.text(`Scan ID: ${product.id}`, { width: textColumnWidth });
  doc.text(`Scanned At: ${product.scanned_at}`, { width: textColumnWidth });
  doc.text(`Scanned By: ${product.scanned_by || 'demo-officer'}`, { width: textColumnWidth });
  doc.moveDown(0.5);

const statusColor = product.status === 'COMPLIANT' ? '#0a7d2c'
  : product.status === 'REVIEW_REQUIRED' ? '#b45309'
  : '#b30000';  doc.fontSize(13).fillColor(statusColor).text(`Overall Status: ${product.status}`, { width: textColumnWidth, underline: true });
  const textBlockEndY = doc.y;

  // Right column: small image thumbnail, top-right aligned
  let imageBlockEndY = blockStartY;
  if (product.image_path && fs.existsSync(product.image_path)) {
    try {
      const img = doc.openImage(product.image_path);
      const scale = Math.min(thumbMaxSize / img.width, thumbMaxSize / img.height, 1);
      const renderWidth = img.width * scale;
      const renderHeight = img.height * scale;
      const imgX = pageRight - renderWidth; // right-aligned
      doc.image(product.image_path, imgX, blockStartY, {
        width: renderWidth,
        height: renderHeight
      });
      imageBlockEndY = blockStartY + renderHeight;

      doc.fontSize(7).fillColor('#888')
        .text('Scanned label evidence', imgX, imageBlockEndY + 3, { width: renderWidth, align: 'center' });
      imageBlockEndY += 14;
    } catch (imgErr) {
      doc.fontSize(8).fillColor('#b30000').text('(Image error)', pageRight - thumbMaxSize, blockStartY, { width: thumbMaxSize });
      imageBlockEndY = blockStartY + 20;
    }
  }

  // Move cursor below whichever column is taller — prevents overlap either way
  doc.y = Math.max(textBlockEndY, imageBlockEndY);
  doc.x = pageLeft;
  doc.fillColor('#000').fontSize(11);
  doc.moveDown(1.5);
  // --- END side-by-side block -----------------------------------------

  // Declarations table
  doc.fontSize(13).text('Declaration Checklist', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10);

  const checks = result.checks || [];
  checks.forEach((c) => {
    const mark = c.pass ? 'PASS' : 'FAIL';
    const color = c.pass ? '#0a7d2c' : '#b30000';
    doc.fillColor('#000').text(`${c.rule}: `, { continued: true });
    doc.fillColor(color).text(mark, { continued: true });
    doc.fillColor('#333').text(`  — ${c.detail || ''}`);
    doc.moveDown(0.2);
  });

  doc.moveDown(1);
  doc.fillColor('#000').fontSize(13).text('Violations Summary', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10);
  const violations = checks.filter((c) => !c.pass);
  if (violations.length === 0) {
    doc.fillColor('#0a7d2c').text('No violations found. Product label meets checked declarations.');
  } else {
    violations.forEach((v, i) => {
      doc.fillColor('#b30000').text(`${i + 1}. ${v.rule} — ${v.detail || 'Non-compliant'}`);
    });
  }

  doc.moveDown(1.5);
doc.fillColor('#000').fontSize(13).text('Manufacturer Verification', { underline: true });
doc.moveDown(0.5);
doc.fontSize(10);

const mv = result.manufacturerVerification;

if (!mv) {
  doc.fillColor('#888').text('Manufacturer verification was not performed for this scan.');
} else if (mv.status === 'VERIFIED') {
  doc.fillColor('#0a7d2c').text(`VERIFIED — Lot ${mv.lotNumber}`);
  doc.fillColor('#333').fontSize(9);
  doc.text(`Registered to: ${mv.registered?.manufacturerName || 'N/A'}`);
  doc.text(`Fields cross-checked: ${(mv.comparable || []).join(', ') || 'none'}`);
} else if (mv.status === 'MISMATCH') {
  doc.fillColor('#b30000').text(`MISMATCH — Lot ${mv.lotNumber}`);
  doc.fillColor('#333').fontSize(9);
  doc.text(`Registered to: ${mv.registered?.manufacturerName || 'N/A'}`);
  doc.moveDown(0.3);
  (mv.mismatches || []).forEach((m) => {
    doc.fillColor('#b30000').text(
      `${m.field}: Registered = ${m.registered}   |   Scanned = ${m.scanned}`
    );
  });
} else if (mv.status === 'UNREGISTERED') {
  doc.fillColor('#b45309').text(`LOT NOT REGISTERED — Lot ${mv.lotNumber || 'N/A'}`);
  doc.fillColor('#333').fontSize(9).text(
    mv.note || 'This lot could not be matched with the manufacturer registry.'
  );
} else {
  doc.fillColor('#888').text('UNVERIFIED');
  doc.fontSize(9).text(
    mv.note || 'Lot/batch number was not detected on the scanned label.'
  );
}

doc.fontSize(10).fillColor('#000');
  doc.moveDown(1.5);
  doc.fillColor('#000').fontSize(13).text('Extracted Label Text (OCR)', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor('#333').text(result.ocr_text || 'N/A', { width: 500 });

  doc.moveDown(1.5);
  doc.fontSize(8).fillColor('#888').text(
    'This report is auto-generated by an automated scanning system and is intended to assist ' +
    'enforcement review. Final determination of compliance should be made by an authorized officer.',
    { align: 'center' }
  );

  doc.end();
  return filePath;
}

module.exports = { generateReport };
