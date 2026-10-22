// Plantilla del correo de factura. Todo dato dinámico se escapa antes de entrar al HTML.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = (n, dec = 2) => '$' + Number(n).toFixed(dec);
const fecha = (d) => new Date(d).toLocaleString('es-SV', { timeZone: 'America/El_Salvador', dateStyle: 'long', timeStyle: 'short' });

const TITULOS = { CONSUMIDOR_FINAL: 'Factura · Consumidor Final', CREDITO_FISCAL: 'Comprobante de Crédito Fiscal' };

function emisor() {
  const e = process.env;
  return {
    nombre: e.EMPRESA_NOMBRE || 'Mesas y Sillas',
    nit: e.EMPRESA_NIT || '', nrc: e.EMPRESA_NRC || '', giro: e.EMPRESA_GIRO || '',
    direccion: e.EMPRESA_DIRECCION || '', telefono: e.EMPRESA_TELEFONO || ''
  };
}

const fila = (k, v) => v ? `<tr><td style="padding:2px 12px 2px 0;color:#9a6a80;white-space:nowrap">${esc(k)}</td><td style="padding:2px 0;color:#3b0a24">${esc(v)}</td></tr>` : '';

// f: fila de `facturas` (items ya parseado). Devuelve { subject, html, text }
function render(f) {
  const ccf = f.tipo === 'CREDITO_FISCAL';
  const em = emisor();
  const titulo = TITULOS[f.tipo];
  const tasa = Math.round(Number(f.iva_tasa) * 100);

  // CCF: precios sin IVA (como exige el documento) · Consumidor final: precios con IVA incluido
  const lineas = f.items.map((it) => {
    const unit = ccf ? usd(it.venta_neta / it.cantidad, 4) : usd(it.precio_unitario);
    const monto = ccf ? usd(it.venta_neta) : usd(it.total);
    return `<tr><td style="padding:8px 6px;border-bottom:1px solid #fce7f3">${esc(it.cantidad)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #fce7f3">${esc(it.descripcion)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #fce7f3;text-align:right">${unit}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #fce7f3;text-align:right">${monto}</td></tr>`;
  }).join('');

  const tot = (k, v, fuerte) => `<tr><td style="padding:4px 6px;text-align:right;color:#9a6a80${fuerte ? ';font-weight:700;color:#be185d;font-size:16px' : ''}">${k}</td>
    <td style="padding:4px 6px;text-align:right;width:110px${fuerte ? ';font-weight:700;font-size:16px' : ''}">${v}</td></tr>`;
  const totales = ccf
    ? tot('Venta gravada', usd(f.subtotal)) + tot(`IVA ${tasa}%`, usd(f.iva)) + tot('Total a pagar', usd(f.total), true)
    : tot('Total a pagar', usd(f.total), true) + tot(`(IVA ${tasa}% incluido)`, usd(f.iva));

  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#fff5f8;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#3b0a24">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#fff;border:1px solid #fbd5e5;border-radius:20px;overflow:hidden">
<tr><td style="padding:26px;background:#ec4899;background-image:linear-gradient(135deg,#f472b6,#db2777);color:#fff;text-align:center">
  <div style="font-size:12px;opacity:.85;letter-spacing:.04em;text-transform:uppercase">${esc(titulo)}</div>
  <div style="font-size:22px;font-weight:700;margin-top:4px">N.º ${esc(f.numero)}</div></td></tr>
<tr><td style="padding:22px 26px">
  <div style="text-align:center;background:#fdf2f8;border:1px dashed #f9a8d4;border-radius:16px;padding:16px;margin:0 0 18px"><div style="font-size:12px;color:#9a6a80;text-transform:uppercase;letter-spacing:.08em">Total a pagar</div><div style="font-size:34px;font-weight:700;color:#be185d">${usd(f.total)}</div></div>
  <p style="margin:0 0 16px">Hola ${esc(f.cliente_nombre)}, gracias por tu pago. Aquí está tu ${ccf ? 'comprobante de crédito fiscal' : 'factura'} de la reserva #${esc(f.reserva_id)}.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td valign="top" style="padding-right:12px;width:50%"><div style="font-weight:700;margin-bottom:6px;color:#be185d">💗 Receptor</div>
      <table role="presentation" style="font-size:13px">${fila(ccf ? 'Razón social' : 'Nombre', f.cliente_nombre)}${fila(ccf ? 'NIT' : 'DUI', f.cliente_documento)}${fila('NRC', f.cliente_nrc)}${fila('Giro', f.cliente_giro)}${fila('Dirección', f.cliente_direccion)}${fila('Correo', f.cliente_email)}</table></td>
  
    <td valign="top" style="width:50%"><div style="font-weight:700;margin-bottom:6px;color:#be185d">🌸 Emisor</div>
      <table role="presentation" style="font-size:13px">${fila('Nombre', em.nombre)}${fila('NIT', em.nit)}${fila('NRC', em.nrc)}${fila('Giro', em.giro)}${fila('Dirección', em.direccion)}${fila('Teléfono', em.telefono)}</table></td>
    </tr></table>
  <p style="margin:16px 0 6px;color:#9a6a80;font-size:13px">Fecha de emisión: ${esc(fecha(f.created_at))}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:6px">
    <tr style="background:#fdf2f8;font-size:12px;color:#9a6a80;text-transform:uppercase">
      <th style="padding:8px 6px;text-align:left">Cant.</th><th style="padding:8px 6px;text-align:left">Descripción</th>
      <th style="padding:8px 6px;text-align:right">${ccf ? 'Precio s/IVA' : 'Precio unit.'}</th><th style="padding:8px 6px;text-align:right">${ccf ? 'Venta gravada' : 'Total'}</th></tr>
    ${lineas}
  </table>
  <table role="presentation" align="right" cellpadding="0" cellspacing="0" style="margin-top:10px">${totales}</table>
  <div style="clear:both"></div>
  <p style="margin:26px 0 0;padding-top:14px;border-top:1px dashed #f9a8d4;font-size:12px;color:#9a6a80">Documento de práctica generado por un sistema con pagos simulados. No es un Documento Tributario Electrónico (DTE) ni tiene validez fiscal ante el Ministerio de Hacienda.</p>
</td></tr></table></td></tr></table></body></html>`;

  const txt = [
    `${titulo} N.º ${f.numero}`, `Fecha: ${fecha(f.created_at)}`, `Reserva #${f.reserva_id}`, '',
    `Emisor: ${em.nombre}${em.nit ? ' · NIT ' + em.nit : ''}${em.nrc ? ' · NRC ' + em.nrc : ''}`,
    `Receptor: ${f.cliente_nombre}${f.cliente_documento ? ' · ' + (ccf ? 'NIT ' : 'DUI ') + f.cliente_documento : ''}${f.cliente_nrc ? ' · NRC ' + f.cliente_nrc : ''}`, '',
    ...f.items.map((it) => `${it.cantidad} x ${it.descripcion}: ${ccf ? usd(it.venta_neta) : usd(it.total)}`), '',
    ...(ccf ? [`Venta gravada: ${usd(f.subtotal)}`, `IVA ${tasa}%: ${usd(f.iva)}`] : [`IVA ${tasa}% incluido: ${usd(f.iva)}`]),
    `Total: ${usd(f.total)}`, '', 'Documento de práctica, sin validez fiscal.'
  ].join('\n');

  return { subject: `${titulo} ${f.numero} · Reserva #${f.reserva_id}`, html, text: txt };
}

module.exports = { render };
