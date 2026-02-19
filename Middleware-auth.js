// ─────────────────────────────────────────────────────
// middleware-auth.js
// Authentication middleware — protects routes
// ─────────────────────────────────────────────────────

/**
 * Middleware: require user to be logged in
 * Redirects to /login if not authenticated
 */
export function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next(); // ✅ User is logged in
  }
  // ❌ Not logged in → redirect to login page
  res.redirect("/login");
}

/**
 * Middleware: require user to be logged in (API version)
 * Returns 401 JSON instead of redirect (for AJAX calls)
 */
export function requireAuthAPI(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ success: false, error: "Not authenticated" });
}
