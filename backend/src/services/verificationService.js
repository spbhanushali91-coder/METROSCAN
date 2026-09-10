/**
 * Manufacturer verification service.
 *
 * Compares OCR-scanned declaration values against the
 * manufacturer's registered lot data. Unit-aware — does NOT
 * do raw string comparison, because "1 L" and "1000 mL" are
 * the same declared quantity but would fail a naive string match.
 *
 * This is additive to the existing regulatory compliance pipeline
 * and does not alter rules_engine.py's status/violations_count logic.
 */

const MASS_TO_GRAMS = { mg: 0.001, g: 1, gm: 1, kg: 1000 };
const VOLUME_TO_ML = { ml: 1, l: 1000, litre: 1000, liter: 1000 };

/**
 * Parses a free-text or structured quantity into a normalized
 * { type: 'mass'|'volume', base: number } form.
 *
 * Accepts:
 *  - raw string, e.g. "1 L", "900 mL", "250g"   (manufacturer's free-text field)
 *  - structured object, e.g. { value: 250, unit: "g" }  (rules_engine.py output)
 */
function normalizeQuantity(input) {
  if (!input) return null;

  let value, unit;

  if (typeof input === 'object') {
    value = input.value;
    unit = input.unit;
  } else {
    const m = String(input).match(/(\d+(?:[.,]\d+)?)\s*(kg|mg|gm|g|l|ml|litres?|liters?)\b/i);
    if (!m) return null;
    value = parseFloat(m[1].replace(',', '.'));
    unit = m[2];
  }

  if (value === undefined || value === null || isNaN(value) || !unit) return null;

  const u = String(unit).toLowerCase();

  if (MASS_TO_GRAMS[u] !== undefined) {
    return { type: 'mass', base: value * MASS_TO_GRAMS[u] };
  }
  if (VOLUME_TO_ML[u] !== undefined) {
    return { type: 'volume', base: value * VOLUME_TO_ML[u] };
  }
  return null; // pcs/units etc. — not comparable via unit conversion
}

/**
 * Parses a price string/number into a plain float.
 * Accepts "₹68", "Rs. 68", "68", or a structured { value } object.
 */
function normalizeMoney(input) {
  if (!input) return null;

  if (typeof input === 'object' && input.value !== undefined) {
    return isNaN(input.value) ? null : Number(input.value);
  }

  const m = String(input).match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;

  const value = parseFloat(m[1].replace(',', '.'));
  return isNaN(value) ? null : value;
}

/**
 * Compares a registered lot row (from manufacturer_lots table)
 * against the structured `extracted` object from rules_engine.py.
 *
 * Returns a verification result object. Does not throw.
 */
function verifyAgainstLot(lot, extracted) {
  if (!lot) {
    return {
      status: 'UNREGISTERED',
      lotNumber: extracted?.lot_number || null,
      mismatches: [],
      note: 'This lot could not be matched with the manufacturer registry.'
    };
  }

  const mismatches = [];
  const comparable = []; // fields we were actually able to check

  // ---- Net Quantity ----
  const regQty = normalizeQuantity(lot.net_quantity);
  const scanQty = normalizeQuantity(extracted?.net_quantity);

  if (regQty && scanQty) {
    comparable.push('netQuantity');
    const sameType = regQty.type === scanQty.type;
    const closeEnough = sameType && Math.abs(regQty.base - scanQty.base) < 0.01;
    if (!sameType || !closeEnough) {
      mismatches.push({
        field: 'Net Quantity',
        registered: lot.net_quantity,
        scanned: extracted.net_quantity.raw || `${extracted.net_quantity.value}${extracted.net_quantity.unit}`
      });
    }
  }
  // If either side is missing/unparseable, we silently skip this field
  // rather than flagging a mismatch — an unreadable OCR value is not
  // proof of a wrong value.

  // ---- MRP ----
  const regMrp = normalizeMoney(lot.mrp);
  const scanMrp = normalizeMoney(extracted?.mrp);

  if (regMrp !== null && scanMrp !== null) {
    comparable.push('mrp');
    if (Math.abs(regMrp - scanMrp) > 0.01) {
      mismatches.push({
        field: 'MRP',
        registered: lot.mrp,
        scanned: extracted.mrp.raw || String(extracted.mrp.value)
      });
    }
  }

  if (comparable.length === 0) {
    return {
      status: 'UNVERIFIED',
      lotNumber: lot.lot_number,
      mismatches: [],
      note: 'Lot is registered, but no comparable fields (Net Quantity/MRP) could be read reliably from the scan.'
    };
  }

  return {
    status: mismatches.length > 0 ? 'MISMATCH' : 'VERIFIED',
    lotNumber: lot.lot_number,
    registered: {
      productName: lot.product_name,
      manufacturerName: lot.manufacturer_name,
      netQuantity: lot.net_quantity,
      mrp: lot.mrp,
      manufactureDate: lot.manufacture_date
    },
     comparable,
      mismatches
  };
}

module.exports = {
  normalizeQuantity,
  normalizeMoney,
  verifyAgainstLot
};