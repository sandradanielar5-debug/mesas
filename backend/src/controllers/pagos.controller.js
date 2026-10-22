const s = require('../services/pagos.service');

exports.listar = async (req, res) => res.json({ ok: true, data: await s.listar(req.user) });
exports.tarjetasPrueba = (req, res) => res.json({ ok: true, data: s.tarjetasPrueba() });

// 201 si el pago se aprueba; 402 (Payment Required) si la pasarela simulada lo rechaza.
// El rechazo queda registrado en `pagos`, por eso se responde después de confirmar la transacción.
exports.pagar = async (req, res) => {
  const pago = await s.pagar(req.user, Number(req.params.id), req.body);
  if (pago.estado === 'RECHAZADO')
    return res.status(402).json({ ok: false, error: `Pago rechazado: ${pago.motivo_rechazo}`, data: pago });
  res.status(201).json({ ok: true, data: pago });
};
