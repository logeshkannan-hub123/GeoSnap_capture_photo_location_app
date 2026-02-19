import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_MYSQL_HOST,
  port: process.env.DB_MYSQL_PORT,
  user: process.env.DB_MYSQL_USER,
  password: process.env.DB_MYSQL_PASS,
  database: process.env.DB_MYSQL_DATABASE,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test connection on startup
pool
  .getConnection()
  .then((conn) => {
    console.log("✅ MySQL connected successfully");
    conn.release();
  })
  .catch((err) => {
    console.error("❌ MySQL connection failed:", err.message);
    console.error(
      "   Check your .env file — DB_MYSQL_HOST, DB_MYSQL_USER, DB_MYSQL_PASS, DB_MYSQL_DATABASE",
    );
    process.exit(1);
  });

export default pool; // ← ESM export (replaces module.exports)
