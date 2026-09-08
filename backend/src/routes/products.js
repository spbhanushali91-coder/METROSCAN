const express = require('express');
const router = express.Router();
const db = require('../db/init');
const upload = require('../middleware/upload');
const { scanProduct } = require('../controllers/scanController');
const { requireRole } = require('../middleware/auth');

// POST /api/scan - upload + analyze
router.post('/scan', requireRole('ENFORCEMENT_OFFICER', 'ADMIN'), upload.single('image'), scanProduct);

// GET /api/products - list all (for dashboard / search)
router.get('/products', (req, res) => {
  const { status, search } = req.query;
  let query = 'SELECT id, product_name, status, violations_count, scanned_at FROM products WHERE 1=1';
  const params = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    query += ' AND product_name LIKE ?';
    params.push(`%${search}%`);
  }
  query += ' ORDER BY scanned_at DESC';

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

router.get('/products/export/csv', (req, res) => {
  const { status, search } = req.query;
  let query = 'SELECT id, product_name, status, violations_count, scanned_at, scanned_by FROM products WHERE 1=1';
  const params = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    query += ' AND product_name LIKE ?';
    params.push(`%${search}%`);
  }
  query += ' ORDER BY scanned_at DESC';

  const rows = db.prepare(query).all(...params);

  // Escape CSV field: wrap in quotes if it contains comma/quote/newline, and escape inner quotes
  const escapeCsv = (val) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = ['ID', 'Product Name', 'Status', 'Violations Count', 'Scanned At', 'Scanned By'];
  const lines = [headers.join(',')];

  rows.forEach((r) => {
    lines.push([
      r.id,
      escapeCsv(r.product_name || 'Untitled'),
      r.status,
      r.violations_count,
      r.scanned_at,
      escapeCsv(r.scanned_by || '')
    ].join(','));
  });

  const csvContent = lines.join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="compliance-scans-${Date.now()}.csv"`);
  res.send(csvContent);
});



// GET /api/products/:id - full detail
router.get('/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json({
    ...product,
    result_json: JSON.parse(product.result_json || '{}')
  });
});

// GET /api/products/:id/report - download PDF
router.get('/products/:id/report', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product || !product.report_path) return res.status(404).json({ error: 'Report not found' });
  res.download(product.report_path, `compliance-report-${product.id}.pdf`);
});



module.exports = router;
