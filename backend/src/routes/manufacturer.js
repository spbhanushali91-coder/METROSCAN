const express = require('express');
const router = express.Router();

const {
  createLot,
  getLots,
  getLotByNumber,
  updateLot
} = require('../controllers/manufacturerController');

const { requireAuth, requireRole } = require('../middleware/auth');


// Register a new manufacturer lot
// POST /api/manufacturer/lots
router.post(
  '/manufacturer/lots',
   requireRole('MANUFACTURER'),
  createLot
);


// Get all registered manufacturer lots
// GET /api/manufacturer/lots
router.get(
  '/manufacturer/lots',
    requireRole('MANUFACTURER'),
  getLots
);


// Get a specific lot by lot number
// GET /api/manufacturer/lots/:lotNumber
//
// requireAuth is enough here because later the
// verification/scan pipeline may need to look up a lot.
router.get(
  '/manufacturer/lots/:lotNumber',
  requireAuth,
  getLotByNumber
);


// Update an existing manufacturer lot
// PUT /api/manufacturer/lots/:lotNumber
router.put(
  '/manufacturer/lots/:lotNumber',
  requireRole('MANUFACTURER'),
  updateLot
);


module.exports = router;