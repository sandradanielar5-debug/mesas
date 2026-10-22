const AppError = require('../utils/AppError');

// PASARELA SIMULADA. No se conecta a ningún banco.
// Solo acepta las tarjetas de prueba de esta lista: cualquier otro número (incluida una tarjeta
// real) se rechaza antes de procesarse, y nunca se guarda el número completo ni el CVV.
const TARJETAS_PRUEBA = [
  { numero: '4242424242424242', marca: 'VISA',       aprobada: true,  detalle: 'Pago aprobado' },
  { numero: '5555555555554444', marca: 'MASTERCARD', aprobada: true,  detalle: 'Pago aprobado' },
  { numero: '4000000000000002', marca: 'VISA',       aprobada: false, detalle: 'Rechazada por el banco',  motivo: 'Tarjeta rechazada por el banco' },
  { numero: '4000000000009995', marca: 'VISA',       aprobada: false, detalle: 'Fondos insuficientes',    motivo: 'Fondos insuficientes' }
];

// Datos públicos para mostrar en la interfaz (sin campos internos)
const listarTarjetasPrueba = () =>
  TARJETAS_PRUEBA.map(({ numero, marca, aprobada, detalle }) => ({ numero, marca, aprobada, detalle }));

// Algoritmo de Luhn: detecta números de tarjeta mal digitados
function luhnValido(numero) {
  let suma = 0, doble = false;
  for (let i = numero.length - 1; i >= 0; i--) {
    let d = Number(numero[i]);
    if (doble) { d *= 2; if (d > 9) d -= 9; }
    suma += d;
    doble = !doble;
  }
  return suma % 10 === 0;
}

// Valida los datos y devuelve { aprobado, marca, ultimos4, motivo }.
// Datos mal formados -> AppError 400 (no es un rechazo del banco, no se registra pago).
function procesarTarjeta(t = {}) {
  const numero = String(t.numero ?? '').replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(numero) || !luhnValido(numero)) throw new AppError('Número de tarjeta inválido');

  const titular = String(t.titular ?? '').trim();
  if (titular.length < 3 || titular.length > 80) throw new AppError('Nombre del titular inválido');

  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(t.vencimiento ?? '').trim());
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) throw new AppError('Vencimiento inválido (use MM/AA)');
  // la tarjeta vale hasta el último día del mes indicado
  if (new Date(2000 + Number(m[2]), Number(m[1]), 1) <= new Date()) throw new AppError('La tarjeta está vencida');

  if (!/^\d{3,4}$/.test(String(t.cvv ?? ''))) throw new AppError('CVV inválido');

  const prueba = TARJETAS_PRUEBA.find((x) => x.numero === numero);
  if (!prueba) throw new AppError('Modo simulación: use una de las tarjetas de prueba indicadas. No ingrese tarjetas reales.');

  return { aprobado: prueba.aprobada, marca: prueba.marca, ultimos4: numero.slice(-4), motivo: prueba.motivo || null };
}

module.exports = { procesarTarjeta, listarTarjetasPrueba };
