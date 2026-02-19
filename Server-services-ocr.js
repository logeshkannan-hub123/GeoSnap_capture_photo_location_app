// ─────────────────────────────────────────────────────
// server-services-ocr.js
// OCR for English + Tamil menus / signboards / receipts
// Uses tesseract.js + sharp (no extra libraries needed)
//
// KEY FIXES for gibberish:
// 1. Word-level confidence filtering (drops garbage words)
// 2. Multi-pass OCR — tries 3 preprocessing strategies,
//    picks the cleanest result
// 3. Menu-specific text cleaning rules
// 4. other_text = ocr_text_raw minus phone/email/url/address
//
// Install: npm install tesseract.js sharp
// ─────────────────────────────────────────────────────

import Tesseract from "tesseract.js";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import os from "os";

// ─────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────
export async function extractTextFromImage(imagePath) {
  const empty = {
    ocr_text_raw: null,
    ocr_text: null,
    ocr_address: null,
    ocr_contact_number: null,
    ocr_email: null,
    ocr_url: null,
    other_text: null, // ← NEW: pure content text
  };

  if (!imagePath || !fs.existsSync(imagePath)) {
    console.warn("OCR: image not found:", imagePath);
    return empty;
  }

  const tmpFiles = [];

  try {
    // ── Generate 3 differently preprocessed versions ──
    const strategies = [
      {
        name: "high-contrast",
        // Best for dark-background menus, chalkboards
        process: (s) =>
          s
            .resize({ width: 2400, withoutEnlargement: false })
            .grayscale()
            .normalise()
            .clahe({ width: 8, height: 8, maxSlope: 4 })
            .sharpen({ sigma: 1.8, m1: 0.5, m2: 0.5 })
            .png({ quality: 100 }),
      },
      {
        name: "clean-bw",
        // Best for printed menus, receipts, white background
        process: (s) =>
          s
            .resize({ width: 2400, withoutEnlargement: false })
            .grayscale()
            .normalise()
            .linear(1.3, -30)
            .sharpen({ sigma: 1.2 })
            .median(1)
            .threshold(160)
            .png({ quality: 100 }),
      },
      {
        name: "gentle",
        // Best for handwritten or low-contrast images
        process: (s) =>
          s
            .resize({ width: 2400, withoutEnlargement: false })
            .grayscale()
            .normalise()
            .sharpen({ sigma: 0.8 })
            .png({ quality: 100 }),
      },
    ];

    const tmpPaths = strategies.map((_, i) =>
      path.join(os.tmpdir(), `ocr_${Date.now()}_${i}.png`),
    );
    tmpFiles.push(...tmpPaths);

    await Promise.all(
      strategies.map(({ process }, i) =>
        process(sharp(imagePath)).toFile(tmpPaths[i]),
      ),
    );

    console.log("OCR: running multi-pass Tesseract (eng+tam)…");

    const results = await Promise.all(
      tmpPaths.map((tmpPath) =>
        Tesseract.recognize(tmpPath, "eng+tam", {
          tessedit_pageseg_mode: "6",
          preserve_interword_spaces: "1",
          tessedit_ocr_engine_mode: "1",
        }),
      ),
    );

    // ── Pick the best result by average word confidence ─
    const scored = results.map((r, i) => {
      const words = r.data.words || [];
      const goodWords = words.filter((w) => w.confidence > 50);
      const avgConf =
        goodWords.length > 0
          ? goodWords.reduce((s, w) => s + w.confidence, 0) / goodWords.length
          : 0;
      return { data: r.data, score: avgConf, name: strategies[i].name };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    console.log(
      `OCR: best strategy="${best.name}" avg_confidence=${best.score.toFixed(1)}%`,
    );

    // ── Rebuild clean text filtering low-confidence words ─
    const cleanRaw = buildCleanText(best.data);

    if (!cleanRaw || cleanRaw.trim().length < 2) {
      console.log("OCR: no confident text detected");
      return empty;
    }

    console.log(
      `OCR raw (cleaned, ${cleanRaw.length} chars):\n${cleanRaw.substring(0, 400)}`,
    );

    const parsed = parseOcrText(cleanRaw);

    return {
      ocr_text_raw: cleanRaw,
      ...parsed,
    };
  } catch (err) {
    console.warn("OCR error:", err.message);
    // Fallback — no preprocessing
    try {
      const { data } = await Tesseract.recognize(imagePath, "eng+tam");
      const rawText = data.text?.trim();
      if (!rawText) return empty;
      const parsed = parseOcrText(rawText);
      return { ocr_text_raw: rawText, ...parsed };
    } catch (e2) {
      console.warn("OCR fallback failed:", e2.message);
      return empty;
    }
  } finally {
    for (const f of tmpFiles) {
      if (fs.existsSync(f))
        try {
          fs.unlinkSync(f);
        } catch (_) {}
    }
  }
}

// ─────────────────────────────────────────────────────
// Build clean text from word-level confidence data.
// Skips words Tesseract is not confident about (< 45%).
// ─────────────────────────────────────────────────────
function buildCleanText(data) {
  const MIN_CONF = 45;

  if (!data.lines || data.lines.length === 0) {
    return data.text || "";
  }

  const cleanLines = [];

  for (const line of data.lines) {
    if (!line.words || line.words.length === 0) continue;

    const goodWords = line.words.filter(
      (w) => w.confidence >= MIN_CONF && w.text.trim().length > 0,
    );

    if (goodWords.length === 0) continue;

    // Skip line if more than 60% of words were filtered as garbage
    const keepRatio = goodWords.length / line.words.length;
    if (keepRatio < 0.4) continue;

    const lineText = goodWords
      .map((w) => w.text)
      .join(" ")
      .trim();
    if (lineText.length > 0) cleanLines.push(lineText);
  }

  return cleanLines.join("\n");
}

// ─────────────────────────────────────────────────────
// Parse clean OCR text → structured fields
//
// Returns:
//   ocr_text           — full cleaned text (all lines)
//   ocr_address        — address lines
//   ocr_contact_number — phone numbers
//   ocr_email          — emails
//   ocr_url            — urls
//   other_text         — ocr_text_raw MINUS the above extractions
//                        (pure content: menu items, labels, headings)
// ─────────────────────────────────────────────────────
function parseOcrText(raw) {
  if (!raw) {
    return {
      ocr_text: null,
      ocr_address: null,
      ocr_contact_number: null,
      ocr_email: null,
      ocr_url: null,
      other_text: null,
    };
  }

  // ── Clean: keep Tamil, English, digits, useful punctuation ─
  const cleaned = raw
    .replace(/[^\u0B80-\u0BFFa-zA-Z0-9 \n.,\-:\/()%₹$@#&!]/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const formattedText = lines.join("\n");

  // ── Phone numbers (Indian + international) ────────
  const phoneRegex =
    /(\+?91[\s\-]?)?[6-9]\d{9}|(\+?\d{1,3}[\s\-]?)?(\(?\d{2,4}\)?[\s\-.]?)(\d{3,5}[\s\-.]?\d{3,5})/g;
  const phones = [...cleaned.matchAll(phoneRegex)]
    .map((m) => m[0].trim().replace(/\s+/g, " "))
    .filter((p) => {
      const digits = p.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15;
    });

  // ── Emails ────────────────────────────────────────
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const emails = [...cleaned.matchAll(emailRegex)].map((m) => m[0]);

  // ── URLs ──────────────────────────────────────────
  const urlRegex =
    /(https?:\/\/[^\s]+)|(www\.[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}[^\s]*)/g;
  const urls = [...cleaned.matchAll(urlRegex)].map((m) => m[0]);

  // ── Address lines ─────────────────────────────────
  const addressKeywords =
    /\b(street|st\.?|road|rd\.?|avenue|ave\.?|lane|nagar|salai|marg|chowk|block|sector|plot|no\.?|floor|building|bldg|colony|layout|cross|main|bypass|highway|district|taluk|village)\b/i;
  const addressLines = lines.filter(
    (l) => addressKeywords.test(l) && /\d/.test(l),
  );

  // ── other_text: raw OCR content MINUS all extracted fields ──
  // This is what gets stored in the `other_text` DB column.
  // We strip out phone numbers, emails, urls from each line,
  // then remove lines that were purely an address or structured field.
  const addressSet = new Set(addressLines.map((l) => l.trim()));
  const emailSet = new Set(emails.map((e) => e.trim()));
  const urlSet = new Set(urls.map((u) => u.trim()));

  const otherLines = lines
    .filter((line) => {
      // Drop lines that are purely address
      if (addressSet.has(line.trim())) return false;
      // Drop lines that are purely an email
      if (emailSet.has(line.trim())) return false;
      // Drop lines that are purely a url
      if (urlSet.has(line.trim())) return false;
      return true;
    })
    .map((line) => {
      // Strip inline phone numbers, emails, urls from remaining lines
      return line
        .replace(phoneRegex, "")
        .replace(emailRegex, "")
        .replace(urlRegex, "")
        .replace(/[ ]{2,}/g, " ")
        .trim();
    })
    .filter((l) => l.length > 1);

  const otherText = otherLines.join("\n").trim();

  return {
    ocr_text: formattedText || null,
    ocr_address: addressLines.join(" | ") || null,
    ocr_contact_number: [...new Set(phones)].join(", ") || null,
    ocr_email: [...new Set(emails)].join(", ") || null,
    ocr_url: [...new Set(urls)].join(", ") || null,
    other_text: otherText || null,
  };
}
