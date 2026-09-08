const db = require('../db/init');
const { analyzeImage } = require('../services/pythonService');
const { generateReport } = require('../services/reportGenerator');

async function scanProduct(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded. Use field name "image".' });
    }

    const productName = req.body.productName || req.file.originalname;
    const imagePath = req.file.path;

    // Call Python OCR + rules microservice
    const analysis = await analyzeImage(imagePath);
    // analysis shape: { ocr_text, checks: [{rule, pass, detail}], status, violations_count }

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
      checks: analysis.checks,
      ocrText: analysis.ocr_text,
      scannedAt: product.scanned_at
    });
  } catch (err) {
    console.error('Scan failed:', err.message);
    if (err.code === 'ECONNREFUSED') {
      return res.status(502).json({ error: 'OCR service is not reachable. Is ocr-service/app.py running on port 5001?' });
    }
    res.status(500).json({ error: 'Failed to process image', details: err.message });
  }
}

module.exports = { scanProduct };
