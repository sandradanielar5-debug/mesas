const r = require('express').Router();
const h = require('../utils/asyncHandler');
const c = require('../controllers/auth.controller');
r.post('/login', h(c.login));
r.post('/register', h(c.register));
module.exports = r;
