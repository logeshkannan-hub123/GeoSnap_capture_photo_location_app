// ─────────────────────────────────────────────────────
// passport-config.js
// Google OAuth 2.0 Strategy Configuration
// ─────────────────────────────────────────────────────

import dotenv from "dotenv";
dotenv.config();
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import pool from "./server-db-connection.js";

console.log("CLIENT ID:", process.env.GOOGLE_CLIENT_ID); // DEBUG

// ── Configure Google OAuth Strategy ──────────────────
passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/secrets",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Extract user data from Google profile
        const googleId = profile.id;
        const email = profile.emails[0].value;
        const name = profile.displayName;
        const picture = profile.photos[0]?.value || null;

        // Check if user already exists in database
        const [rows] = await pool.execute(
          "SELECT * FROM users WHERE google_id = ?",
          [googleId],
        );

        let user;

        if (rows.length > 0) {
          // ── User exists → update last_login_at ──
          user = rows[0];
          await pool.execute(
            "UPDATE users SET last_login_at = NOW() WHERE id = ?",
            [user.id],
          );
          console.log(`✅ Existing user logged in: ${email}`);
        } else {
          // ── New user → insert into database ──
          const [result] = await pool.execute(
            `INSERT INTO users (google_id, email, name, picture, last_login_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [googleId, email, name, picture],
          );
          user = {
            id: result.insertId,
            google_id: googleId,
            email,
            name,
            picture,
          };
          console.log(`✅ New user registered: ${email} (ID: ${user.id})`);
        }

        // Pass user to Passport
        done(null, user);
      } catch (err) {
        console.error("❌ OAuth error:", err);
        done(err, null);
      }
    },
  ),
);

// ── Serialize user → store user ID in session ────────
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// ── Deserialize user → fetch from DB using stored ID ─
passport.deserializeUser(async (id, done) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [id]);
    done(null, rows[0] || null);
  } catch (err) {
    done(err, null);
  }
});

export default passport;
