'use strict';

/* ═══════════════════════════════════════
   ESTADO GLOBAL
═══════════════════════════════════════ */
let TOKEN = localStorage.getItem('mc_token') || '';
let ME    = null;                 // { id, username, name, role }
let inv   = [];                   // productos
let vtas  = [];                   // ventas
let cmps  = [];                   // compras
let cfg   = { nombre:'Mi Mercadito', dir:'', tel:'', rfc:'', msg:'¡Gracias por su compra!' };

let carrito    = [];
let cmpItems   = [];
let _activeTab = 'dashboard';
let _pendingAdd = null;

const ROLE_LABEL = { admin:'Administrador', ventas:'Cajero / Ventas', compras:'Compras / Inventario' };

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
const byId   = id => document.getElementById(id);
const val    = id => (byId(id)||{}).value || '';
const setVal = (id,v) => { if (byId(id)) byId(id).value = v; };
const hoy    = () => new Date().toISOString().split('T')[0];
const mon    = n => 'L. ' + parseFloat(n||0).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmt    = iso => new Date(iso).toLocaleString('es-HN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const esc    = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ═══════════════════════════════════════
   API
═══════════════════════════════════════ */
async function api(method, path, body) {
  const opt = { method, headers:{} };
  if (TOKEN) opt.headers['Authorization'] = 'Bearer ' + TOKEN;
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const res = await fetch(path, opt);
  if (res.status === 401) { forceLogout(); throw new Error('Sesión expirada'); }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) throw new Error((data && data.error) || 'Error del servidor');
  return data;
}

/* ═══════════════════════════════════════
   TOAST
═══════════════════════════════════════ */
let _tt;
function toast(msg, tipo='ok') {
  const t = byId('toast');
  t.textContent = msg;
  t.className = 'show ' + tipo;
  clearTimeout(_tt);
  _tt = setTimeout(() => t.className = '', 3000);
}

/* ═══════════════════════════════════════
   MODALS
═══════════════════════════════════════ */
const openModal  = id => byId(id).classList.add('open');
const closeModal = id => byId(id).classList.remove('open');
let _delFn = null;
function confirmDel(fn) { _delFn = fn; openModal('m-del'); }
function runDel() { if (_delFn) _delFn(); _delFn = null; closeModal('m-del'); }

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
async function doLogin(e) {
  e.preventDefault();
  byId('login-err').textContent = '';
  try {
    const data = await api('POST', '/api/auth/login', { username: val('login-user').trim(), password: val('login-pass') });
    TOKEN = data.token;
    localStorage.setItem('mc_token', TOKEN);
    ME = data.user;
    await startApp();
  } catch (err) {
    byId('login-err').textContent = err.message;
  }
  return false;
}

function forceLogout() {
  TOKEN = ''; ME = null;
  localStorage.removeItem('mc_token');
  byId('app').style.display = 'none';
  byId('login-screen').style.display = 'flex';
  setVal('login-pass', '');
}
function logout() { closeUserMenu(); forceLogout(); }

async function startApp() {
  byId('login-screen').style.display = 'none';
  byId('app').style.display = 'block';

  // Header usuario
  byId('user-name').textContent = ME.name;
  byId('user-role').textContent = ROLE_LABEL[ME.role] || ME.role;
  byId('user-avatar').textContent = (ME.name || '?').charAt(0).toUpperCase();

  applyRole(ME.role);
  await loadAll();
  tickClock();
  // Primer tab visible según rol
  const first = document.querySelector('#nav button:not(.hidden-role)');
  tab(first ? first.dataset.tab : 'dashboard');
}

function applyRole(role) {
  document.querySelectorAll('#nav button').forEach(b => {
    const roles = (b.dataset.roles || '').split(',');
    b.classList.toggle('hidden-role', !roles.includes(role));
  });
}

/* ═══════════════════════════════════════
   CARGA DE DATOS
═══════════════════════════════════════ */
async function loadAll() {
  try {
    const [prods, sales, purch, config] = await Promise.all([
      api('GET','/api/products'),
      api('GET','/api/sales'),
      api('GET','/api/purchases'),
      api('GET','/api/config')
    ]);
    inv = prods; vtas = sales; cmps = purch; cfg = config || cfg;
    byId('h-nombre').textContent = cfg.nombre || 'Mi Mercadito';
    document.title = '🏪 ' + (cfg.nombre || 'Sistema Mercadito');
  } catch (e) { toast(e.message, 'err'); }
}
async function reloadProducts() { inv = await api('GET','/api/products'); }
async function reloadSales()    { vtas = await api('GET','/api/sales'); }
async function reloadPurchases(){ cmps = await api('GET','/api/purchases'); }

/* ═══════════════════════════════════════
   RELOJ
═══════════════════════════════════════ */
function tickClock() {
  const f = new Date().toLocaleDateString('es-HN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  byId('h-fecha').textContent = f.charAt(0).toUpperCase() + f.slice(1);
}

/* ═══════════════════════════════════════
   USER MENU
═══════════════════════════════════════ */
function toggleUserMenu(e) { e.stopPropagation(); byId('user-dropdown').classList.toggle('open'); }
function closeUserMenu() { byId('user-dropdown').classList.remove('open'); }
document.addEventListener('click', () => closeUserMenu());

async function cambiarPass() {
  try {
    await api('POST','/api/auth/password', { actual: val('pass-actual'), nueva: val('pass-nueva') });
    setVal('pass-actual',''); setVal('pass-nueva','');
    closeModal('m-pass');
    toast('Contraseña actualizada','ok');
  } catch (e) { toast(e.message,'err'); }
}

/* ═══════════════════════════════════════
   TABS
═══════════════════════════════════════ */
const TABS = ['dashboard','pos','consulta','catalogo','compras','historial','tendencias','usuarios','config'];
function tab(id) {
  _activeTab = id;
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#nav button').forEach(b => b.classList.remove('active'));
  byId('tab-'+id).classList.add('active');
  const btn = document.querySelector(`#nav button[data-tab="${id}"]`);
  if (btn) btn.classList.add('active');

  if (id === 'dashboard')  renderDash();
  if (id === 'pos')        { renderCart(); setTimeout(()=>byId('pos-input').focus(),50); }
  if (id === 'consulta')   { cpReset(); setTimeout(()=>byId('cp-input').focus(),50); }
  if (id === 'catalogo')   { renderCat(); fillCatsDL(); }
  if (id === 'compras')    renderCompras();
  if (id === 'historial')  renderHist();
  if (id === 'tendencias') renderTrend();
  if (id === 'usuarios')   renderUsers();
  if (id === 'config')     loadConfigForm();
}

/* ═══════════════════════════════════════
   BARCODE — USB (keyboard wedge)
═══════════════════════════════════════ */
let _buf = '', _bufT = null;
document.addEventListener('keydown', function(e) {
  if (byId('login-screen').style.display !== 'none') return;
  const active = document.activeElement;
  const skipIds = ['pos-input','c-barras','cmp-prod-q','cp-input'];
  if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
  if (active && skipIds.includes(active.id)) return;
  if (active && active.tagName === 'INPUT' && !skipIds.includes(active.id)) return;

  if (e.key === 'Enter') {
    if (_buf.length >= 3) processBarcode(_buf.trim(), _activeTab);
    _buf = ''; clearTimeout(_bufT); return;
  }
  if (e.key.length === 1) {
    _buf += e.key;
    clearTimeout(_bufT);
    _bufT = setTimeout(() => { _buf = ''; }, 120);
  }
}, true);

function processBarcode(code, ctx) {
  if (!code) return;
  const pill = byId('scan-pill');
  pill.style.animation = 'none'; setTimeout(() => pill.style.animation = '', 200);

  if (ctx === 'catalogo') {
    setVal('c-barras', code);
    const p = inv.find(x => x.barras === code);
    if (p) { editProd(p.id); toast(`Producto encontrado: ${p.nombre}`,'info'); }
    else toast(`Barras ${code} — asigna a un producto nuevo.`,'info');
    return;
  }
  if (ctx === 'compras') {
    const p = inv.find(x => x.barras === code || x.codigo === code);
    if (p) { selectCmpProd(p); toast(`Seleccionado: ${p.nombre}`,'info'); }
    else toast(`Código ${code} no está en catálogo.`,'warn');
    return;
  }
  if (ctx === 'consulta') { cpShowProduct(code); return; }
  // POS
  const p = inv.find(x => x.barras === code || x.codigo === code);
  if (p) addToCart(p);
  else toast(`Código ${code} no encontrado.`,'warn');
}

/* ═══════════════════════════════════════
   CAMERA
═══════════════════════════════════════ */
let _qr = null, _camCtx = 'pos';
function camOpen(ctx) {
  _camCtx = ctx;
  byId('cam-overlay').classList.add('open');
  byId('cam-reader').innerHTML = '';
  if (!window.Html5Qrcode) { toast('Librería de cámara no disponible (requiere internet).','warn'); camClose(); return; }
  _qr = new Html5Qrcode('cam-reader');
  _qr.start({ facingMode:'environment' }, { fps:10, qrbox:{width:280,height:120} },
    code => { camClose(); processBarcode(code.trim(), _camCtx); }, ()=>{})
    .catch(err => { toast('Cámara no disponible: ' + err,'err'); camClose(); });
}
function camClose() {
  byId('cam-overlay').classList.remove('open');
  if (_qr) { _qr.stop().catch(()=>{}); _qr = null; }
}

/* ═══════════════════════════════════════
   AUTOCOMPLETE helpers
═══════════════════════════════════════ */
function closeAC(id) { const el = byId(id); if (el) el.style.display='none'; }
document.addEventListener('click', e => {
  if (!e.target.closest('.ac-wrap')) document.querySelectorAll('.ac-list').forEach(l => l.style.display='none');
});

/* ═══════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════ */
function calcUtilidad(list) {
  let u = 0;
  list.forEach(v => (v.items||[]).forEach(it => {
    const prod = inv.find(p => p.id === it.prodId);
    const costo = (it.costo != null ? it.costo : (prod ? prod.pcosto : 0)) || 0;
    u += (it.precio - costo) * it.cant;
  }));
  return u;
}

function renderDash() {
  const td = hoy(), mesP = td.substring(0,7), anioP = td.substring(0,4);
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const block = (prefix, ids) => {
    const vh = vtas.filter(v => v.fecha.startsWith(prefix));
    const ch = cmps.filter(c => c.fecha.startsWith(prefix));
    const sv = vh.reduce((a,v)=>a+v.total,0), sc = ch.reduce((a,c)=>a+c.total,0);
    const util = calcUtilidad(vh), pct = sv>0 ? util/sv*100 : 0;
    byId(ids.v).textContent = mon(sv);   byId(ids.vn).textContent = `${vh.length} venta${vh.length!==1?'s':''}`;
    byId(ids.c).textContent = mon(sc);   byId(ids.cn).textContent = `${ch.length} compra${ch.length!==1?'s':''}`;
    byId(ids.u).textContent = mon(util); byId(ids.up).textContent = `${pct.toFixed(2)}% margen`;
  };
  block(td,   { v:'k-vtas', vn:'k-vtas-n', c:'k-cmps', cn:'k-cmps-n', u:'k-util', up:'k-util-pct' });
  block(mesP, { v:'km-vtas',vn:'km-vtas-n',c:'km-cmps',cn:'km-cmps-n',u:'km-util',up:'km-util-pct' });
  block(anioP,{ v:'ky-vtas',vn:'ky-vtas-n',c:'ky-cmps',cn:'ky-cmps-n',u:'ky-util',up:'ky-util-pct' });

  byId('dash-mes-label').textContent  = `📆 ${meses[parseInt(td.substring(5,7))-1]} ${anioP}`;
  byId('dash-anio-label').textContent = `📊 Año ${anioP}`;

  const vi = inv.reduce((a,p)=>a+p.stock*(p.pcosto||p.pventa||0),0);
  byId('k-inv').textContent = mon(vi);
  byId('k-inv-n').textContent = `${inv.length} producto${inv.length!==1?'s':''}`;

  const bajos = inv.filter(p => p.stock <= (p.smin||5));
  const tbl = byId('dash-stock-tbl');
  tbl.innerHTML = !bajos.length
    ? '<tr><td colspan="7" style="text-align:center;color:var(--verde-c);padding:16px">✅ Todo el stock está en orden</td></tr>'
    : bajos.map(p => {
        const [cls,lbl] = p.stock<=0 ? ['badge-zero','Sin Stock'] : ['badge-low','Stock Bajo'];
        return `<tr>
          <td><span class="cod-int">${esc(p.codigo)}</span></td>
          <td style="font-family:monospace;font-size:.8rem">${esc(p.barras||'—')}</td>
          <td><strong>${esc(p.nombre)}</strong></td>
          <td>${esc(p.cat)}</td>
          <td><strong style="color:var(--rojo)">${p.stock}</strong></td>
          <td>${p.smin||5}</td>
          <td><span class="badge ${cls}">${lbl}</span></td></tr>`;
      }).join('');

  const ult = vtas.slice(-6).reverse();
  byId('dash-recientes').innerHTML = !ult.length
    ? '<p style="text-align:center;color:var(--texto-s);padding:22px">Sin ventas registradas aún</p>'
    : ult.map(v => `<div class="h-item"><div class="h-ico">🛒</div>
        <div class="h-info"><strong>Folio ${v.folio} — ${v.items.length} artículo${v.items.length!==1?'s':''}</strong>
        <span>${fmt(v.fecha)} · ${esc(v.cliente)} · ${esc(v.metodo)}</span></div>
        <div class="h-monto ingreso">+${mon(v.total)}</div></div>`).join('');
}

/* ═══════════════════════════════════════
   POS
═══════════════════════════════════════ */
function posSearch() {
  const q = val('pos-input').toLowerCase().trim();
  const ac = byId('pos-ac');
  if (!q) { closeAC('pos-ac'); return; }
  const res = inv.filter(p => p.nombre.toLowerCase().includes(q) || (p.barras||'').includes(q) || (p.codigo||'').includes(q)).slice(0,10);
  if (!res.length) { closeAC('pos-ac'); return; }
  ac.innerHTML = res.map(p => `<div class="ac-item" onclick="posPick(${p.id})">
      <strong>${esc(p.nombre)}</strong>
      <span>${esc(p.codigo)} · ${mon(p.pventa)} · Stock: ${p.stock}</span></div>`).join('');
  ac.style.display = 'block';
}
function posPick(id) { const p = inv.find(x=>x.id===id); if (p) addToCart(p); setVal('pos-input',''); closeAC('pos-ac'); byId('pos-input').focus(); }
function posKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const q = val('pos-input').trim();
    if (!q) return;
    const exact = inv.find(x => x.barras === q || x.codigo === q);
    if (exact) { addToCart(exact); setVal('pos-input',''); closeAC('pos-ac'); return; }
    const m = inv.filter(x => x.nombre.toLowerCase().includes(q.toLowerCase()));
    if (m.length === 1) { addToCart(m[0]); setVal('pos-input',''); closeAC('pos-ac'); }
    else if (!m.length) toast('Producto no encontrado','warn');
  }
}

function addToCart(p) {
  const line = carrito.find(x => x.prodId === p.id);
  const nextCant = line ? line.cant + 1 : 1;
  if (nextCant > p.stock) {
    _pendingAdd = p;
    byId('sw-nombre').textContent = p.nombre;
    byId('sw-stock').textContent  = p.stock;
    byId('sw-cant').textContent   = nextCant;
    openModal('m-stock-warn');
    return;
  }
  commitAdd(p);
}
function stockWarnContinuar() { if (_pendingAdd) commitAdd(_pendingAdd); _pendingAdd = null; closeModal('m-stock-warn'); }
function commitAdd(p) {
  const line = carrito.find(x => x.prodId === p.id);
  if (line) line.cant++;
  else carrito.push({ prodId:p.id, codigo:p.codigo, nombre:p.nombre, cant:1, precio:p.pventa, stock:p.stock, unidad:p.unidad });
  renderCart(); calcTotals();
}

function renderCart() {
  const body = byId('cart-body'), tot = byId('cart-totals');
  byId('cart-count').textContent = carrito.reduce((a,i)=>a+i.cant,0) || '';
  if (!carrito.length) {
    body.innerHTML = '<p style="text-align:center;color:var(--texto-s);padding:30px">Escanea o busca un producto para comenzar</p>';
    tot.style.display = 'none'; calcTotals(); return;
  }
  tot.style.display = 'block';
  body.innerHTML = carrito.map((it,i) => `<div class="cart-item">
      <div class="ci-info"><strong>${esc(it.nombre)}</strong><span>${esc(it.codigo)} · ${mon(it.precio)} c/u${it.cant>it.stock?' · <span style="color:var(--rojo)">stock '+it.stock+'</span>':''}</span></div>
      <div class="ci-qty">
        <button onclick="cartQty(${i},-1)">−</button>
        <input type="number" min="1" value="${it.cant}" onchange="cartSet(${i},this.value)" />
        <button onclick="cartQty(${i},1)">+</button>
      </div>
      <div class="ci-sub">${mon(it.precio*it.cant)}</div>
      <button class="ci-del" onclick="cartDel(${i})">🗑️</button></div>`).join('');
}
function cartQty(i,d) { carrito[i].cant = Math.max(1, carrito[i].cant + d); renderCart(); calcTotals(); }
function cartSet(i,v) { carrito[i].cant = Math.max(1, parseInt(v)||1); renderCart(); calcTotals(); }
function cartDel(i)   { carrito.splice(i,1); renderCart(); calcTotals(); }

function calcTotals() {
  const sub = carrito.reduce((a,i)=>a+i.precio*i.cant,0);
  const desc = Math.max(0, parseFloat(val('pos-desc'))||0);
  const total = Math.max(0, sub - desc);
  byId('cart-sub').textContent = mon(sub);
  byId('pos-total').textContent = mon(total);
  const efectivo = val('pos-metodo') === 'Efectivo';
  byId('efectivo-wrap').style.display = efectivo ? 'flex' : 'none';
  if (efectivo) {
    const pago = parseFloat(val('pos-pago'))||0;
    const cambio = pago - total;
    byId('cambio-box').style.display = pago > 0 ? 'block' : 'none';
    byId('pos-cambio').textContent = mon(cambio >= 0 ? cambio : 0);
  } else byId('cambio-box').style.display = 'none';
}

async function cobrar() {
  if (!carrito.length) { toast('El carrito está vacío','warn'); return; }
  const sub = carrito.reduce((a,i)=>a+i.precio*i.cant,0);
  const desc = Math.max(0, parseFloat(val('pos-desc'))||0);
  const total = Math.max(0, sub - desc);
  const metodo = val('pos-metodo');
  const pago = metodo === 'Efectivo' ? (parseFloat(val('pos-pago'))||0) : total;
  if (metodo === 'Efectivo' && pago < total) { toast('El pago es menor al total','err'); return; }
  const payload = {
    cliente: val('pos-cliente').trim() || 'Público General',
    metodo, subtotal: sub, descuento: desc, total, pago, cambio: pago - total,
    items: carrito.map(i => ({ prodId:i.prodId, nombre:i.nombre, cant:i.cant, precio:i.precio }))
  };
  try {
    const r = await api('POST','/api/sales', payload);
    showTicket({ ...payload, folio:r.folio, fecha:r.fecha });
    carrito = [];
    setVal('pos-desc','0'); setVal('pos-pago',''); setVal('pos-cliente','');
    renderCart(); calcTotals();
    await reloadProducts();
    await reloadSales();
    toast(`Venta ${r.folio} registrada`,'ok');
  } catch (e) { toast(e.message,'err'); }
}
function cancelarVenta() {
  if (!carrito.length) return;
  carrito = []; setVal('pos-desc','0'); setVal('pos-pago',''); setVal('pos-cliente','');
  renderCart(); calcTotals(); toast('Venta cancelada','warn');
}

/* ═══════════════════════════════════════
   TICKET
═══════════════════════════════════════ */
function ticketHTML(v) {
  const lines = v.items.map(i => `${i.cant} x ${i.nombre}\n   ${mon(i.precio)}  = ${mon(i.precio*i.cant)}`).join('\n');
  return (
`      ${cfg.nombre || 'Mi Mercadito'}
${cfg.dir ? '   '+cfg.dir+'\n' : ''}${cfg.tel ? '   Tel: '+cfg.tel+'\n' : ''}${cfg.rfc ? '   '+cfg.rfc+'\n' : ''}--------------------------------
Folio: ${v.folio}
Fecha: ${fmt(v.fecha)}
Cliente: ${v.cliente}
Cajero: ${ME ? ME.name : ''}
--------------------------------
${lines}
--------------------------------
Subtotal:        ${mon(v.subtotal)}
Descuento:       ${mon(v.descuento)}
TOTAL:           ${mon(v.total)}
Pago (${v.metodo}): ${mon(v.pago)}
Cambio:          ${mon(v.cambio)}
--------------------------------
   ${cfg.msg || '¡Gracias por su compra!'}`);
}
function showTicket(v) {
  byId('ticket-view').textContent = ticketHTML(v);
  byId('ticket-print').textContent = ticketHTML(v);
  openModal('m-ticket');
}
function printTicket() { window.print(); }

/* ═══════════════════════════════════════
   CONSULTA PRECIO
═══════════════════════════════════════ */
function cpReset() {
  byId('cp-result').style.display = 'none';
  byId('cp-not-found').style.display = 'none';
  byId('cp-empty').style.display = '';
  setVal('cp-input','');
}
function cpShowProduct(code) {
  const p = inv.find(x => x.barras === code || x.codigo === code || x.nombre.toLowerCase() === code.toLowerCase());
  byId('cp-empty').style.display = 'none';
  setVal('cp-input','');
  if (p) {
    byId('cp-nombre').textContent = p.nombre;
    byId('cp-desc').textContent = p.descripcion || '';
    byId('cp-precio').textContent = mon(p.pventa);
    byId('cp-codigo').textContent = p.codigo || '—';
    byId('cp-barras').textContent = p.barras || '—';
    byId('cp-cat').textContent = p.cat || '—';
    byId('cp-stock').textContent = `${p.stock} ${p.unidad||''}`;
    byId('cp-stock').style.color = p.stock <= 0 ? 'var(--rojo)' : 'var(--verde)';
    byId('cp-result').style.display = '';
    byId('cp-not-found').style.display = 'none';
  } else {
    byId('cp-nf-code').textContent = `Código: ${code}`;
    byId('cp-result').style.display = 'none';
    byId('cp-not-found').style.display = '';
  }
  setTimeout(()=>byId('cp-input').focus(),80);
}
function cpKey(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const q = val('cp-input').trim();
  if (!q) return;
  const exact = inv.find(x => x.barras === q || x.codigo === q);
  if (exact) { cpShowProduct(q); return; }
  const m = inv.filter(x => x.nombre.toLowerCase().includes(q.toLowerCase()));
  if (m.length === 1) cpShowProduct(m[0].codigo);
  else if (!m.length) {
    byId('cp-empty').style.display='none';
    byId('cp-result').style.display='none';
    byId('cp-nf-code').textContent = `Búsqueda: "${q}"`;
    byId('cp-not-found').style.display = '';
    setVal('cp-input','');
  } else toast(`${m.length} productos. Sé más específico.`,'info');
}

/* ═══════════════════════════════════════
   CATÁLOGO
═══════════════════════════════════════ */
function fillCatsDL() {
  const cats = [...new Set(inv.map(p=>p.cat).filter(Boolean))].sort();
  byId('cats-dl').innerHTML = cats.map(c=>`<option value="${esc(c)}">`).join('');
  const sel = byId('cat-f-cat'), cur = sel.value;
  sel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  sel.value = cur;
}
function renderCat() {
  const q = val('cat-q').toLowerCase().trim();
  const fc = val('cat-f-cat');
  let list = inv.slice();
  if (fc) list = list.filter(p => p.cat === fc);
  if (q) list = list.filter(p => p.nombre.toLowerCase().includes(q) || (p.codigo||'').includes(q) || (p.barras||'').includes(q));
  byId('cat-total-n').textContent = inv.length;
  const tbl = byId('cat-tbl');
  tbl.innerHTML = !list.length
    ? '<tr><td colspan="10" style="text-align:center;color:var(--texto-s);padding:18px">Sin productos</td></tr>'
    : list.map(p => {
        let cls='badge-ok', lbl='OK';
        if (p.stock<=0){cls='badge-zero';lbl='Sin Stock';}
        else if (p.stock<=(p.smin||5)){cls='badge-low';lbl='Bajo';}
        return `<tr>
          <td><span class="cod-int">${esc(p.codigo)}</span></td>
          <td style="font-family:monospace;font-size:.8rem">${esc(p.barras||'—')}</td>
          <td><strong>${esc(p.nombre)}</strong>${p.descripcion?`<br><span style="font-size:.72rem;color:var(--texto-s)">${esc(p.descripcion)}</span>`:''}</td>
          <td>${esc(p.cat||'—')}</td>
          <td>${mon(p.pventa)}</td>
          <td>${mon(p.pcosto)}</td>
          <td><strong>${p.stock}</strong></td>
          <td>${esc(p.unidad||'')}</td>
          <td><span class="badge ${cls}">${lbl}</span></td>
          <td style="white-space:nowrap">
            <button class="btn btn-blue" style="padding:4px 9px;font-size:.78rem" onclick="editProd(${p.id})">✏️</button>
            <button class="btn btn-red" onclick="delProd(${p.id})">🗑️</button>
          </td></tr>`;
      }).join('');
}
function resetCatForm() {
  ['c-id','c-codigo','c-barras','c-nombre','c-cat','c-pventa','c-pcosto','c-stock','c-smin','c-desc'].forEach(id=>setVal(id,''));
  setVal('c-unidad','Pieza');
  byId('cat-form-titulo').textContent = 'Agregar Producto';
}
function editProd(id) {
  const p = inv.find(x=>x.id===id); if (!p) return;
  tab('catalogo');
  setVal('c-id',p.id); setVal('c-codigo',p.codigo); setVal('c-barras',p.barras);
  setVal('c-nombre',p.nombre); setVal('c-cat',p.cat); setVal('c-pventa',p.pventa);
  setVal('c-pcosto',p.pcosto); setVal('c-stock',p.stock); setVal('c-smin',p.smin);
  setVal('c-unidad',p.unidad||'Pieza'); setVal('c-desc',p.descripcion);
  byId('cat-form-titulo').textContent = 'Editar Producto';
  window.scrollTo({top:0,behavior:'smooth'});
}
async function saveProd() {
  const nombre = val('c-nombre').trim();
  if (!nombre) { toast('El nombre es obligatorio','err'); return; }
  const body = {
    barras: val('c-barras').trim(), nombre, cat: val('c-cat').trim(),
    pventa: parseFloat(val('c-pventa'))||0, pcosto: parseFloat(val('c-pcosto'))||0,
    stock: parseFloat(val('c-stock'))||0, smin: parseFloat(val('c-smin'))||5,
    unidad: val('c-unidad'), descripcion: val('c-desc').trim()
  };
  const id = val('c-id');
  try {
    if (id) await api('PUT','/api/products/'+id, body);
    else    await api('POST','/api/products', body);
    await reloadProducts();
    resetCatForm(); renderCat(); fillCatsDL();
    toast(id ? 'Producto actualizado' : 'Producto agregado','ok');
  } catch (e) { toast(e.message,'err'); }
}
function delProd(id) {
  const p = inv.find(x=>x.id===id); if (!p) return;
  confirmDel(async () => {
    try { await api('DELETE','/api/products/'+id); await reloadProducts(); renderCat(); fillCatsDL(); toast('Producto eliminado','warn'); }
    catch (e) { toast(e.message,'err'); }
  });
}
function catBcKey(e) { if (e.key === 'Enter') { e.preventDefault(); processBarcode(val('c-barras').trim(),'catalogo'); } }

/* CSV catálogo */
function descargarPlantilla() {
  const csv = 'barras,nombre,cat,pventa,pcosto,stock,smin,unidad,descripcion\n7501000000000,Ejemplo Producto,Abarrotes,25.00,18.00,50,5,Pieza,Marca X\n';
  downloadFile('plantilla_productos.csv', csv, 'text/csv');
}
function csvInventario() {
  const head = 'codigo,barras,nombre,cat,pventa,pcosto,stock,smin,unidad,descripcion\n';
  const rows = inv.map(p => [p.codigo,p.barras,p.nombre,p.cat,p.pventa,p.pcosto,p.stock,p.smin,p.unidad,p.descripcion]
    .map(csvCell).join(',')).join('\n');
  downloadFile('inventario.csv', head + rows, 'text/csv');
}
let _csvRows = [];
function importarCSV(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const lines = reader.result.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { toast('CSV vacío','err'); return; }
    const cols = lines[0].split(',').map(c=>c.trim().toLowerCase());
    _csvRows = lines.slice(1).map(l => {
      const cells = splitCsvLine(l);
      const o = {}; cols.forEach((c,i)=>o[c]=(cells[i]||'').trim());
      return o;
    }).filter(o => o.nombre);
    byId('csv-count').textContent = _csvRows.length;
    byId('csv-prev-head').innerHTML = '<tr>'+cols.map(c=>`<th>${esc(c)}</th>`).join('')+'</tr>';
    byId('csv-prev-body').innerHTML = _csvRows.slice(0,20).map(o=>'<tr>'+cols.map(c=>`<td>${esc(o[c])}</td>`).join('')+'</tr>').join('');
    byId('csv-preview').style.display = 'block';
  };
  reader.readAsText(file, 'UTF-8');
  e.target.value = '';
}
async function confirmarImport() {
  if (!_csvRows.length) return;
  try {
    const r = await api('POST','/api/products/bulk', { items: _csvRows });
    await reloadProducts(); renderCat(); fillCatsDL(); cancelarImport();
    toast(`Importados: ${r.creados} nuevos, ${r.actualizados} actualizados`,'ok');
  } catch (e) { toast(e.message,'err'); }
}
function cancelarImport() { _csvRows = []; byId('csv-preview').style.display='none'; }

/* ═══════════════════════════════════════
   COMPRAS
═══════════════════════════════════════ */
function cmpSearch() {
  const q = val('cmp-prod-q').toLowerCase().trim();
  const ac = byId('cmp-ac');
  if (!q) { closeAC('cmp-ac'); return; }
  const res = inv.filter(p => p.nombre.toLowerCase().includes(q) || (p.barras||'').includes(q) || (p.codigo||'').includes(q)).slice(0,10);
  if (!res.length) { closeAC('cmp-ac'); return; }
  ac.innerHTML = res.map(p => `<div class="ac-item" onclick="selectCmpProdById(${p.id})">
      <strong>${esc(p.nombre)}</strong><span>${esc(p.codigo)} · Costo: ${mon(p.pcosto)} · Stock: ${p.stock}</span></div>`).join('');
  ac.style.display = 'block';
}
function selectCmpProdById(id) { const p = inv.find(x=>x.id===id); if (p) selectCmpProd(p); }
function selectCmpProd(p) {
  setVal('cmp-prod-q', `${p.codigo} – ${p.nombre}`);
  setVal('cmp-prod-id', p.id);
  setVal('cmp-costo', p.pcosto || '');
  closeAC('cmp-ac');
  byId('cmp-cant').focus();
}
function addCmpItem() {
  const id = parseInt(val('cmp-prod-id'));
  const p = inv.find(x=>x.id===id);
  if (!p) { toast('Selecciona un producto del catálogo','warn'); return; }
  const cant = parseFloat(val('cmp-cant'))||0;
  const costo = parseFloat(val('cmp-costo'))||0;
  if (cant <= 0) { toast('Cantidad inválida','err'); return; }
  const ex = cmpItems.find(i=>i.prodId===id);
  if (ex) { ex.cant += cant; ex.costoUnit = costo; }
  else cmpItems.push({ prodId:id, codigo:p.codigo, nombre:p.nombre, cant, costoUnit:costo });
  setVal('cmp-prod-q',''); setVal('cmp-prod-id',''); setVal('cmp-cant',''); setVal('cmp-costo','');
  renderCmpItems();
  byId('cmp-prod-q').focus();
}
function renderCmpItems() {
  const tbl = byId('cmp-items-tbl');
  const total = cmpItems.reduce((a,i)=>a+i.cant*i.costoUnit,0);
  tbl.innerHTML = !cmpItems.length
    ? '<tr><td colspan="6" style="text-align:center;color:var(--texto-s);padding:14px">Agrega productos a la compra</td></tr>'
    : cmpItems.map((i,idx)=>`<tr>
        <td><span class="cod-int">${esc(i.codigo)}</span></td>
        <td>${esc(i.nombre)}</td>
        <td>${i.cant}</td>
        <td>${mon(i.costoUnit)}</td>
        <td>${mon(i.cant*i.costoUnit)}</td>
        <td><button class="btn btn-red" onclick="delCmpItem(${idx})">🗑️</button></td></tr>`).join('');
  byId('cmp-total').textContent = mon(total);
}
function delCmpItem(i) { cmpItems.splice(i,1); renderCmpItems(); }
async function saveCompra() {
  if (!cmpItems.length) { toast('Agrega al menos un producto','warn'); return; }
  const payload = {
    proveedor: val('cmp-prov').trim(), factura: val('cmp-fact').trim(), metodo: val('cmp-metodo'),
    items: cmpItems.map(i => ({ prodId:i.prodId, codigo:i.codigo, nombre:i.nombre, cant:i.cant, costoUnit:i.costoUnit }))
  };
  try {
    const r = await api('POST','/api/purchases', payload);
    await reloadProducts(); await reloadPurchases();
    resetCompraForm(); renderCompras();
    toast(`Compra ${r.folio} registrada · ${mon(r.total)}`,'ok');
  } catch (e) { toast(e.message,'err'); }
}
function resetCompraForm() {
  cmpItems = [];
  ['cmp-prov','cmp-fact','cmp-prod-q','cmp-prod-id','cmp-cant','cmp-costo'].forEach(id=>setVal(id,''));
  setVal('cmp-metodo','Efectivo');
  renderCmpItems();
}
function renderCompras() {
  renderCmpItems();
  const q = val('cmp-q').toLowerCase().trim();
  const fecha = val('cmp-fecha');
  let list = cmps.slice().reverse();
  if (q) list = list.filter(c => (c.proveedor||'').toLowerCase().includes(q) || (c.folio||'').toLowerCase().includes(q));
  if (fecha) list = list.filter(c => c.fecha.startsWith(fecha));
  const host = byId('cmp-hist');
  host.innerHTML = !list.length
    ? '<p style="text-align:center;color:var(--texto-s);padding:22px">Sin compras registradas</p>'
    : list.map(c => `<div class="h-item"><div class="h-ico">📥</div>
        <div class="h-info"><strong>${esc(c.folio)} — ${esc(c.proveedor||'Proveedor')} </strong>
        <span>${fmt(c.fecha)} · ${c.items.length} producto(s) · ${esc(c.metodo)}${c.factura?' · Fact: '+esc(c.factura):''}${c.user_name?' · '+esc(c.user_name):''}</span></div>
        <div class="h-monto egreso">−${mon(c.total)}</div></div>`).join('');
}

/* ═══════════════════════════════════════
   HISTORIAL
═══════════════════════════════════════ */
function renderHist() {
  const sv = vtas.reduce((a,v)=>a+v.total,0);
  const sc = cmps.reduce((a,c)=>a+c.total,0);
  const util = calcUtilidad(vtas);
  byId('hk-v').textContent = mon(sv);  byId('hk-vn').textContent = `${vtas.length} ventas`;
  byId('hk-c').textContent = mon(sc);  byId('hk-cn').textContent = `${cmps.length} compras`;
  byId('hk-u').textContent = mon(util);byId('hk-u-pct').textContent = `${sv>0?(util/sv*100).toFixed(2):'0.00'}% margen`;

  const q = val('h-q').toLowerCase().trim();
  const fecha = val('h-fecha');
  let list = vtas.slice().reverse();
  if (fecha) list = list.filter(v => v.fecha.startsWith(fecha));
  if (q) list = list.filter(v => (v.folio||'').toLowerCase().includes(q) || (v.cliente||'').toLowerCase().includes(q)
      || v.items.some(i => (i.nombre||'').toLowerCase().includes(q)));
  const host = byId('hist-body');
  host.innerHTML = !list.length
    ? '<p style="text-align:center;color:var(--texto-s);padding:22px">Sin ventas</p>'
    : list.map(v => `<div class="h-item"><div class="h-ico">🛒</div>
        <div class="h-info"><strong>Folio ${esc(v.folio)} — ${esc(v.cliente)}</strong>
        <span>${fmt(v.fecha)} · ${v.items.length} art. · ${esc(v.metodo)}${v.user_name?' · '+esc(v.user_name):''}</span>
        <span style="display:block;font-size:.72rem;margin-top:2px">${v.items.map(i=>`${i.cant}× ${esc(i.nombre)}`).join(', ')}</span></div>
        <div class="h-monto ingreso">+${mon(v.total)}</div></div>`).join('');
}
function csvVentas() {
  const head = 'folio,fecha,cliente,metodo,subtotal,descuento,total,cajero\n';
  const rows = vtas.map(v => [v.folio,v.fecha,v.cliente,v.metodo,v.subtotal,v.descuento,v.total,v.user_name||''].map(csvCell).join(',')).join('\n');
  downloadFile('ventas.csv', head + rows, 'text/csv');
}

/* ═══════════════════════════════════════
   TENDENCIAS
═══════════════════════════════════════ */
let _trendMes = hoy().substring(0,7);
function trendMesNav(d) {
  let [y,m] = _trendMes.split('-').map(Number);
  m += d; if (m<1){m=12;y--;} if (m>12){m=1;y++;}
  _trendMes = `${y}-${String(m).padStart(2,'0')}`;
  renderTrend();
}
function renderTrend() {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const [y,m] = _trendMes.split('-').map(Number);
  byId('trend-mes-titulo').textContent = `${meses[m-1]} ${y}`;
  const diasMes = new Date(y, m, 0).getDate();
  const porDia = {};
  for (let d=1; d<=diasMes; d++) porDia[d] = { total:0, util:0, n:0 };
  vtas.filter(v => v.fecha.startsWith(_trendMes)).forEach(v => {
    const d = parseInt(v.fecha.substring(8,10));
    if (!porDia[d]) return;
    porDia[d].total += v.total; porDia[d].n++;
    porDia[d].util += calcUtilidad([v]);
  });
  const totales = Object.values(porDia).map(x=>x.total);
  const maxV = Math.max(1, ...totales);
  const totalMes = totales.reduce((a,b)=>a+b,0);
  const diasConVenta = totales.filter(t=>t>0).length;
  const todayD = hoy().startsWith(_trendMes) ? parseInt(hoy().substring(8,10)) : -1;

  byId('trend-total-mes').textContent = mon(totalMes);
  byId('trend-prom-dia').textContent = mon(diasConVenta ? totalMes/diasConVenta : 0);
  byId('trend-dias-venta').textContent = diasConVenta;

  const dow = ['D','L','M','M','J','V','S'];
  byId('trend-chart').innerHTML = Object.entries(porDia).map(([d,x])=>{
    const h = Math.round(x.total/maxV*180);
    const wd = new Date(y,m-1,+d).getDay();
    const cls = x.total<=0 ? 'cero' : (+d===todayD ? 'hoy' : '');
    return `<div class="bar-col ${wd===0||wd===6?'weekend':''}" title="${mon(x.total)}">
      <div class="bar-val">${x.total>0?Math.round(x.total):''}</div>
      <div class="bar-fill ${cls}" style="height:${Math.max(h,2)}px"></div>
      <div class="bar-dia">${dow[wd]}</div><div class="bar-num">${d}</div></div>`;
  }).join('');

  const best = Object.entries(porDia).sort((a,b)=>b[1].total-a[1].total)[0];
  const md = byId('trend-mejor-dia');
  if (best && best[1].total>0) {
    md.innerHTML = `<div style="text-align:center"><div style="font-size:1.6rem;font-weight:900;color:var(--verde)">${mon(best[1].total)}</div>
      <div style="color:var(--texto-s);font-size:.85rem">Día ${best[0]} de ${meses[m-1]} · ${best[1].n} transacción(es)</div></div>`;
  } else md.innerHTML = '<p style="color:var(--texto-s);text-align:center">Sin datos</p>';

  byId('trend-tabla-dias').innerHTML = Object.entries(porDia).filter(([d,x])=>x.n>0)
    .sort((a,b)=>b[0]-a[0]).map(([d,x])=>{
      const wd = new Date(y,m-1,+d).getDay();
      const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
      const margen = x.total>0 ? (x.util/x.total*100) : 0;
      return `<tr><td>${dias[wd]}</td><td>${d}/${m}/${y}</td><td><strong>${mon(x.total)}</strong></td>
        <td>${x.n}</td><td>${mon(x.util)}</td><td>${margen.toFixed(1)}%</td></tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--texto-s);padding:14px">Sin ventas este mes</td></tr>';
}

/* ═══════════════════════════════════════
   USUARIOS (admin)
═══════════════════════════════════════ */
async function renderUsers() {
  try {
    const users = await api('GET','/api/users');
    byId('usr-total-n').textContent = users.length;
    byId('usr-tbl').innerHTML = users.map(u => `<tr>
        <td>${u.id}</td><td><strong>${esc(u.name)}</strong></td><td style="font-family:monospace">${esc(u.username)}</td>
        <td><span class="badge badge-role">${ROLE_LABEL[u.role]||u.role}</span></td>
        <td>${u.active ? '<span class="badge badge-ok">Activo</span>' : '<span class="badge badge-zero">Inactivo</span>'}</td>
        <td style="font-size:.78rem;color:var(--texto-s)">${(u.created_at||'').substring(0,10)}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-blue" style="padding:4px 9px;font-size:.78rem" onclick='editUser(${JSON.stringify(u)})'>✏️</button>
          ${u.id===ME.id?'':`<button class="btn btn-red" onclick="delUser(${u.id})">🗑️</button>`}
        </td></tr>`).join('');
  } catch (e) { toast(e.message,'err'); }
}
function resetUserForm() {
  ['u-id','u-name','u-username','u-password'].forEach(id=>setVal(id,''));
  setVal('u-role','ventas'); setVal('u-active','1');
  byId('u-username').disabled = false;
  byId('u-active-wrap').style.display = 'none';
  byId('u-pass-label').textContent = 'Contraseña *';
  byId('u-form-titulo').textContent = 'Nuevo Usuario';
}
function editUser(u) {
  setVal('u-id',u.id); setVal('u-name',u.name); setVal('u-username',u.username);
  setVal('u-role',u.role); setVal('u-active', u.active?'1':'0'); setVal('u-password','');
  byId('u-username').disabled = true;
  byId('u-active-wrap').style.display = 'flex';
  byId('u-pass-label').textContent = 'Contraseña (dejar vacío = no cambiar)';
  byId('u-form-titulo').textContent = 'Editar Usuario';
  window.scrollTo({top:0,behavior:'smooth'});
}
async function saveUser() {
  const id = val('u-id');
  const name = val('u-name').trim(), username = val('u-username').trim();
  const role = val('u-role'), password = val('u-password');
  if (!name) { toast('El nombre es obligatorio','err'); return; }
  try {
    if (id) {
      await api('PUT','/api/users/'+id, { name, role, active: Number(val('u-active')), password: password || undefined });
      toast('Usuario actualizado','ok');
    } else {
      if (!username) { toast('El usuario es obligatorio','err'); return; }
      if (!password) { toast('La contraseña es obligatoria','err'); return; }
      await api('POST','/api/users', { name, username, role, password });
      toast('Usuario creado','ok');
    }
    resetUserForm(); renderUsers();
  } catch (e) { toast(e.message,'err'); }
}
function delUser(id) {
  confirmDel(async () => {
    try { await api('DELETE','/api/users/'+id); renderUsers(); toast('Usuario eliminado','warn'); }
    catch (e) { toast(e.message,'err'); }
  });
}

/* ═══════════════════════════════════════
   CONFIG + RESPALDO
═══════════════════════════════════════ */
function loadConfigForm() {
  setVal('cfg-nombre',cfg.nombre||''); setVal('cfg-dir',cfg.dir||'');
  setVal('cfg-tel',cfg.tel||''); setVal('cfg-rfc',cfg.rfc||''); setVal('cfg-msg',cfg.msg||'');
}
async function saveConfig() {
  const body = { nombre:val('cfg-nombre').trim(), dir:val('cfg-dir').trim(), tel:val('cfg-tel').trim(), rfc:val('cfg-rfc').trim(), msg:val('cfg-msg').trim() };
  try {
    await api('PUT','/api/config', body);
    cfg = body;
    byId('h-nombre').textContent = cfg.nombre || 'Mi Mercadito';
    document.title = '🏪 ' + (cfg.nombre || 'Sistema Mercadito');
    toast('Configuración guardada','ok');
  } catch (e) { toast(e.message,'err'); }
}
async function exportarRespaldo() {
  try {
    const data = await api('GET','/api/backup');
    downloadFile(`respaldo_mercadito_${hoy()}.json`, JSON.stringify(data,null,2), 'application/json');
    toast('Respaldo descargado','ok');
  } catch (e) { toast(e.message,'err'); }
}

/* ═══════════════════════════════════════
   UTIL: descargar / CSV
═══════════════════════════════════════ */
function downloadFile(name, content, type) {
  const blob = new Blob([content], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(a.href);
}
function csvCell(v) {
  const s = String(v==null?'':v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
function splitCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i=0;i<line.length;i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else { if (c === '"') q=true; else if (c === ',') { out.push(cur); cur=''; } else cur+=c; }
  }
  out.push(cur); return out;
}

/* ═══════════════════════════════════════
   INICIO
═══════════════════════════════════════ */
(async function init() {
  if (TOKEN) {
    try { const r = await api('GET','/api/auth/me'); ME = r.user; await startApp(); }
    catch (e) { forceLogout(); }
  } else {
    forceLogout();
  }
})();
