'use strict';

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('\n  ❌ Falta la variable DATABASE_URL (cadena de conexión de PostgreSQL / Neon).');
  console.error('     Defínela antes de iniciar. Ejemplo (PowerShell):');
  console.error('     $env:DATABASE_URL="postgres://usuario:clave@host/neondb?sslmode=require"\n');
  process.exit(1);
}

const isLocal = /@(localhost|127\.0\.0\.1)/.test(DATABASE_URL);
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false }
});

// Helpers cortos
const q  = (text, params = []) => pool.query(text, params);
const q1 = async (text, params = []) => (await pool.query(text, params)).rows[0] || null;

async function init() {
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('admin','ventas','compras')),
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS products (
      id            SERIAL PRIMARY KEY,
      codigo        TEXT UNIQUE NOT NULL,
      barras        TEXT,
      nombre        TEXT NOT NULL,
      cat           TEXT,
      pventa        DOUBLE PRECISION NOT NULL DEFAULT 0,
      pcosto        DOUBLE PRECISION NOT NULL DEFAULT 0,
      stock         DOUBLE PRECISION NOT NULL DEFAULT 0,
      smin          DOUBLE PRECISION NOT NULL DEFAULT 5,
      unidad        TEXT DEFAULT 'Pieza',
      descripcion   TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_products_barras ON products(barras);

    CREATE TABLE IF NOT EXISTS sales (
      id         SERIAL PRIMARY KEY,
      folio      TEXT NOT NULL,
      fecha      TIMESTAMPTZ NOT NULL,
      cliente    TEXT,
      metodo     TEXT,
      subtotal   DOUBLE PRECISION NOT NULL DEFAULT 0,
      descuento  DOUBLE PRECISION NOT NULL DEFAULT 0,
      total      DOUBLE PRECISION NOT NULL DEFAULT 0,
      pago       DOUBLE PRECISION NOT NULL DEFAULT 0,
      cambio     DOUBLE PRECISION NOT NULL DEFAULT 0,
      user_id    INTEGER REFERENCES users(id),
      user_name  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sales_fecha ON sales(fecha);

    CREATE TABLE IF NOT EXISTS sale_items (
      id         SERIAL PRIMARY KEY,
      sale_id    INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER,
      nombre     TEXT,
      cant       DOUBLE PRECISION NOT NULL,
      precio     DOUBLE PRECISION NOT NULL,
      costo      DOUBLE PRECISION NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id         SERIAL PRIMARY KEY,
      folio      TEXT NOT NULL,
      fecha      TIMESTAMPTZ NOT NULL,
      proveedor  TEXT,
      factura    TEXT,
      metodo     TEXT,
      total      DOUBLE PRECISION NOT NULL DEFAULT 0,
      user_id    INTEGER REFERENCES users(id),
      user_name  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_purchases_fecha ON purchases(fecha);

    CREATE TABLE IF NOT EXISTS purchase_items (
      id          SERIAL PRIMARY KEY,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id  INTEGER,
      codigo      TEXT,
      nombre      TEXT,
      cant        DOUBLE PRECISION NOT NULL,
      costo_unit  DOUBLE PRECISION NOT NULL
    );

    CREATE TABLE IF NOT EXISTS config (
      id      INTEGER PRIMARY KEY CHECK (id = 1),
      nombre  TEXT,
      dir     TEXT,
      tel     TEXT,
      rfc     TEXT,
      msg     TEXT
    );
  `);

  const cfg = await q1('SELECT COUNT(*)::int AS n FROM config');
  if (cfg.n === 0) {
    await q(`INSERT INTO config (id, nombre, dir, tel, rfc, msg)
             VALUES (1, 'Mi Mercadito', '', '', '', '¡Gracias por su compra!')`);
  }
}

module.exports = { pool, q, q1, init };
