const { verifyAgainstLot } = require('./src/services/verificationService');

const registeredLot = {
  lot_number: 'LOT-AMUL-2608-A1020',
  product_name: 'Amul Taaza Homogenised Toned Milk',
  net_quantity: '1 L',
  mrp: '₹68'
};

// Case 1: exact match (different unit, same value)
console.log(verifyAgainstLot(registeredLot, {
  net_quantity: { value: 1000, unit: 'mL', raw: '1000 mL' },
  mrp: { value: 68, raw: '68' }
}));
// Expect: VERIFIED

// Case 2: genuine mismatch
console.log(verifyAgainstLot(registeredLot, {
  net_quantity: { value: 900, unit: 'mL', raw: '900 mL' },
  mrp: { value: 68, raw: '68' }
}));
// Expect: MISMATCH, 1 mismatch (Net Quantity)

// Case 3: lot not in registry
console.log(verifyAgainstLot(null, { lot_number: 'LOT-XYZ-999' }));
// Expect: UNREGISTERED