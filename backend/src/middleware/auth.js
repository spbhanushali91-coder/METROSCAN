const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../controllers/authController');

// Verifies the JWT and attaches decoded user info to req.user.
// Rejects if token missing, expired, or invalid — unlike the old
// header-trust version, this can't be spoofed by just sending a header.
function requireAuth(req, res, next) {
  const authHeader = req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, username, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ error: `Role '${req.user.role}' not permitted for this action` });
      }
      next();
    });
  };
}

module.exports = { requireAuth, requireRole };