const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const AppError = require('../utils/AppError');

const sign = (u) => jwt.sign({ id: u.id, rol: u.rol, nombre: u.nombre }, process.env.JWT_SECRET, { expiresIn: '8h' });

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError('Email y contraseña requeridos');
  const { rows } = await query('SELECT * FROM usuarios WHERE email = $1 AND activo = TRUE', [email.toLowerCase()]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new AppError('Credenciales inválidas', 401);
  res.json({ ok: true, token: sign(u), user: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol } });
};

exports.register = async (req, res) => {
  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password || password.length < 8) throw new AppError('Datos inválidos (contraseña mínimo 8)');
  const hash = await bcrypt.hash(password, 10);
  // el registro público siempre crea rol USER
  const { rows } = await query(
    `INSERT INTO usuarios (nombre,email,password_hash,rol) VALUES ($1,$2,$3,'USER') RETURNING id,nombre,email,rol`,
    [nombre.trim(), email.toLowerCase().trim(), hash]);
  res.status(201).json({ ok: true, token: sign(rows[0]), user: rows[0] });
};
