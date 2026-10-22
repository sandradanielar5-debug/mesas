const { withTransaction, query } = require('../config/db');
const AppError = require('../utils/AppError');
const brevo = require('./brevo.service');
const { render } = require('./factura.template');

const IVA = Number(process.env.IVA_RATE) || 0.13;   // El Salvador: 13 %
const TIPOS = {
  CONSUMIDOR_FINAL: { prefijo: 'FCF', secuencia: 'factura_cf_seq' },
  CREDITO_FISCAL:   { prefijo: 'CCF', secuencia: 'factura_ccf_seq' }
};

// ---------- validación ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function texto(v, campo, { max, min = 1, obligatorio = true } = {}) {
  const s = String(v ?? '').trim();
  if (!s) { if (obligatorio) throw new AppError(`${campo} es obligatorio`); return null; }
  if (s.length < min || s.length > max) throw new AppError(`${campo} debe tener entre ${min} y ${max} caracteres`);
  return s;
}
function correo(v) {
  const s = String(v ?? '').trim();
  if (!EMAIL_RE.test(s) || s.length > 160) throw new AppError('Correo electrónico inválido');
  return s;
}
// Normaliza y valida el receptor según el tipo de documento
function validarReceptor(tipo, c = {}, nombreDefecto) {
  const cliente = { nombre: texto(c.nombre || nombreDefecto, tipo === 'CREDITO_FISCAL' ? 'La razón social' : 'El nombre', { max: 120, min: 3 }) };
  const doc = String(c.documento ?? '').replace(/[\s-]/g, '');
  if (tipo === 'CONSUMIDOR_FINAL') {
    if (doc && !/^\d{9}$/.test(doc)) throw new AppError('DUI inválido (9 dígitos)');
    return { ...cliente, documento: doc || null, nrc: null, giro: null, direccion: null };
  }
  if (!/^(\d{9}|\d{14})$/.test(doc)) throw new AppError('NIT inválido (14 dígitos, o 9 si es DUI)');
  const nrc = String(c.nrc ?? '').replace(/[\s-]/g, '');
  if (!/^\d{1,8}$/.test(nrc)) throw new AppError('NRC inválido (solo dígitos, hasta 8)');
  return { ...cliente, documento: doc, nrc,
    giro: texto(c.giro, 'El giro o actividad económica', { max: 120, min: 3 }),
    direccion: texto(c.direccion, 'La dirección', { max: 200, min: 5 }) };
}

// ---------- cálculo de IVA ----------
// El precio de la reserva ya incluye IVA. Todo se calcula en centavos enteros para que
// subtotal + IVA = total exacto, y el residuo de redondeo se asigna a la línea más grande.
function desglosar(lineas, totalCents) {
  const neto = Math.round(totalCents / (1 + IVA));
  const netos = lineas.map((l) => Math.round(l.totalCents / (1 + IVA)));
  const resto = neto - netos.reduce((a, b) => a + b, 0);
  if (resto) netos[lineas.reduce((m, l, i) => (l.totalCents > lineas[m].totalCents ? i : m), 0)] += resto;
  return { netoCents: neto, ivaCents: totalCents - neto, netos };
}

// ---------- emisión ----------
// Crea la factura (transacción con el pago bloqueado: no puede haber dos facturas del mismo pago)
// y después intenta enviarla. Si el correo falla la factura queda emitida y se puede reenviar.
exports.emitir = async (user, body = {}) => {
  const tipo = body.tipo;
  if (!TIPOS[tipo]) throw new AppError('Tipo de documento inválido (CONSUMIDOR_FINAL o CREDITO_FISCAL)');
  const pagoId = Number(body.pago_id);
  if (!Number.isInteger(pagoId)) throw new AppError('Pago inválido');
  const email = correo(body.email);
  if (!brevo.configurado()) throw new AppError('El envío de correos no está configurado en el servidor', 503);

  const factura = await withTransaction(async (c) => {
    const { rows: [p] } = await c.query(
      `SELECT p.*, u.nombre AS usuario_nombre FROM pagos p JOIN usuarios u ON u.id = p.usuario_id WHERE p.id=$1 FOR UPDATE OF p`, [pagoId]);
    if (!p) throw new AppError('Pago inexistente', 404);
    if (user.rol !== 'ADMIN' && p.usuario_id !== user.id) throw new AppError('Sin permisos', 403);
    if (p.estado !== 'APROBADO') throw new AppError('Solo se puede facturar un pago aprobado', 409);
    const { rows: [previa] } = await c.query('SELECT numero FROM facturas WHERE pago_id=$1', [pagoId]);
    if (previa) throw new AppError(`Este pago ya tiene la factura ${previa.numero}. Use "Reenviar".`, 409);

    const cliente = validarReceptor(tipo, body.cliente, p.usuario_nombre);

    const { rows: det } = await c.query(
      `SELECT i.nombre, d.cantidad, d.precio_unitario FROM reservas_detalle d JOIN inventario i ON i.id = d.inventario_id
        WHERE d.reserva_id=$1 ORDER BY i.id`, [p.reserva_id]);
    const lineas = det.map((d) => ({ descripcion: d.nombre, cantidad: d.cantidad,
      unitCents: Math.round(Number(d.precio_unitario) * 100), totalCents: d.cantidad * Math.round(Number(d.precio_unitario) * 100) }));
    const totalCents = Math.round(Number(p.monto) * 100);
    if (!lineas.length || lineas.reduce((s, l) => s + l.totalCents, 0) !== totalCents)
      throw new AppError('Inconsistencia: el detalle de la reserva no coincide con el monto pagado', 500);

    const { netoCents, ivaCents, netos } = desglosar(lineas, totalCents);
    const items = lineas.map((l, i) => ({ descripcion: l.descripcion, cantidad: l.cantidad,
      precio_unitario: l.unitCents / 100, total: l.totalCents / 100, venta_neta: netos[i] / 100 }));

    const { prefijo, secuencia } = TIPOS[tipo];   // constantes del código, no del usuario
    const { rows: [f] } = await c.query(
      `INSERT INTO facturas (pago_id,reserva_id,usuario_id,emitida_por,tipo,numero,cliente_nombre,cliente_email,cliente_documento,
         cliente_nrc,cliente_giro,cliente_direccion,items,subtotal,iva,total,iva_tasa)
       VALUES ($1,$2,$3,$4,$5, '${prefijo}-' || lpad(nextval('${secuencia}')::text, 8, '0'), $6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [p.id, p.reserva_id, p.usuario_id, user.id, tipo, cliente.nombre, email, cliente.documento, cliente.nrc, cliente.giro, cliente.direccion,
       JSON.stringify(items), netoCents / 100, ivaCents / 100, totalCents / 100, IVA]);
    return f;
  });

  return { factura: resumen(factura), envio: await enviarCorreo(factura) };
};

// ---------- reenvío ----------
exports.reenviar = async (user, facturaId, body = {}) => {
  const { rows: [f] } = await query('SELECT * FROM facturas WHERE id=$1', [facturaId]);
  if (!f) throw new AppError('Factura inexistente', 404);
  if (user.rol !== 'ADMIN' && f.usuario_id !== user.id) throw new AppError('Sin permisos', 403);
  if (!brevo.configurado()) throw new AppError('El envío de correos no está configurado en el servidor', 503);
  const email = body.email ? correo(body.email) : f.cliente_email;
  if (email !== f.cliente_email) {
    await query('UPDATE facturas SET cliente_email=$1 WHERE id=$2', [email, f.id]);
    f.cliente_email = email;
  }
  return { factura: resumen(f), envio: await enviarCorreo(f) };
};

// ---------- envío ----------
// Nunca lanza: devuelve { ok, error? } y deja constancia en la factura.
async function enviarCorreo(f) {
  try {
    const { subject, html, text } = render(f);
    const { messageId } = await brevo.enviar({ to: f.cliente_email, toName: f.cliente_nombre, subject, html, text, tags: ['factura', f.tipo.toLowerCase()] });
    await query(`UPDATE facturas SET enviada_at=now(), envios=envios+1, brevo_message_id=$1, error_envio=NULL WHERE id=$2`, [messageId, f.id]);
    return { ok: true, enviada_a: f.cliente_email };
  } catch (err) {
    console.error('Error enviando factura', f.numero, err.message);
    await query('UPDATE facturas SET error_envio=$1 WHERE id=$2', [String(err.message).slice(0, 300), f.id]).catch(() => {});
    return { ok: false, error: err.message };
  }
}

// Campos que se devuelven al frontend
const resumen = (f) => ({ id: f.id, numero: f.numero, tipo: f.tipo, total: f.total, cliente_email: f.cliente_email });

exports._test = { desglosar, validarReceptor };
