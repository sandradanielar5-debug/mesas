const crypto = require('crypto');
const { withTransaction, query } = require('../config/db');
const AppError = require('../utils/AppError');
const mov = require('./movimientos.service');
const pasarela = require('./pasarela.service');

const nuevaReferencia = () => 'PAY-' + crypto.randomBytes(5).toString('hex').toUpperCase();
const usd = (n) => '$' + Number(n).toFixed(2);

const SELECT_PAGO = `SELECT p.*, u.nombre AS usuario_nombre, u.email AS usuario_email, r.fecha, r.hora_inicio, r.hora_fin,
    f.id AS factura_id, f.numero AS factura_numero, f.tipo AS factura_tipo, f.cliente_email AS factura_email, f.enviada_at AS factura_enviada_at
  FROM pagos p JOIN usuarios u ON u.id = p.usuario_id JOIN reservas r ON r.id = p.reserva_id LEFT JOIN facturas f ON f.pago_id = p.id`;

// Paga la reserva completa. Todo ocurre en una transacción con la reserva bloqueada,
// así dos clics simultáneos no pueden cobrar dos veces.
// Un rechazo de la "pasarela" SÍ se registra (queda como RECHAZADO) y no cambia la reserva.
exports.pagar = (user, reservaId, body = {}) => withTransaction(async (c) => {
  const { rows } = await c.query('SELECT * FROM reservas WHERE id=$1 FOR UPDATE', [reservaId]);
  const rv = rows[0];
  if (!rv) throw new AppError('Reserva inexistente', 404);
  if (user.rol !== 'ADMIN' && rv.usuario_id !== user.id) throw new AppError('Sin permisos', 403);
  if (rv.estado === 'CANCELADA') throw new AppError('No se puede pagar una reserva cancelada', 409);
  if (rv.estado_pago === 'PAGADO') throw new AppError('La reserva ya está pagada', 409);
  if (rv.estado_pago !== 'PENDIENTE') throw new AppError('Esta reserva no tiene un pago pendiente', 409);

  const metodo = body.metodo;
  if (!['TARJETA', 'EFECTIVO'].includes(metodo)) throw new AppError('Método de pago inválido');
  if (metodo === 'EFECTIVO' && user.rol !== 'ADMIN') throw new AppError('Solo un administrador puede registrar pagos en efectivo', 403);

  let tarjeta = { aprobado: true, marca: null, ultimos4: null, motivo: null };
  if (metodo === 'TARJETA') tarjeta = pasarela.procesarTarjeta(body.tarjeta);

  const { rows: ins } = await c.query(
    `INSERT INTO pagos (reserva_id,usuario_id,registrado_por,monto,metodo,estado,referencia,tarjeta_marca,tarjeta_ultimos4,motivo_rechazo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, referencia`,
    [rv.id, rv.usuario_id, user.id, rv.monto_total, metodo, tarjeta.aprobado ? 'APROBADO' : 'RECHAZADO',
     nuevaReferencia(), tarjeta.marca, tarjeta.ultimos4, tarjeta.motivo]);

  if (tarjeta.aprobado) {
    await c.query(`UPDATE reservas SET estado_pago='PAGADO', updated_at=now() WHERE id=$1`, [rv.id]);
    const detalleMetodo = metodo === 'TARJETA' ? `TARJETA ••••${tarjeta.ultimos4}` : 'EFECTIVO';
    await mov.registrar(c, { usuario_id: user.id, tipo: 'PAGO', estado_anterior: 'PENDIENTE', estado_posterior: 'PAGADO', reserva_id: rv.id,
      descripcion: `Pago de ${usd(rv.monto_total)} de la reserva #${rv.id} (${detalleMetodo}) ref ${ins[0].referencia}` });
  }
  const { rows: [pago] } = await c.query(`${SELECT_PAGO} WHERE p.id=$1`, [ins[0].id]);
  return pago;
});

// Reembolso total. Se llama desde la cancelación de una reserva, dentro de SU transacción
// (con la reserva ya bloqueada), para que cancelar y reembolsar sean una sola operación atómica.
exports.reembolsar = async (c, reserva, userId) => {
  if (reserva.estado_pago !== 'PAGADO') return null;
  const { rows } = await c.query(
    `UPDATE pagos SET estado='REEMBOLSADO', reembolsado_at=now() WHERE reserva_id=$1 AND estado='APROBADO' RETURNING *`, [reserva.id]);
  if (!rows.length) throw new AppError('Inconsistencia: reserva pagada sin pago aprobado', 500);
  await c.query(`UPDATE reservas SET estado_pago='REEMBOLSADO' WHERE id=$1`, [reserva.id]);
  await mov.registrar(c, { usuario_id: userId, tipo: 'REEMBOLSO', estado_anterior: 'PAGADO', estado_posterior: 'REEMBOLSADO', reserva_id: reserva.id,
    descripcion: `Reembolso de ${usd(rows[0].monto)} por cancelación de la reserva #${reserva.id} ref ${rows[0].referencia}` });
  return rows[0];
};

exports.listar = async (user) => {
  const admin = user.rol === 'ADMIN';
  const { rows } = await query(`${SELECT_PAGO} ${admin ? '' : 'WHERE p.usuario_id=$1'} ORDER BY p.id DESC`, admin ? [] : [user.id]);
  return rows;
};

exports.tarjetasPrueba = () => pasarela.listarTarjetasPrueba();
