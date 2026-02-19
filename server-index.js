// In ESM, all imports are hoisted and executed before any
// code runs — so env.config() called after imports is TOO LATE.
// passport-config.js and server-db-connection.js both read
// process.env on load, so .env must be populated before them.

import dotenv from "dotenv";
dotenv.config();
import express from "express";
import session from "express-session";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import passport from "./passport-config.js";
import authRouter from "./Server-routes-auth.js";
import photosRouter from "./server-routes-photos.js";
import { requireAuth } from "./Middleware-auth.js";

// ← __dirname doesn't exist in ESM — recreate it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── SESSION (required for Passport) ───────────────────
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      httpOnly: true,
      secure: false, // set to true in production with HTTPS
    },
  }),
);

// ── PASSPORT (Google OAuth) ───────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ── STATIC FILES ──────────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));
app.use(express.static(path.join(__dirname, "public")));

// ── AUTH ROUTES (public — no login required) ──────────
app.use("/auth", authRouter);

// ── API ROUTES (protected — login required) ───────────
app.use("/api/photos", photosRouter);

// ── HEALTH CHECK (public) ─────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    server: "GeoSnap API with Google OAuth",
    authenticated: req.isAuthenticated(),
    time: new Date().toISOString(),
  });
});

// ── LOGIN PAGE (public) ───────────────────────────────
app.get("/login", (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect("/");
  }
  res.sendFile(path.join(__dirname, "public", "Login.html"));
});

// ── MAIN APP (protected — requires login) ─────────────
app.get("/", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "photo-location-app.html"));
});

// ── GUIDE (public) ────────────────────────────────────
app.get("/geosnap-guide.html", (req, res) => {
  res.sendFile(path.join(__dirname, "geosnap-guide.html"));
});

// ── ERROR HANDLER ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("🚨 Error:", err.message);
  if (err.code === "LIMIT_FILE_SIZE") {
    return res
      .status(413)
      .json({ success: false, error: "File too large (max 15MB)" });
  }
  res.status(500).json({ success: false, error: err.message });
});

// ── START ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 GeoSnap running at http://localhost:${PORT}`);
  console.log(`📁 Photos saved to: ./public/uploads/`);
  console.log(`🗄️  Database: ${process.env.DB_MYSQL_DATABASE || "full_stack"}`);
  console.log(
    `🔐 Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? "✅ Configured" : "❌ Missing credentials"}`,
  );
  console.log(`\n   Login: http://localhost:${PORT}/login`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});
