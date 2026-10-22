const s = require('../services/facturas.service');

// 201 siempre que la factura quede emitida; `envio.ok` indica si el correo salió.
exports.emitir = async (req, res) => res.status(201).json({ ok: true, data: await s.emitir(req.user, req.body) });
exports.reenviar = async (req, res) => res.json({ ok: true, data: await s.reenviar(req.user, Number(req.params.id), req.body) });
