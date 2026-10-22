const API = '/api';
const getToken = () => localStorage.getItem('token');
const getUser = () => JSON.parse(localStorage.getItem('user') || 'null');
const isAdmin = () => getUser()?.rol === 'ADMIN';

function logout() { localStorage.clear(); location.href = 'login.html'; }

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401 && !path.startsWith('/auth')) { logout(); throw new Error('Sesión expirada'); }
  if (!res.ok) throw new Error(data.error || 'Error de servidor');
  return data.data !== undefined ? data.data : data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('es-SV') : '-');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('es-SV') : '-');
const fmtDay = (d) => (d ? String(d).slice(0, 10) : '-');
const fmtMoney = (n) => '$' + Number(n || 0).toFixed(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const badge = (e) => `<span class="badge ${esc(e)}">${esc(String(e).replace('_', ' '))}</span>`;

function toast(msg, type = 'success') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'error' ? 'error' : '');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function openModal(title, bodyHTML, { onSubmit, submitText = 'Guardar', closeText = 'Cancelar' } = {}) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal"><div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-close>&times;</button></div>
    <form class="modal-body">${bodyHTML}<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>${esc(closeText)}</button>
    ${onSubmit ? `<button class="btn">${esc(submitText)}</button>` : ''}</div></form></div>`;
  const close = () => ov.remove();
  ov.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  const form = ov.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return close();
    const btn = form.querySelector('.btn:not(.btn-ghost)');
    btn.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      await onSubmit(data, close);
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  });
  document.body.appendChild(ov);
  return { close, el: ov };
}

function confirmModal(message, { danger = false, okText = 'Confirmar', cancelText = 'Cancelar' } = {}) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal"><div class="modal-head"><h3>Confirmar</h3></div><div class="modal-body"><p>${esc(message)}</p>
      <div class="modal-actions"><button class="btn btn-ghost" data-v="0">${esc(cancelText)}</button><button class="btn ${danger ? 'btn-danger' : ''}" data-v="1">${esc(okText)}</button></div></div></div>`;
    ov.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { ov.remove(); resolve(b.dataset.v === '1'); }));
    document.body.appendChild(ov);
  });
}

const IC = {
  dashboard: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  out: '<path d="M7 17L17 7M8 7h9v9"/>',
  back: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M17 4a4 4 0 0 1 0 8M22 21c0-3-2-5.5-5-6.5"/>'
};
const icon = (n, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${IC[n]}</svg>`;

const MENU = [
  ['dashboard.html', 'Dashboard', 'dashboard', false, 'General'],
  ['reservas.html', 'Reservas', 'calendar', false, 'Operación'], ['pagos.html', 'Pagos y facturas', 'card', false], ['prestamos.html', 'Préstamos', 'out', false], ['devoluciones.html', 'Devoluciones', 'back', false], ['inventario.html', 'Inventario', 'box', false],
  ['historial.html', 'Historial', 'clock', true, 'Administración'], ['usuarios.html', 'Usuarios', 'users', true]
];

function initShell() {
  if (!getToken()) return (location.href = 'login.html');
  const u = getUser();
  const page = location.pathname.split('/').pop() || 'index.html';
  const content = document.getElementById('content');
  const links = MENU.filter(([, , , adm]) => !adm || u.rol === 'ADMIN')
    .map(([href, label, ic, , group]) => `${group ? `<div class="nav-label">${group}</div>` : ''}<a href="${href}" class="${href === page ? 'active' : ''}">${icon(ic)}${label}</a>`).join('');
  const ini = u.nombre.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  const shell = document.createElement('div');
  shell.className = 'shell';
  shell.innerHTML = `<aside class="sidebar" id="sidebar"><div class="brand"><span class="logo">${icon('box', 'width="18" height="18" style="color:#fff"')}</span>Mesas &amp; Sillas</div>${links}
    <div class="side-foot">Sistema de inventario v1.0</div></aside>
    <div class="main"><header class="navbar"><button class="btn btn-ghost menu-btn" id="menuBtn">☰</button><span class="sp"></span>
    <div class="user-chip"><div class="avatar">${esc(ini)}</div><div class="t"><div class="n">${esc(u.nombre)}</div><div class="r">${u.rol === 'ADMIN' ? 'Administrador' : 'Usuario'}</div></div></div>
    <button class="btn btn-ghost btn-sm" id="logoutBtn">Salir</button></header></div>`;
  document.body.prepend(shell);
  shell.querySelector('.main').appendChild(content);
  document.getElementById('logoutBtn').onclick = logout;
  document.getElementById('menuBtn').onclick = () => document.getElementById('sidebar').classList.toggle('open');
}

// Comprobante de un pago (simulado). `p` es una fila de /api/pagos. `onDone` se llama si se factura o reenvía desde aquí.
function comprobante(p, onDone) {
  const fila = (k, v) => `<div class="rcpt-row"><span>${k}</span><strong>${v}</strong></div>`;
  const metodo = p.metodo === 'TARJETA' ? `${esc(p.tarjeta_marca)} •••• ${esc(p.tarjeta_ultimos4)}` : 'Efectivo';
  const reserva = '#' + p.reserva_id + (p.fecha ? ` · ${fmtDay(p.fecha)} ${String(p.hora_inicio).slice(0, 5)}–${String(p.hora_fin).slice(0, 5)}` : '');
  const m = openModal('Comprobante de pago', `<div class="rcpt">
    <div class="rcpt-head">Mesas &amp; Rosas</div>
    <div class="rcpt-total">${fmtMoney(p.monto)}</div><div class="rcpt-state">${badge(p.estado)}</div>
    ${p.factura_numero ? `<div class="rcpt-fac">🧾 Factura <b>${esc(p.factura_numero)}</b> · ${esc(TIPO_FACTURA[p.factura_tipo])}</div>` : ''}
    <div style="margin-top:14px">
    ${fila('Referencia', esc(p.referencia))}${fila('Fecha', fmtDateTime(p.created_at))}${p.usuario_nombre ? fila('Cliente', esc(p.usuario_nombre)) : ''}
    ${fila('Reserva', esc(reserva))}${fila('Método', metodo)}
    ${p.estado === 'REEMBOLSADO' ? fila('Reembolsado', fmtDateTime(p.reembolsado_at)) : ''}
    ${p.estado === 'RECHAZADO' ? fila('Motivo', esc(p.motivo_rechazo)) : ''}</div>
    ${p.estado === 'APROBADO' ? `<button type="button" class="btn btn-sm" id="btnFactura" style="margin-top:14px">${p.factura_id ? 'Reenviar factura por correo' : 'Facturar y enviar por correo'}</button>` : ''}
    <p class="hint">Comprobante de práctica: no corresponde a una transacción real.</p></div>`, { closeText: 'Cerrar' });
  const bf = m.el.querySelector('#btnFactura');
  if (bf) bf.addEventListener('click', () => { m.close(); facturaModal(p, onDone); });
}

const TIPO_FACTURA = { CONSUMIDOR_FINAL: 'Consumidor final', CREDITO_FISCAL: 'Crédito fiscal' };

// Informa el resultado de emitir/reenviar: la factura puede quedar emitida aunque el correo falle
function avisoEnvio({ factura, envio }) {
  if (envio.ok) toast(`Factura ${factura.numero} enviada a ${envio.enviada_a}`);
  else toast(`Factura ${factura.numero} emitida, pero el correo no se envió: ${envio.error}. Puede reintentar con "Reenviar".`, 'error');
}

// Emitir factura (Consumidor final / Crédito fiscal) de un pago aprobado y enviarla por correo (Brevo).
// Si el pago ya tiene factura, solo permite reenviarla.
function facturaModal(p, onDone) {
  // cambia el texto del botón mientras se envía y devuelve la función que lo restaura (si falla)
  const enviando = (m, texto) => { const b = m.el.querySelector('form .btn:not(.btn-ghost)'), antes = b.textContent; b.textContent = texto; return () => { b.textContent = antes; }; };

  if (p.factura_id) {
    const m = openModal(`Reenviar factura ${p.factura_numero}`,
      `<p class="hint" style="margin:12px 0 0">${esc(TIPO_FACTURA[p.factura_tipo])} · ${p.factura_enviada_at ? 'último envío ' + fmtDateTime(p.factura_enviada_at) : 'aún no se ha enviado'}</p>
       <label>Enviar a</label><input type="email" name="email" value="${esc(p.factura_email || p.usuario_email || '')}" maxlength="160" required>`,
      { submitText: 'Enviar', onSubmit: async (d, close) => {
        const restaurar = enviando(m, 'Enviando…');
        try { avisoEnvio(await api(`/facturas/${p.factura_id}/reenviar`, { method: 'POST', body: { email: d.email } })); } catch (e) { restaurar(); throw e; }
        close(); onDone?.();
      } });
    return;
  }

  const m = openModal(`Facturar pago ${p.referencia}`, `
    <div class="pay-total"><span>Total (IVA incluido)</span><strong>${fmtMoney(p.monto)}</strong></div>
    <label>Tipo de documento</label>
    <select name="tipo" id="fTipo"><option value="CONSUMIDOR_FINAL">Factura · Consumidor final</option><option value="CREDITO_FISCAL">Comprobante de crédito fiscal</option></select>
    <label id="lNombre">Nombre del cliente</label><input name="nombre" value="${esc(p.usuario_nombre || '')}" maxlength="120" required>
    <label id="lDoc">DUI (opcional)</label><input name="documento" id="fDoc" inputmode="numeric" maxlength="17" autocomplete="off" placeholder="000000000">
    <fieldset class="pay-fields" id="fCcf" hidden disabled>
      <label>NRC</label><input name="nrc" inputmode="numeric" maxlength="9" autocomplete="off" placeholder="123456-7" required>
      <label>Giro / actividad económica</label><input name="giro" maxlength="120" required>
      <label>Dirección</label><input name="direccion" maxlength="200" required>
    </fieldset>
    <label>Enviar factura a</label><input type="email" name="email" value="${esc(p.usuario_email || '')}" maxlength="160" required>
    <div class="pay-detail">El precio ya incluye IVA (13 %): en el crédito fiscal se desglosa en el documento.</div>`,
    { submitText: 'Emitir y enviar', onSubmit: async (d, close) => {
      const restaurar = enviando(m, 'Emitiendo y enviando…');
      const body = { pago_id: p.id, tipo: d.tipo, email: d.email,
        cliente: { nombre: d.nombre, documento: d.documento, nrc: d.nrc, giro: d.giro, direccion: d.direccion } };
      try { avisoEnvio(await api('/facturas', { method: 'POST', body })); } catch (e) { restaurar(); throw e; }
      close(); onDone?.();
    } });

  const f = m.el.querySelector('form'), ccf = f.querySelector('#fCcf');
  const alternar = () => {
    const esCcf = f.elements.tipo.value === 'CREDITO_FISCAL';
    ccf.hidden = !esCcf; ccf.disabled = !esCcf;
    f.querySelector('#lNombre').textContent = esCcf ? 'Razón social / nombre del contribuyente' : 'Nombre del cliente';
    f.querySelector('#lDoc').textContent = esCcf ? 'NIT' : 'DUI (opcional)';
    f.elements.documento.required = esCcf;
    f.elements.documento.placeholder = esCcf ? '0614-010101-101-0' : '000000000';
  };
  f.elements.tipo.addEventListener('change', alternar);
}

// Utilidad de tabla con búsqueda local
function filtrar(rows, q, campos) {
  q = (q || '').toLowerCase().trim();
  if (!q) return rows;
  return rows.filter((r) => campos.some((c) => String(r[c] ?? '').toLowerCase().includes(q)));
}
document.addEventListener('DOMContentLoaded', () => { if (document.body.dataset.public !== '1') initShell(); });
