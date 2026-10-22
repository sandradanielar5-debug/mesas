let datos = [];
const q = { texto: '', estado: '' };
const centavos = (rows, estado) => rows.filter((p) => p.estado === estado).reduce((s, p) => s + Math.round(Number(p.monto) * 100), 0);
const tarjeta = (cls, label, value, ic = 'card') => `<div class="card stat ${cls}"><div class="ico">${icon(ic)}</div><div><div class="label">${label}</div><div class="value">${value}</div></div></div>`;

function resumen() {
  const admin = isAdmin();
  document.getElementById('resumen').innerHTML = `<div class="grid c4" style="margin-bottom:16px">
    ${tarjeta('ok', admin ? 'Total cobrado' : 'Total pagado', fmtMoney(centavos(datos, 'APROBADO') / 100))}
    ${tarjeta('', 'Reembolsado', fmtMoney(centavos(datos, 'REEMBOLSADO') / 100), 'back')}
    ${tarjeta('err', 'Intentos rechazados', datos.filter((p) => p.estado === 'RECHAZADO').length, 'clock')}</div>`;
}

function pintar() {
  let rows = filtrar(datos, q.texto, ['referencia', 'usuario_nombre', 'reserva_id', 'factura_numero']);
  if (q.estado) rows = rows.filter((p) => p.estado === q.estado);
  const admin = isAdmin();
  document.getElementById('tabla').innerHTML = rows.length ? `<table><thead><tr><th>Fecha</th><th>Referencia</th><th>Reserva</th>${admin ? '<th>Usuario</th>' : ''}<th>Método</th><th>Monto</th><th>Estado</th><th>Factura</th><th></th></tr></thead><tbody>
  ${rows.map((p) => `<tr><td>${fmtDateTime(p.created_at)}</td><td>${esc(p.referencia)}</td><td>#${p.reserva_id}</td>${admin ? `<td>${esc(p.usuario_nombre)}</td>` : ''}
  <td>${p.metodo === 'TARJETA' ? `${esc(p.tarjeta_marca)} •••• ${esc(p.tarjeta_ultimos4)}` : 'Efectivo'}</td><td class="money">${fmtMoney(p.monto)}</td>
  <td>${badge(p.estado)}${p.estado === 'RECHAZADO' ? ` <span class="hint">${esc(p.motivo_rechazo)}</span>` : ''}</td>
  <td>${p.factura_id ? `<div class="money">🧾 ${esc(p.factura_numero)}</div><span class="hint" style="margin:0">${esc(TIPO_FACTURA[p.factura_tipo])} · ${p.factura_enviada_at ? 'enviada' : 'sin enviar'}</span>` : '<span class="hint" style="margin:0">—</span>'}</td>
  <td><div class="actions">${p.estado === 'APROBADO' ? `<button class="btn btn-sm" data-fac="${p.id}">${p.factura_id ? 'Reenviar' : 'Facturar'}</button>` : ''}
  <button class="btn btn-ghost btn-sm" data-id="${p.id}">Comprobante</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin pagos</div>';
  document.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => comprobante(datos.find((p) => p.id === Number(b.dataset.id)), cargar)));
  document.querySelectorAll('[data-fac]').forEach((b) => b.addEventListener('click', () => facturaModal(datos.find((p) => p.id === Number(b.dataset.fac)), cargar)));
}

async function cargar() { datos = await api('/pagos'); resumen(); pintar(); }
document.getElementById('view').innerHTML = `<div id="resumen"></div><div class="toolbar"><input id="q" placeholder="Buscar por referencia, reserva, usuario o factura…" style="min-width:280px"><select id="e"><option value="">Todos los estados</option>
  ${['APROBADO', 'RECHAZADO', 'REEMBOLSADO'].map((e) => `<option>${e}</option>`).join('')}</select><span class="sp"></span><a class="btn" href="reservas.html">Ir a reservas</a></div>
  <div class="table-wrap" id="tabla"></div>`;
document.getElementById('q').oninput = (e) => { q.texto = e.target.value; pintar(); };
document.getElementById('e').onchange = (e) => { q.estado = e.target.value; pintar(); };
cargar().catch((e) => toast(e.message, 'error'));
