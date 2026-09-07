// middleware/requireAuth.js
// Blocks access to API routes unless the request has a logged-in session.

module.exports = function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: "You need to sign in first." });
};
