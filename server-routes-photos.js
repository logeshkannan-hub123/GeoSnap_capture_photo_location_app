// ─────────────────────────────────────────────────────
// server-routes-photos.js with user authentication
// + OCR text extraction on upload
// + other_text and company_name fields
// ─────────────────────────────────────────────────────

import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";

import pool from "./server-db-connection.js";
import { reverseGeocode } from "./server-services-geocode.js";
import { extractTextFromImage } from "./Server-services-ocr.js";
import { requireAuthAPI } from "./Middleware-auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const uploadDir = path.join(__dirname, "public", "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}.jpg`),
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    file.mimetype.startsWith("image/")
      ? cb(null, true)
      : cb(new Error("Only image files are allowed"), false);
  },
});

// ══════════════════════════════════════════════════════
//  POST /api/photos/upload
//  ✅ Protected — user must be logged in
//  Runs OCR + reverse geocode, saves to DB with all fields
// ══════════════════════════════════════════════════════
router.post(
  "/upload",
  requireAuthAPI,
  upload.single("photo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No photo file received" });
      }

      const lat = parseFloat(req.body.latitude);
      const lng = parseFloat(req.body.longitude);
      const acc = parseFloat(req.body.accuracy) || null;

      if (isNaN(lat) || isNaN(lng)) {
        fs.unlinkSync(req.file.path);
        return res
          .status(400)
          .json({ success: false, error: "Invalid latitude or longitude" });
      }

      // company_name is optional — typed by user in the form
      const companyName = req.body.company_name?.trim() || null;

      // ── Run reverse geocode + OCR in parallel ────────
      console.log(`🌍 Geocoding: ${lat}, ${lng} ...`);
      console.log(`🔍 OCR scanning: ${req.file.path} ...`);

      const [address, ocrData] = await Promise.all([
        reverseGeocode(lat, lng),
        extractTextFromImage(req.file.path),
      ]);

      console.log(`📍 Address:      ${address.address_full}`);
      console.log(
        `📝 OCR text:     ${ocrData.ocr_text?.substring(0, 80) || "(none)"}`,
      );
      console.log(
        `📄 Other text:   ${ocrData.other_text?.substring(0, 80) || "(none)"}`,
      );
      console.log(`📞 Phone:        ${ocrData.ocr_contact_number || "(none)"}`);
      console.log(`📧 Email:        ${ocrData.ocr_email || "(none)"}`);
      console.log(`🔗 URL:          ${ocrData.ocr_url || "(none)"}`);
      console.log(`🏠 OCR Address:  ${ocrData.ocr_address || "(none)"}`);
      console.log(`🏢 Company:      ${companyName || "(none)"}`);

      const userId = req.user.id;
      const photoName = req.file.filename;
      const filePath = req.file.path;
      const capturedAt = req.body.captured_at
        ? new Date(req.body.captured_at)
        : new Date();

      // ── Insert into DB ───────────────────────────────
      const [result] = await pool.execute(
        `INSERT INTO photos (
          user_id, photo_name, file_path,
          latitude, longitude, accuracy_m,
          address_full, address_road, address_city,
          address_state, address_country, address_postcode,
          ocr_text_raw, ocr_text, ocr_address,
          ocr_contact_number, ocr_email, ocr_url,
          other_text, company_name,
          captured_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          photoName,
          filePath,
          lat,
          lng,
          acc,
          address.address_full,
          address.address_road,
          address.address_city,
          address.address_state,
          address.address_country,
          address.address_postcode,
          ocrData.ocr_text_raw,
          ocrData.ocr_text,
          ocrData.ocr_address,
          ocrData.ocr_contact_number,
          ocrData.ocr_email,
          ocrData.ocr_url,
          ocrData.other_text, // ← NEW: content text only
          companyName, // ← NEW: user-entered company name
          capturedAt,
        ],
      );

      console.log(
        `✅ Saved: ID=${result.insertId}, user=${req.user.email}, file=${photoName}`,
      );

      res.status(201).json({
        success: true,
        photo_id: result.insertId,
        photo_name: photoName,
        file_url: `/uploads/${photoName}`,
        address,
        latitude: lat,
        longitude: lng,
        company_name: companyName,
        ocr: {
          text: ocrData.ocr_text,
          other_text: ocrData.other_text, // ← NEW
          address: ocrData.ocr_address,
          contact_number: ocrData.ocr_contact_number,
          email: ocrData.ocr_email,
          url: ocrData.ocr_url,
          has_text: !!ocrData.ocr_text_raw,
        },
      });
    } catch (err) {
      console.error("❌ Upload error:", err);
      if (req.file && fs.existsSync(req.file.path))
        fs.unlinkSync(req.file.path);
      res
        .status(500)
        .json({ success: false, error: "Server error: " + err.message });
    }
  },
);

// ══════════════════════════════════════════════════════
//  POST /api/photos/scan
//  OCR-only endpoint — does NOT save to DB
// ══════════════════════════════════════════════════════
router.post(
  "/scan",
  requireAuthAPI,
  upload.single("photo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No image file received" });
      }

      console.log(`🔍 Scan-only OCR: ${req.file.path}`);

      const ocrData = await extractTextFromImage(req.file.path);

      console.log(
        `📝 OCR text:    ${ocrData.ocr_text?.substring(0, 100) || "(none)"}`,
      );
      console.log(
        `📄 Other text:  ${ocrData.other_text?.substring(0, 100) || "(none)"}`,
      );
      console.log(`📞 Phone:       ${ocrData.ocr_contact_number || "(none)"}`);
      console.log(`📧 Email:       ${ocrData.ocr_email || "(none)"}`);
      console.log(`🏠 OCR Address: ${ocrData.ocr_address || "(none)"}`);

      // Delete temp upload — scan only, not stored
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        ocr: {
          text: ocrData.ocr_text,
          other_text: ocrData.other_text,
          address: ocrData.ocr_address,
          contact_number: ocrData.ocr_contact_number,
          email: ocrData.ocr_email,
          url: ocrData.ocr_url,
          has_text: !!ocrData.ocr_text_raw,
        },
      });
    } catch (err) {
      console.error("❌ Scan error:", err);
      if (req.file && fs.existsSync(req.file.path))
        fs.unlinkSync(req.file.path);
      res
        .status(500)
        .json({ success: false, error: "Server error: " + err.message });
    }
  },
);

// ══════════════════════════════════════════════════════
//  GET /api/photos
// ══════════════════════════════════════════════════════
router.get("/", requireAuthAPI, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, photo_name, file_path, latitude, longitude, accuracy_m,
              address_full, address_city, address_country,
              ocr_text, ocr_address, ocr_contact_number, ocr_email, ocr_url,
              other_text, company_name,
              captured_at, created_at
       FROM photos
       WHERE user_id = ?
       ORDER BY captured_at DESC
       LIMIT 100`,
      [req.user.id],
    );
    const photos = rows.map((r) => ({
      ...r,
      file_url: `/uploads/${r.photo_name}`,
    }));
    res.json({ success: true, count: photos.length, photos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════
//  GET /api/photos/:id
// ══════════════════════════════════════════════════════
router.get("/:id", requireAuthAPI, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM photos WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id],
    );
    if (!rows.length)
      return res.status(404).json({ success: false, error: "Photo not found" });
    res.json({
      success: true,
      photo: { ...rows[0], file_url: `/uploads/${rows[0].photo_name}` },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════
//  DELETE /api/photos/:id
// ══════════════════════════════════════════════════════
router.delete("/:id", requireAuthAPI, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT photo_name FROM photos WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id],
    );
    if (!rows.length)
      return res.status(404).json({ success: false, error: "Photo not found" });

    const filePath = path.join(uploadDir, rows[0].photo_name);
    await pool.execute("DELETE FROM photos WHERE id = ? AND user_id = ?", [
      req.params.id,
      req.user.id,
    ]);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ success: true, message: `Photo ${req.params.id} deleted` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
