let datos = [], usuarios = [], precios = { MESA: 0, SILLA: 0 }, tarjetasPrueba = [];
const q = { texto: '', estado: '' };

function pintar() {
  let rows = filtrar(datos, q.texto, ['usuario_nombre', 'observaciones', 'id']);
  if (q.estado) rows = rows.filter((r) => r.estado === q.estado);
  const admin = isAdmin();
  document.getElementById('tabla').innerHTML = rows.length ? `<table class="compact"><thead><tr><th>#</th>${admin ? '<th>Usuario</th>' : ''}<th>Fecha</th><th>Horario</th><th>Mesas</th><th>Sillas</th><th>Estado</th><th>Pago</th><th>Obs.</th><th></th></tr></thead><tbody>
  ${rows.map((r) => `<tr><td>${r.id}</td>${admin ? `<td>${esc(r.usuario_nombre)}</td>` : ''}<td>${fmtDay(r.fecha)}</td><td>${r.hora_inicio.slice(0, 5)}–${r.hora_fin.slice(0, 5)}</td>
  <td>${r.mesas}</td><td>${r.sillas}</td><td>${badge(r.estado)}</td><td><div class="money">${fmtMoney(r.monto_total)}</div>${badge(r.estado_pago)}</td><td class="obs" title="${esc(r.observaciones || '')}">${esc(r.observaciones || '')}</td><td><div class="actions">
  ${r.estado_pago === 'PENDIENTE' && r.estado !== 'CANCELADA' ? `<button class="btn btn-ok btn-sm" data-a="pagar" data-id="${r.id}">Pagar</button>` : ''}
  ${admin && r.estado === 'PENDIENTE' ? `<button class="btn btn-ok btn-sm" data-a="confirmar" data-id="${r.id}">Confirmar</button>` : ''}
  ${admin && r.estado === 'CONFIRMADA' ? `<button class="btn btn-sm" data-a="prestar" data-id="${r.id}">Prestar</button>` : ''}
  ${['PENDIENTE', 'CONFIRMADA'].includes(r.estado) ? `<button class="btn btn-danger btn-sm" data-a="cancelar" data-id="${r.id}">Cancelar</button>` : ''}
  </div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin reservas</div>';
  document.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => accion(b.dataset.a, Number(b.dataset.id))));
}

async function accion(a, id) {
  const r = datos.find((x) => x.id === id);
  try {
    if (a === 'confirmar') {
      const sinPago = r.estado_pago === 'PENDIENTE' && Number(r.monto_total) > 0;
      if (!(await confirmModal('¿Confirmar la reserva #' + id + '? Se descontará del inventario disponible.' + (sinPago ? ' Aviso: todavía no tiene pago registrado.' : '')))) return;
      await api(`/reservas/${id}/confirmar`, { method: 'POST' }); toast('Reserva confirmada');
    } else if (a === 'cancelar') {
      const reembolso = r.estado_pago === 'PAGADO' ? ` Se reembolsarán ${fmtMoney(r.monto_total)} automáticamente.` : '';
      if (!(await confirmModal('¿Cancelar la reserva #' + id + '?' + reembolso, { danger: true, okText: 'Sí, cancelar' }))) return;
      const res = await api(`/reservas/${id}/cancelar`, { method: 'POST' });
      toast(res.estado_pago === 'REEMBOLSADO' ? `Reserva cancelada. Reembolso de ${fmtMoney(res.monto_total)} realizado` : 'Reserva cancelada');
    } else if (a === 'pagar') {
      await pagar(id); return;
    } else if (a === 'prestar') {
      return openModal('Convertir en préstamo', `<label>Fecha prevista de devolución</label><input type="datetime-local" name="f" required><label>Observaciones</label><textarea name="o"></textarea>`,
        { submitText: 'Registrar préstamo', onSubmit: async (d, close) => {
          await api('/prestamos', { method: 'POST', body: { reserva_id: id, fecha_prevista_devolucion: new Date(d.f).toISOString(), observaciones: d.o } });
          close(); toast('Préstamo registrado'); cargar();
        } });
    }
    cargar();
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- Pago (simulado) ----------
async function pagar(id) {
  const r = datos.find((x) => x.id === id);
  if (!tarjetasPrueba.length) tarjetasPrueba = await api('/pagos/tarjetas-prueba');
  const admin = isAdmin();
  const venc = '12/' + String((new Date().getFullYear() + 4) % 100).padStart(2, '0');
  const m = openModal('Pagar reserva #' + id, `
    <div class="pay-total"><span>Total a pagar</span><strong>${fmtMoney(r.monto_total)}</strong></div>
    <div class="pay-detail">${r.mesas} mesas · ${r.sillas} sillas · ${fmtDay(r.fecha)}</div>
    ${admin ? `<label>Método de pago</label><select name="metodo" id="metodo"><option value="TARJETA">Tarjeta</option><option value="EFECTIVO">Efectivo (lo registra el administrador)</option></select>`
      : '<input type="hidden" name="metodo" value="TARJETA">'}
    <fieldset class="pay-fields" id="campos">
      <div class="sim-banner">Modo práctica: no ingrese tarjetas reales. Use una de prueba.</div>
      <label>Número de tarjeta</label><input name="numero" placeholder="4242 4242 4242 4242" inputmode="numeric" autocomplete="off" maxlength="23" required>
      <label>Titular</label><input name="titular" placeholder="Nombre en la tarjeta" autocomplete="off" maxlength="80" value="${esc(getUser().nombre)}" required>
      <div class="row2"><div><label>Vencimiento</label><input name="vencimiento" placeholder="MM/AA" autocomplete="off" maxlength="5" required></div>
      <div><label>CVV</label><input name="cvv" placeholder="123" inputmode="numeric" autocomplete="off" maxlength="4" required></div></div>
      <div class="hint">Tarjetas de prueba (clic para rellenar):</div>
      <div class="test-cards">${tarjetasPrueba.map((t) => `<button type="button" class="chip ${t.aprobada ? 'ok' : 'bad'}" data-num="${esc(t.numero)}"><b>${esc(t.marca)} ···· ${esc(t.numero.slice(-4))}</b><small>${esc(t.detalle)}</small></button>`).join('')}</div>
    </fieldset>`,
    { submitText: 'Pagar ' + fmtMoney(r.monto_total), onSubmit: async (d, close) => {
      const btn = m.el.querySelector('form .btn:not(.btn-ghost)'), txt = btn.textContent;
      const body = d.metodo === 'EFECTIVO' ? { metodo: 'EFECTIVO' }
        : { metodo: 'TARJETA', tarjeta: { numero: d.numero, titular: d.titular, vencimiento: d.vencimiento, cvv: d.cvv } };
      btn.textContent = 'Procesando pago…';
      // pausa mínima solo para que se vea el "procesando", como en una pasarela real
      const [res] = await Promise.allSettled([api(`/reservas/${id}/pagar`, { method: 'POST', body }), sleep(1100)]);
      btn.textContent = txt;
      if (res.status === 'rejected') throw res.reason;
      close(); toast('Pago aprobado'); await cargar(); comprobante(res.value, cargar);
    } });

  const f = m.el.querySelector('form'), campos = f.querySelector('#campos'), digits = (v) => v.replace(/\D/g, '');
  const setMetodo = () => { const tarjeta = f.elements.metodo.value === 'TARJETA'; campos.disabled = !tarjeta; campos.hidden = !tarjeta; };
  if (admin) f.elements.metodo.addEventListener('change', setMetodo);
  f.elements.numero.addEventListener('input', (e) => { e.target.value = digits(e.target.value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '); });
  f.elements.vencimiento.addEventListener('input', (e) => { const v = digits(e.target.value).slice(0, 4); e.target.value = v.length > 2 ? v.slice(0, 2) + '/' + v.slice(2) : v; });
  f.elements.cvv.addEventListener('input', (e) => { e.target.value = digits(e.target.value).slice(0, 4); });
  f.querySelectorAll('[data-num]').forEach((b) => b.addEventListener('click', () => {
    f.elements.numero.value = b.dataset.num.replace(/(\d{4})(?=\d)/g, '$1 ');
    f.elements.vencimiento.value = venc; f.elements.cvv.value = '123';
  }));
}

// ---------- Nueva reserva ----------
function nueva() {
  const admin = isAdmin();
  const hoy = new Date().toISOString().slice(0, 10);
  const m = openModal('Nueva reserva', `${admin ? `<label>Usuario</label><select name="usuario_id">${usuarios.map((u) => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select>` : ''}
    <label>Fecha</label><input type="date" name="fecha" min="${hoy}" required>
    <div class="row2"><div><label>Inicio</label><input type="time" name="hora_inicio" required></div><div><label>Fin</label><input type="time" name="hora_fin" required></div></div>
    <div class="row2"><div><label>Mesas (${fmtMoney(precios.MESA)} c/u)</label><input type="number" name="mesas" min="0" value="0" required></div><div><label>Sillas (${fmtMoney(precios.SILLA)} c/u)</label><input type="number" name="sillas" min="0" value="0" required></div></div>
    <label>Observaciones</label><textarea name="observaciones"></textarea>
    ${admin ? '<label><input type="checkbox" name="confirmar" style="width:auto"> Confirmar de inmediato (descuenta inventario)</label>' : ''}
    <div class="pay-total"><span>Total estimado</span><strong id="total">${fmtMoney(0)}</strong></div>
    <div class="pay-detail">El precio se fija al crear la reserva. Podrá pagarla enseguida o más tarde.</div>`,
    { onSubmit: async (d, close) => {
      if (d.hora_fin <= d.hora_inicio) throw new Error('La hora de fin debe ser posterior al inicio');
      if (Number(d.mesas) < 0 || Number(d.sillas) < 0 || Number(d.mesas) + Number(d.sillas) === 0) throw new Error('Cantidades inválidas');
      const r = await api('/reservas', { method: 'POST', body: { ...d, mesas: Number(d.mesas), sillas: Number(d.sillas), confirmar: !!d.confirmar, usuario_id: d.usuario_id ? Number(d.usuario_id) : undefined } });
      close(); toast('Reserva creada'); await cargar();
      if (r.estado_pago === 'PENDIENTE' && await confirmModal(`Reserva #${r.id} creada. Total a pagar: ${fmtMoney(r.monto_total)}. ¿Desea pagarla ahora?`, { okText: 'Pagar ahora', cancelText: 'Más tarde' })) pagar(r.id);
    } });
  const f = m.el.querySelector('form');
  const total = () => {
    const centavos = Math.round(precios.MESA * 100) * (Number(f.elements.mesas.value) || 0) + Math.round(precios.SILLA * 100) * (Number(f.elements.sillas.value) || 0);
    f.querySelector('#total').textContent = fmtMoney(centavos / 100);
  };
  f.elements.mesas.addEventListener('input', total); f.elements.sillas.addEventListener('input', total);
}

async function cargar() { datos = await api('/reservas'); pintar(); }
async function init() {
  if (isAdmin()) usuarios = (await api('/usuarios')).filter((u) => u.activo);
  (await api('/inventario')).forEach((i) => { precios[i.tipo] = Number(i.precio_unitario); });
  document.getElementById('view').innerHTML = `<div class="toolbar"><input id="q" placeholder="Buscar…"><select id="e"><option value="">Todos los estados</option>
    ${['PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'FINALIZADA'].map((e) => `<option>${e}</option>`).join('')}</select><span class="sp"></span><button class="btn" id="nueva">+ Nueva reserva</button></div>
    <div class="table-wrap" id="tabla"></div>`;
  document.getElementById('q').oninput = (e) => { q.texto = e.target.value; pintar(); };
  document.getElementById('e').onchange = (e) => { q.estado = e.target.value; pintar(); };
  document.getElementById('nueva').onclick = nueva;
  await cargar();
}
init().catch((e) => toast(e.message, 'error'));
