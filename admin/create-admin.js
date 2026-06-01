#!/usr/bin/env node
/**
 * Script untuk membuat atau update user admin
 * Jalankan: node admin/create-admin.js <username> <password>
 * 
 * Contoh: node admin/create-admin.js admin mypassword123
 */
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: DATABASE_URL atau NEON_DATABASE_URL tidak diset");
  process.exit(1);
}

const [, , username, password] = process.argv;
if (!username || !password) {
  console.error("Usage: node admin/create-admin.js <username> <password>");
  process.exit(1);
}

const isNeon = connectionString.includes("neon.tech");
const pool = new Pool({
  connectionString,
  ssl: isNeon ? { rejectUnauthorized: false } : false,
});

async function main() {
  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `UPDATE users SET is_admin = true, password = $1 WHERE username = $2 RETURNING id, username`,
    [hash, username]
  );

  if (result.rowCount === 0) {
    console.error(`User '${username}' tidak ditemukan di database.`);
    console.log("Pastikan user sudah terdaftar terlebih dahulu.");
  } else {
    console.log(`✓ User '${username}' berhasil dijadikan admin dengan password baru.`);
  }
  await pool.end();
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
