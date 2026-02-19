// ─────────────────────────────────────────────────────
// server-routes-auth.js
// Google OAuth authentication routes
// ─────────────────────────────────────────────────────

import express from "express";
import passport from "./passport-config.js";

const router = express.Router();

// ══════════════════════════════════════════════════════
//  GET /auth/google
//  Initiates Google OAuth flow
// ══════════════════════════════════════════════════════
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"], // Request access to profile + email
  }),
);

// ══════════════════════════════════════════════════════
//  GET /auth/google/callback
//  Google redirects here after user logs in
// ══════════════════════════════════════════════════════
router.get(
  "/google/secrets",
  passport.authenticate("google", {
    failureRedirect: "/login", // On failure
  }),
  (req, res) => {
    // ✅ Success → redirect to main app
    res.redirect("/");
  },
);

// ══════════════════════════════════════════════════════
//  GET /auth/logout
//  Logs user out and destroys session
// ══════════════════════════════════════════════════════
router.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) console.error("Logout error:", err);
    res.redirect("/login");
  });
});

// ══════════════════════════════════════════════════════
//  GET /auth/user
//  Returns current logged-in user info (for frontend JS)
// ══════════════════════════════════════════════════════
router.get("/user", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        picture: req.user.picture,
      },
    });
  } else {
    res.status(401).json({ success: false, error: "Not authenticated" });
  }
});

export default router;
