'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const { q, q1, pool, init } = require('./db');
const { signToken, authRequired, requireRole } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Envuelve handlers async para capturar errores
const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(err => {
  console.error(err);
  res.status(500).json({ error: 'Error del servidor' });
});

/* ══════════════════════════════════════
   SEED: crea admin por defecto si no hay usuarios
══════════════════════════════════════ */
async function ensureSeedAdmin() {
  const row = await q1('SELECT COUNT(*)::int AS n FROM users');
  if (row.n === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await q(`INSERT INTO users (username, password_hash, name, role)
             VALUES ($1, $2, $3, 'admin')`, ['admin', hash, 'Administrador']);
    console.log('[seed] Usuario admin creado -> usuario: admin / clave: admin123');
  }
}

/* ══════════════════════════════════════
   AUTH
══════════════════════════════════════ */
app.post('/api/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y clave requeridos' });
  const user = await q1('SELECT * FROM users WHERE username = $1', [String(username).trim()]);
  if (!user || !user.active) return res.status(401).json({ error: 'Usuario o clave incorrectos' });
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Usuario o clave incorrectos' });
  }
  const token = signToken(user);
  res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
}));

app.get('/api/auth/me', authRequired, wrap(async (req, res) => {
  const u = await q1('SELECT id, username, name, role, active FROM users WHERE id = $1', [req.user.id]);
  if (!u || !u.active) return res.status(401).json({ error: 'Cuenta inactiva' });
  res.json({ user: { id: u.id, username: u.username, name: u.name, role: u.role } });
}));

app.post('/api/auth/password', authRequired, wrap(async (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!nueva || String(nueva).length < 4) return res.status(400).json({ error: 'La nueva clave debe tener 4+ caracteres' });
  const u = await q1('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!bcrypt.compareSync(actual || '', u.password_hash)) return res.status(400).json({ error: 'Clave actual incorrecta' });
  await q('UPDATE users SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(nueva, 10), u.id]);
  res.json({ ok: true });
}));

/* ══════════════════════════════════════
   USERS (solo admin)
══════════════════════════════════════ */
app.get('/api/users', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const { rows } = await q('SELECT id, username, name, role, active, created_at FROM users ORDER BY id');
  res.json(rows);
}));

app.post('/api/users', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const { username, password, name, role } = req.body || {};
  if (!username || !password || !name || !role) return res.status(400).json({ error: 'Faltan datos' });
  if (!['admin', 'ventas', 'compras'].includes(role)) return res.status(400).json({ error: 'Rol invalido' });
  const exists = await q1('SELECT id FROM users WHERE username = $1', [String(username).trim()]);
  if (exists) return res.status(409).json({ error: 'El usuario ya existe' });
  const r = await q1(`INSERT INTO users (username, password_hash, name, role)
                      VALUES ($1, $2, $3, $4) RETURNING id`,
    [String(username).trim(), bcrypt.hashSync(password, 10), name, role]);
  res.json({ id: r.id });
}));

app.put('/api/users/:id', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const u = await q1('SELECT * FROM users WHERE id = $1', [id]);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  const { name, role, active, password } = req.body || {};
  if (role && !['admin', 'ventas', 'compras'].includes(role)) return res.status(400).json({ error: 'Rol invalido' });

  if (u.role === 'admin' && (active === 0 || (role && role !== 'admin'))) {
    const r = await q1("SELECT COUNT(*)::int AS n FROM users WHERE role='admin' AND active=1 AND id != $1", [id]);
    if (r.n === 0) return res.status(400).json({ error: 'Debe existir al menos un administrador activo' });
  }

  await q(`UPDATE users SET name = $1, role = $2, active = $3 WHERE id = $4`,
    [name ?? u.name, role ?? u.role, active === undefined ? u.active : (active ? 1 : 0), id]);
  if (password) await q('UPDATE users SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(password, 10), id]);
  res.json({ ok: true });
}));

app.delete('/api/users/:id', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  const u = await q1('SELECT * FROM users WHERE id = $1', [id]);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (u.role === 'admin') {
    const r = await q1("SELECT COUNT(*)::int AS n FROM users WHERE role='admin' AND active=1 AND id != $1", [id]);
    if (r.n === 0) return res.status(400).json({ error: 'Debe existir al menos un administrador' });
  }
  await q('DELETE FROM users WHERE id = $1', [id]);
  res.json({ ok: true });
}));

/* ══════════════════════════════════════
   PRODUCTS
══════════════════════════════════════ */
async function nextCodigo() {
  const r = await q1('SELECT COALESCE(MAX(CAST(codigo AS INTEGER)), 0) + 1 AS next FROM products');
  return String(r.next).padStart(4, '0');
}

app.get('/api/products', authRequired, wrap(async (req, res) => {
  const { rows } = await q('SELECT * FROM products ORDER BY nombre');
  res.json(rows);
}));

app.post('/api/products', authRequired, requireRole('compras'), wrap(async (req, res) => {
  const p = req.body || {};
  if (!p.nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  if (p.barras) {
    const dup = await q1("SELECT id FROM products WHERE barras = $1 AND barras <> ''", [p.barras]);
    if (dup) return res.status(409).json({ error: 'Ya existe un producto con ese codigo de barras' });
  }
  const codigo = await nextCodigo();
  const r = await q1(`INSERT INTO products
      (codigo, barras, nombre, cat, pventa, pcosto, stock, smin, unidad, descripcion)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [codigo, p.barras || '', p.nombre, p.cat || '', Number(p.pventa) || 0, Number(p.pcosto) || 0,
     Number(p.stock) || 0, Number(p.smin) || 5, p.unidad || 'Pieza', p.descripcion || '']);
  res.json(r);
}));

app.put('/api/products/:id', authRequired, requireRole('compras'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const cur = await q1('SELECT * FROM products WHERE id = $1', [id]);
  if (!cur) return res.status(404).json({ error: 'Producto no encontrado' });
  const p = req.body || {};
  if (p.barras) {
    const dup = await q1('SELECT id FROM products WHERE barras = $1 AND id <> $2', [p.barras, id]);
    if (dup) return res.status(409).json({ error: 'Otro producto ya usa ese codigo de barras' });
  }
  const r = await q1(`UPDATE products SET
      barras=$1, nombre=$2, cat=$3, pventa=$4, pcosto=$5,
      stock=$6, smin=$7, unidad=$8, descripcion=$9, updated_at=now()
      WHERE id=$10 RETURNING *`,
    [p.barras ?? cur.barras, p.nombre ?? cur.nombre, p.cat ?? cur.cat,
     p.pventa === undefined ? cur.pventa : Number(p.pventa),
     p.pcosto === undefined ? cur.pcosto : Number(p.pcosto),
     p.stock === undefined ? cur.stock : Number(p.stock),
     p.smin === undefined ? cur.smin : Number(p.smin),
     p.unidad ?? cur.unidad, p.descripcion ?? cur.descripcion, id]);
  res.json(r);
}));

app.delete('/api/products/:id', authRequired, requireRole('compras'), wrap(async (req, res) => {
  await q('DELETE FROM products WHERE id = $1', [Number(req.params.id)]);
  res.json({ ok: true });
}));

// Vaciar todo el catálogo (solo admin)
app.post('/api/products/clear-all', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const r = await q('DELETE FROM products');
  res.json({ ok: true, eliminados: r.rowCount });
}));

app.post('/api/products/bulk', authRequired, requireRole('compras'), wrap(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: 'Sin productos para importar' });
  let creados = 0, actualizados = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of items) {
      if (!p.nombre) continue;
      let existente = null;
      if (p.barras) existente = (await client.query("SELECT * FROM products WHERE barras = $1 AND barras <> ''", [p.barras])).rows[0];
      if (existente) {
        await client.query(`UPDATE products SET nombre=$1, cat=$2, pventa=$3, pcosto=$4, stock=$5, smin=$6, unidad=$7, descripcion=$8, updated_at=now() WHERE id=$9`,
          [p.nombre, p.cat || '', Number(p.pventa) || 0, Number(p.pcosto) || 0, Number(p.stock) || 0,
           Number(p.smin) || 5, p.unidad || 'Pieza', p.descripcion || '', existente.id]);
        actualizados++;
      } else {
        const rc = await client.query('SELECT COALESCE(MAX(CAST(codigo AS INTEGER)), 0) + 1 AS next FROM products');
        const codigo = String(rc.rows[0].next).padStart(4, '0');
        await client.query(`INSERT INTO products (codigo, barras, nombre, cat, pventa, pcosto, stock, smin, unidad, descripcion)
                            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [codigo, p.barras || '', p.nombre, p.cat || '', Number(p.pventa) || 0, Number(p.pcosto) || 0,
           Number(p.stock) || 0, Number(p.smin) || 5, p.unidad || 'Pieza', p.descripcion || '']);
        creados++;
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.json({ creados, actualizados });
}));

/* ══════════════════════════════════════
   SALES (ventas)
══════════════════════════════════════ */
app.get('/api/sales', authRequired, wrap(async (req, res) => {
  const { rows: sales } = await q('SELECT * FROM sales ORDER BY id');
  const { rows: items } = await q('SELECT sale_id, product_id AS "prodId", nombre, cant, precio, costo FROM sale_items');
  const byId = {};
  for (const s of sales) { s.items = []; byId[s.id] = s; }
  for (const it of items) { const s = byId[it.sale_id]; if (s) { delete it.sale_id; s.items.push(it); } }
  res.json(sales);
}));

app.post('/api/sales', authRequired, requireRole('ventas'), wrap(async (req, res) => {
  const v = req.body || {};
  const items = Array.isArray(v.items) ? v.items : [];
  if (!items.length) return res.status(400).json({ error: 'La venta no tiene productos' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seqRow = await client.query('SELECT COUNT(*)::int AS n FROM sales');
    const folio = String(seqRow.rows[0].n + 1).padStart(4, '0');
    const fecha = new Date().toISOString();
    const ins = await client.query(`INSERT INTO sales
        (folio, fecha, cliente, metodo, subtotal, descuento, total, pago, cambio, user_id, user_name)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [folio, fecha, v.cliente || 'Publico General', v.metodo || 'Efectivo',
       Number(v.subtotal) || 0, Number(v.descuento) || 0, Number(v.total) || 0,
       Number(v.pago) || 0, Number(v.cambio) || 0, req.user.id, req.user.name]);
    const saleId = ins.rows[0].id;

    for (const it of items) {
      let prod = null;
      if (it.prodId) prod = (await client.query('SELECT * FROM products WHERE id = $1', [it.prodId])).rows[0];
      const costo = prod ? prod.pcosto : 0;
      await client.query(`INSERT INTO sale_items (sale_id, product_id, nombre, cant, precio, costo)
                          VALUES ($1,$2,$3,$4,$5,$6)`,
        [saleId, it.prodId || null, it.nombre, Number(it.cant), Number(it.precio), costo]);
      if (prod) await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [Number(it.cant), prod.id]);
    }
    await client.query('COMMIT');
    res.json({ id: saleId, folio, fecha });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

/* ══════════════════════════════════════
   PURCHASES (compras)
══════════════════════════════════════ */
app.get('/api/purchases', authRequired, wrap(async (req, res) => {
  const { rows: purchases } = await q('SELECT * FROM purchases ORDER BY id');
  const { rows: items } = await q('SELECT purchase_id, product_id AS "prodId", codigo, nombre, cant, costo_unit AS "costoUnit" FROM purchase_items');
  const byId = {};
  for (const p of purchases) { p.items = []; byId[p.id] = p; }
  for (const it of items) { const p = byId[it.purchase_id]; if (p) { delete it.purchase_id; p.items.push(it); } }
  res.json(purchases);
}));

app.post('/api/purchases', authRequired, requireRole('compras'), wrap(async (req, res) => {
  const c = req.body || {};
  const items = Array.isArray(c.items) ? c.items : [];
  if (!items.length) return res.status(400).json({ error: 'La compra no tiene productos' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seqRow = await client.query('SELECT COUNT(*)::int AS n FROM purchases');
    const folio = 'C' + String(seqRow.rows[0].n + 1).padStart(4, '0');
    const fecha = new Date().toISOString();
    const total = items.reduce((a, it) => a + Number(it.cant) * Number(it.costoUnit), 0);
    const ins = await client.query(`INSERT INTO purchases (folio, fecha, proveedor, factura, metodo, total, user_id, user_name)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [folio, fecha, c.proveedor || '', c.factura || '', c.metodo || 'Efectivo', total, req.user.id, req.user.name]);
    const purId = ins.rows[0].id;

    for (const it of items) {
      await client.query(`INSERT INTO purchase_items (purchase_id, product_id, codigo, nombre, cant, costo_unit)
                          VALUES ($1,$2,$3,$4,$5,$6)`,
        [purId, it.prodId || null, it.codigo || '', it.nombre, Number(it.cant), Number(it.costoUnit)]);
      if (it.prodId) await client.query('UPDATE products SET stock = stock + $1, pcosto = $2, updated_at=now() WHERE id = $3',
        [Number(it.cant), Number(it.costoUnit), it.prodId]);
    }
    await client.query('COMMIT');
    res.json({ id: purId, folio, fecha, total });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

/* ══════════════════════════════════════
   CONFIG
══════════════════════════════════════ */
app.get('/api/config', authRequired, wrap(async (req, res) => {
  res.json(await q1('SELECT nombre, dir, tel, rfc, msg FROM config WHERE id = 1'));
}));

app.put('/api/config', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const c = req.body || {};
  await q('UPDATE config SET nombre=$1, dir=$2, tel=$3, rfc=$4, msg=$5 WHERE id = 1',
    [c.nombre || '', c.dir || '', c.tel || '', c.rfc || '', c.msg || '']);
  res.json({ ok: true });
}));

/* ══════════════════════════════════════
   BACKUP (solo admin)
══════════════════════════════════════ */
app.get('/api/backup', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const [products, sales, sale_items, purchases, purchase_items, config] = await Promise.all([
    q('SELECT * FROM products'), q('SELECT * FROM sales'), q('SELECT * FROM sale_items'),
    q('SELECT * FROM purchases'), q('SELECT * FROM purchase_items'), q('SELECT * FROM config WHERE id = 1')
  ]);
  res.json({
    version: 2, exported_at: new Date().toISOString(),
    products: products.rows, sales: sales.rows, sale_items: sale_items.rows,
    purchases: purchases.rows, purchase_items: purchase_items.rows, config: config.rows[0]
  });
}));

/* ══════════════════════════════════════
   Fallback SPA
══════════════════════════════════════ */
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ══════════════════════════════════════
   ARRANQUE
══════════════════════════════════════ */
(async function start() {
  try {
    await init();
    await ensureSeedAdmin();
    app.listen(PORT, () => console.log(`\n  Mercadito App corriendo en  http://localhost:${PORT}\n`));
  } catch (e) {
    console.error('No se pudo iniciar el servidor:', e.message);
    process.exit(1);
  }
})();
