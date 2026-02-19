// ─────────────────────────────────────────────────────
// server-services-geocode.js
// GPS coordinates → human-readable address
// Uses OpenStreetMap Nominatim API (FREE, no API key)
// ES Module version
// ─────────────────────────────────────────────────────

import https from "https"; // ← ESM import of built-in module

/**
 * Reverse geocode: lat + lng → address object
 * @param {number} lat - e.g. 40.7128
 * @param {number} lng - e.g. -74.0060
 * @returns {Promise<Object>} address fields
 */
async function reverseGeocode(lat, lng) {
  return new Promise((resolve) => {
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`;

    const options = {
      headers: {
        "User-Agent": "GeoSnapApp/1.0 (your@email.com)",
        "Accept-Language": "en",
      },
    };

    https
      .get(url, options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const a = json.address || {};
            resolve({
              address_full: json.display_name || null,
              address_road: a.road || a.pedestrian || a.footway || null,
              address_city: a.city || a.town || a.village || null,
              address_state: a.state || a.region || null,
              address_country: a.country || null,
              address_postcode: a.postcode || null,
            });
          } catch (parseErr) {
            console.warn("⚠️  Geocode parse error:", parseErr.message);
            resolve(emptyAddress());
          }
        });
      })
      .on("error", (err) => {
        console.warn("⚠️  Geocode network error:", err.message);
        resolve(emptyAddress());
      });
  });
}

function emptyAddress() {
  return {
    address_full: null,
    address_road: null,
    address_city: null,
    address_state: null,
    address_country: null,
    address_postcode: null,
  };
}

export { reverseGeocode }; // ← ESM named export (replaces module.exports)
