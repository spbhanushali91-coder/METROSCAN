const db = require('../db/init');
const { analyzeImage } = require('../services/pythonService');
const { generateReport } = require('../services/reportGenerator');
const { verifyAgainstLot } = require('../services/verificationService');


async function scanProduct(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded. Use field name "image".' });
    }

    const productName = req.body.productName || req.file.originalname;
    const imagePath = req.file.path;

    // Call Python OCR + rules microservice
    const analysis = await analyzeImage(imagePath);

   
// analysis shape: { ocr_text, checks: [...], status, violations_count, extracted: {...} }

// ---- Manufacturer verification (additive, does not affect regulatory status) ----
let manufacturerVerification;
const lotNumber = analysis.extracted?.lot_number;

if (!lotNumber) {
  manufacturerVerification = {
    status: 'UNVERIFIED',
    lotNumber: null,
    mismatches: [],
    note: 'Lot/batch number was not detected on the scanned label.'
  };
} else {
  const registeredLot = db.prepare(`
    SELECT * FROM manufacturer_lots WHERE lot_number = ?
  `).get(String(lotNumber).trim().toUpperCase());

  manufacturerVerification = verifyAgainstLot(registeredLot, analysis.extracted);
}

analysis.manufacturerVerification = manufacturerVerification;

    const insert = db.prepare(`
      INSERT INTO products (product_name, image_path, status, violations_count, ocr_text, result_json, scanned_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = insert.run(
      productName,
      imagePath,
      analysis.status,
      analysis.violations_count,
      analysis.ocr_text,
      JSON.stringify(analysis),
      req.header('x-user-name') || 'demo-officer'
    );

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);

    // Pre-generate PDF report so it's ready for instant download
    const reportPath = generateReport(product);
    db.prepare('UPDATE products SET report_path = ? WHERE id = ?').run(reportPath, product.id);
res.json({
  id: product.id,
  productName: product.product_name,
  status: product.status,
  violationsCount: product.violations_count,
  reviewCount: analysis.review_count,
  checks: analysis.checks,
  ocrText: analysis.ocr_text,
  scannedAt: product.scanned_at,
  manufacturerVerification: manufacturerVerification
});
  } catch (err) {
    console.error('Scan failed:', err.message);
    if (err.code === 'ECONNREFUSED') {
      return res.status(502).json({ error: 'OCR service is not reachable. Is ocr-service/app.py running on port 5001?' });
    }
    res.status(500).json({ error: 'Failed to process image', details: err.message });
  }
}

// Add this function in scanController.js, below scanProduct

function exportScanJson(req, res) {
  try {
    const { id } = req.params;
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

    if (!product) {
      return res.status(404).json({ error: 'Scan record not found' });
    }

    const analysis = JSON.parse(product.result_json || '{}');

    const exportPayload = {
      reportMeta: {
        scanId: product.id,
        generatedAt: new Date().toISOString(),
        generatedBy: req.header('x-user-name') || 'demo-officer',
        regulation: 'Legal Metrology (Packaged Commodities) Rules, 2011'
      },
      product: {
        productName: product.product_name,
        scannedAt: product.scanned_at,
        scannedBy: product.scanned_by,
        imagePath: product.image_path
      },
      complianceSummary: {
        overallStatus: product.status,
        violationsCount: product.violations_count,
        reviewCount: analysis.review_count ?? null
      },
      declarationChecklist: (analysis.checks || []).map((c) => ({
        rule: c.rule,
        result: c.pass ? 'PASS' : 'FAIL',
        advisory: !!c.advisory,
        detail: c.detail || ''
      })),
      violations: (analysis.checks || [])
        .filter((c) => !c.pass)
        .map((c) => ({ rule: c.rule, detail: c.detail || 'Non-compliant' })),
      extractedFields: analysis.extracted || {},
      manufacturerVerification: analysis.manufacturerVerification || {
        status: 'NOT_PERFORMED'
      },
      ocrText: analysis.ocr_text || ''
    };

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="scan-${product.id}-report.json"`
    );
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(exportPayload);
  } catch (err) {
    console.error('JSON export failed:', err.message);
    res.status(500).json({ error: 'Failed to export report', details: err.message });
  }
}


function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!product) return res.status(404).json({ error: 'Not found' });

    const result = JSON.parse(product.result_json || '{}');
    const body = req.body || {};

    const productName = typeof body.productName === 'string' && body.productName.trim()
      ? body.productName.trim()
      : product.product_name;

    // --- Update checklist: only 'pass' and 'detail' are editable, not 'rule'/'advisory' ---
    let checks = result.checks || [];
    if (Array.isArray(body.checks)) {
      checks = checks.map((c, i) => {
        const edit = body.checks[i];
        if (!edit) return c;
        return {
          ...c,
          pass: typeof edit.pass === 'boolean' ? edit.pass : c.pass,
          detail: typeof edit.detail === 'string' ? edit.detail : c.detail
        };
      });
    }

    // --- Recompute status from edited checks (same rule as rules_engine.py) ---
    const hard = checks.filter((c) => !c.advisory);
    const violations = hard.filter((c) => !c.pass);
    const advisoryReviews = checks.filter((c) => c.advisory && !c.pass);

    let status;
    if (violations.length) status = 'NON_COMPLIANT';
    else if (advisoryReviews.length) status = 'REVIEW_REQUIRED';
    else status = 'COMPLIANT';

    // --- Update extracted fields ---
    const extracted = { ...(result.extracted || {}) };
    if (body.extracted) {
      if (body.extracted.lot_number !== undefined) {
        extracted.lot_number = body.extracted.lot_number || null;
      }
      if (body.extracted.manufacture_date !== undefined) {
        extracted.manufacture_date = body.extracted.manufacture_date || null;
      }
      if (body.extracted.mrp !== undefined) {
        extracted.mrp = (body.extracted.mrp && body.extracted.mrp.value !== '' && body.extracted.mrp.value != null)
          ? { value: Number(body.extracted.mrp.value), currency: 'INR', raw: String(body.extracted.mrp.value) }
          : null;
      }
      if (body.extracted.net_quantity !== undefined) {
        const nq = body.extracted.net_quantity;
        extracted.net_quantity = (nq && nq.value !== '' && nq.value != null)
          ? { value: Number(nq.value), unit: nq.unit || '', raw: `${nq.value} ${nq.unit || ''}`.trim() }
          : null;
      }
    }

    result.checks = checks;
    result.extracted = extracted;
    result.violations_count = violations.length;
    result.review_count = advisoryReviews.length;
    result.status = status;
    result.editedBy = req.header('x-user-name') || 'demo-officer';
    result.editedAt = new Date().toISOString();
    // manufacturerVerification untouched — cross-check integrity preserved

    db.prepare(`
      UPDATE products
      SET product_name = ?, status = ?, violations_count = ?, result_json = ?
      WHERE id = ?
    `).run(productName, status, violations.length, JSON.stringify(result), id);

    // Regenerate PDF so downloads reflect officer's corrections
    const updatedProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    const reportPath = generateReport(updatedProduct);
    db.prepare('UPDATE products SET report_path = ? WHERE id = ?').run(reportPath, id);

    res.json({ success: true, status, violationsCount: violations.length });
  } catch (err) {
    console.error('Update failed:', err.message);
    res.status(500).json({ error: 'Failed to update product', details: err.message });
  }
}

module.exports = { scanProduct, exportScanJson, updateProduct };
