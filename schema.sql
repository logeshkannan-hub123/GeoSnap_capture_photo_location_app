-- ═══════════════════════════════════════════════════
--  GeoSnap Database Setup with Google Authentication
--  + OCR Text Extraction columns
--  + company_name and other_text columns
--  Run this file once to create the database + tables
--  Command: mysql -u root -p < schema.sql
-- ═══════════════════════════════════════════════════

-- Step 1: Create the database
CREATE DATABASE IF NOT EXISTS full_stack
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE full_stack;

-- Step 2: Create the USERS table (Google OAuth)
CREATE TABLE IF NOT EXISTS users (
  id            INT           AUTO_INCREMENT PRIMARY KEY,
  google_id     VARCHAR(255)  NOT NULL UNIQUE,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  name          VARCHAR(255)  NOT NULL,
  picture       VARCHAR(500)  NULL,
  last_login_at DATETIME      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_google_id (google_id),
  INDEX idx_email     (email)
);

-- Step 3: Create the PHOTOS table (linked to users)
CREATE TABLE IF NOT EXISTS photos (
  id            INT           AUTO_INCREMENT PRIMARY KEY,

  -- Link to user who took the photo
  user_id       INT           NOT NULL,

  -- Unique filename (UUID format)
  photo_name    VARCHAR(255)  NOT NULL UNIQUE,
  file_path     VARCHAR(500)  NOT NULL,

  -- Raw GPS coordinates
  latitude      DECIMAL(10, 7) NOT NULL,
  longitude     DECIMAL(10, 7) NOT NULL,
  accuracy_m    FLOAT          NULL,

  -- Human-readable address (reverse geocoded from lat/lng)
  address_full      VARCHAR(500)  NULL,
  address_road      VARCHAR(255)  NULL,
  address_city      VARCHAR(100)  NULL,
  address_state     VARCHAR(100)  NULL,
  address_country   VARCHAR(100)  NULL,
  address_postcode  VARCHAR(20)   NULL,

  -- ─────────────────────────────────────────────────
  -- OCR TEXT EXTRACTION COLUMNS
  -- Text detected from the photo image via Tesseract OCR
  -- ─────────────────────────────────────────────────

  -- Full raw OCR output (everything found in the image)
  ocr_text_raw       MEDIUMTEXT    NULL,

  -- Cleaned general text (signs, labels, captions, etc.)
  ocr_text           TEXT          NULL,

  -- Street addresses detected in the image text
  ocr_address        VARCHAR(500)  NULL,

  -- Phone / contact numbers detected in the image
  ocr_contact_number VARCHAR(255)  NULL,

  -- Email addresses detected in the image
  ocr_email          VARCHAR(255)  NULL,

  -- URLs / websites detected in the image
  ocr_url            VARCHAR(500)  NULL,

  -- Remaining OCR content after removing address/phone/email/url
  -- (pure text content: menu items, labels, headings, etc.)
  other_text         TEXT          NULL,

  -- ─────────────────────────────────────────────────
  -- USER INPUT FIELDS
  -- ─────────────────────────────────────────────────

  -- Company / shop / restaurant name entered by user
  company_name       VARCHAR(255)  NULL,

  -- Metadata
  captured_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  INDEX idx_user_id      (user_id),
  INDEX idx_captured_at  (captured_at),
  INDEX idx_city         (address_city),
  INDEX idx_country      (address_country),
  INDEX idx_coords       (latitude, longitude),
  INDEX idx_company      (company_name),
  FULLTEXT INDEX idx_ocr_text (ocr_text_raw)
);

-- ─────────────────────────────────────────────────────
-- EXISTING TABLE? Run these ALTER statements instead
-- of recreating the table (run only columns you're missing):
-- ─────────────────────────────────────────────────────
-- ALTER TABLE photos ADD COLUMN ocr_text_raw       MEDIUMTEXT   NULL AFTER address_postcode;
-- ALTER TABLE photos ADD COLUMN ocr_text           TEXT         NULL AFTER ocr_text_raw;
-- ALTER TABLE photos ADD COLUMN ocr_address        VARCHAR(500) NULL AFTER ocr_text;
-- ALTER TABLE photos ADD COLUMN ocr_contact_number VARCHAR(255) NULL AFTER ocr_address;
-- ALTER TABLE photos ADD COLUMN ocr_email          VARCHAR(255) NULL AFTER ocr_contact_number;
-- ALTER TABLE photos ADD COLUMN ocr_url            VARCHAR(500) NULL AFTER ocr_email;
-- ALTER TABLE photos ADD COLUMN other_text         TEXT         NULL AFTER ocr_url;
-- ALTER TABLE photos ADD COLUMN company_name       VARCHAR(255) NULL AFTER other_text;
-- ALTER TABLE photos ADD INDEX idx_company (company_name);
-- ALTER TABLE photos ADD FULLTEXT INDEX idx_ocr_text (ocr_text_raw);

-- Step 4: Verify
SELECT 'GeoSnap database and tables created successfully!' AS status;
SHOW TABLES;
DESCRIBE users;
DESCRIBE photos;
