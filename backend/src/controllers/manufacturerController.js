const db = require('../db/init');

/**
 * POST /api/manufacturer/lots
 *
 * Register a manufacturer lot/batch with its authoritative
 * declaration values.
 */
function createLot(req, res) {
  try {
    const {
      lotNumber,
      productName,
      manufacturerName,
      manufacturerAddress,
      netQuantity,
      mrp,
      manufactureDate,
      consumerCare,
      countryOfOrigin
    } = req.body;

    // Required fields
    if (!lotNumber || !productName) {
      return res.status(400).json({
        error: 'lotNumber and productName are required.'
      });
    }

    const normalizedLotNumber = String(lotNumber).trim().toUpperCase();

    // Prevent duplicate lot registration
    const existingLot = db.prepare(`
      SELECT id
      FROM manufacturer_lots
      WHERE lot_number = ?
    `).get(normalizedLotNumber);

    if (existingLot) {
      return res.status(409).json({
        error: 'This lot number is already registered.',
        lotNumber: normalizedLotNumber
      });
    }

    const insert = db.prepare(`
      INSERT INTO manufacturer_lots (
        lot_number,
        product_name,
        manufacturer_name,
        manufacturer_address,
        net_quantity,
        mrp,
        manufacture_date,
        consumer_care,
        country_of_origin,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = insert.run(
      normalizedLotNumber,
      String(productName).trim(),
      manufacturerName || null,
      manufacturerAddress || null,
      netQuantity || null,
      mrp || null,
      manufactureDate || null,
      consumerCare || null,
      countryOfOrigin || null,
      req.user?.username || 'unknown'
    );

    const lot = db.prepare(`
      SELECT *
      FROM manufacturer_lots
      WHERE id = ?
    `).get(info.lastInsertRowid);

    return res.status(201).json({
      message: 'Manufacturer lot registered successfully.',
      lot
    });

  } catch (err) {
    console.error('Create manufacturer lot failed:', err.message);

    return res.status(500).json({
      error: 'Failed to register manufacturer lot.',
      details: err.message
    });
  }
}


/**
 * GET /api/manufacturer/lots
 *
 * Returns all registered manufacturer lots.
 */
function getLots(req, res) {
  try {
    const { search } = req.query;

let query = `
  SELECT *
  FROM manufacturer_lots
  WHERE created_by = ?
`;

const params = [req.user.username];

   

   if (search) {
  query += `
    AND (
      lot_number LIKE ?
      OR product_name LIKE ?
      OR manufacturer_name LIKE ?
    )
  `;

  const searchValue = `%${search}%`;

  params.push(
    searchValue,
    searchValue,
    searchValue
  );
}

    query += `
      ORDER BY created_at DESC
    `;

    const lots = db.prepare(query).all(...params);

    return res.json(lots);

  } catch (err) {
    console.error('Get manufacturer lots failed:', err.message);

    return res.status(500).json({
      error: 'Failed to fetch manufacturer lots.',
      details: err.message
    });
  }
}


/**
 * GET /api/manufacturer/lots/:lotNumber
 *
 * Fetch one authoritative manufacturer declaration.
 */
function getLotByNumber(req, res) {
  try {
    const normalizedLotNumber = String(req.params.lotNumber)
      .trim()
      .toUpperCase();

    const lot = db.prepare(`
      SELECT *
      FROM manufacturer_lots
      WHERE lot_number = ?
    `).get(normalizedLotNumber);

    if (!lot) {
      return res.status(404).json({
        error: 'Manufacturer lot not found.',
        lotNumber: normalizedLotNumber
      });
    }

    return res.json(lot);

  } catch (err) {
    console.error('Get manufacturer lot failed:', err.message);

    return res.status(500).json({
      error: 'Failed to fetch manufacturer lot.',
      details: err.message
    });
  }
}


/**
 * PUT /api/manufacturer/lots/:lotNumber
 *
 * Update an existing manufacturer declaration.
 */
function updateLot(req, res) {
  try {
    const normalizedLotNumber = String(req.params.lotNumber)
      .trim()
      .toUpperCase();

    const existingLot = db.prepare(`
      SELECT *
      FROM manufacturer_lots
      WHERE lot_number = ?
    `).get(normalizedLotNumber);

    if (!existingLot) {
      return res.status(404).json({
        error: 'Manufacturer lot not found.',
        lotNumber: normalizedLotNumber
      });
    }

    const {
      productName,
      manufacturerName,
      manufacturerAddress,
      netQuantity,
      mrp,
      manufactureDate,
      consumerCare,
      countryOfOrigin
    } = req.body;

    const updatedProductName =
      productName !== undefined
        ? String(productName).trim()
        : existingLot.product_name;

    db.prepare(`
      UPDATE manufacturer_lots
      SET
        product_name = ?,
        manufacturer_name = ?,
        manufacturer_address = ?,
        net_quantity = ?,
        mrp = ?,
        manufacture_date = ?,
        consumer_care = ?,
        country_of_origin = ?
      WHERE lot_number = ?
    `).run(
      updatedProductName,
      manufacturerName !== undefined
        ? manufacturerName
        : existingLot.manufacturer_name,

      manufacturerAddress !== undefined
        ? manufacturerAddress
        : existingLot.manufacturer_address,

      netQuantity !== undefined
        ? netQuantity
        : existingLot.net_quantity,

      mrp !== undefined
        ? mrp
        : existingLot.mrp,

      manufactureDate !== undefined
        ? manufactureDate
        : existingLot.manufacture_date,

      consumerCare !== undefined
        ? consumerCare
        : existingLot.consumer_care,

      countryOfOrigin !== undefined
        ? countryOfOrigin
        : existingLot.country_of_origin,

      normalizedLotNumber
    );

    const updatedLot = db.prepare(`
      SELECT *
      FROM manufacturer_lots
      WHERE lot_number = ?
    `).get(normalizedLotNumber);

    return res.json({
      message: 'Manufacturer lot updated successfully.',
      lot: updatedLot
    });

  } catch (err) {
    console.error('Update manufacturer lot failed:', err.message);

    return res.status(500).json({
      error: 'Failed to update manufacturer lot.',
      details: err.message
    });
  }
}


module.exports = {
  createLot,
  getLots,
  getLotByNumber,
  updateLot
};