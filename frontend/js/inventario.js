let datos = [];
async function cargar() {
  datos = await api('/inventario');
  const admin = isAdmin();
  document.getElementById('view').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Recurso</th><th>Total</th><th>Disponible</th><th>Reservada</th><th>Prestada</th><th>Precio unit.</th><th>Estado</th>${admin ? '<th></th>' : ''}</tr></thead><tbody>
  ${datos.map((i) => `<tr><td>${esc(i.nombre)}</td><td>${i.cantidad_total}</td><td>${i.cantidad_disponible}</td><td>${i.cantidad_reservada}</td><td>${i.cantidad_prestada}</td><td class="money">${fmtMoney(i.precio_unitario)}</td><td>${badge(i.estado)}</td>
  ${admin ? `<td><button class="btn btn-sm" data-id="${i.id}">Editar</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  document.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => editar(Number(b.dataset.id))));
}
function editar(id) {
  const i = datos.find((x) => x.id === id);
  openModal('Editar ' + i.nombre, `<label>Nombre</label><input name="nombre" value="${esc(i.nombre)}" required>
    <label>Cantidad total (mín. ${i.cantidad_reservada + i.cantidad_prestada})</label><input type="number" name="cantidad_total" min="${i.cantidad_reservada + i.cantidad_prestada}" value="${i.cantidad_total}" required>
    <label>Precio por unidad (USD)</label><input type="number" name="precio_unitario" min="0" step="0.01" value="${Number(i.precio_unitario).toFixed(2)}" required>
    <div class="hint">El nuevo precio solo aplica a reservas futuras; las ya creadas conservan su monto.</div>
    <label>Estado</label><select name="estado">${['DISPONIBLE', 'AGOTADO', 'INACTIVO'].map((e) => `<option ${e === i.estado ? 'selected' : ''}>${e}</option>`).join('')}</select>`,
    { onSubmit: async (d, close) => {
      if (Number(d.cantidad_total) < 0) throw new Error('Cantidad inválida');
      if (!(Number(d.precio_unitario) >= 0)) throw new Error('Precio inválido');
      await api('/inventario/' + id, { method: 'PUT', body: { ...d, cantidad_total: Number(d.cantidad_total), precio_unitario: Number(d.precio_unitario) } });
      close(); toast('Inventario actualizado'); cargar();
    } });
}
cargar().catch((e) => toast(e.message, 'error'));
