const express = require('express');
const router = express.Router();
const db = require('../db/init');

router.get('/dashboard/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  const compliant = db.prepare("SELECT COUNT(*) AS c FROM products WHERE status = 'COMPLIANT'").get().c;
  const nonCompliant = db.prepare("SELECT COUNT(*) AS c FROM products WHERE status = 'NON_COMPLIANT'").get().c;
  const recent = db.prepare('SELECT id, product_name, status, scanned_at FROM products ORDER BY scanned_at DESC LIMIT 5').all();

  res.json({
    totalScanned: total,
    compliant,
    nonCompliant,
    complianceRate: total ? Math.round((compliant / total) * 100) : 0,
    recentScans: recent
  });
});

module.exports = router;
