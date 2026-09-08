// Lightweight demo auth: reads a role from header `x-user-role`.
// For the hackathon this avoids building full JWT auth while still
// demonstrating "role-based access" as required by the problem statement.
// Swap this for real JWT/session auth for production.

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.header('x-user-role') || 'ENFORCEMENT_OFFICER';
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: `Role '${role}' not permitted for this action` });
    }
    req.userRole = role;
    next();
  };
}

module.exports = { requireRole };
