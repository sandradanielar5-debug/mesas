const r = require('express').Router();
const h = require('../utils/asyncHandler');
const auth = require('../middleware/auth');
const c = require('../controllers/pagos.controller');
r.use(auth);
r.get('/', h(c.listar));
r.get('/tarjetas-prueba', h(c.tarjetasPrueba));
module.exports = r;
