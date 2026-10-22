const r = require('express').Router();
const h = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const c = require('../controllers/facturas.controller');
r.use(auth);
r.post('/', h(c.emitir));
r.post('/:id/reenviar', h(c.reenviar));
module.exports = r;
