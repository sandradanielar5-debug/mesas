const AppError = require('../utils/AppError');

// Envío de correo transaccional con la API REST de Brevo (https://developers.brevo.com).
// Usa HTTPS (puerto 443) en lugar de SMTP, así funciona también en hostings que bloquean SMTP.
// No requiere dependencias: usa el fetch nativo de Node >= 18.
const URL_BREVO = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 15000;

const configurado = () => Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);

// Devuelve { messageId }. Lanza AppError 503 si falta configuración, o Error si Brevo rechaza el envío.
async function enviar({ to, toName, subject, html, text, tags = [] }) {
  if (!configurado()) throw new AppError('El envío de correos no está configurado (faltan BREVO_API_KEY o BREVO_SENDER_EMAIL)', 503);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL_BREVO, {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: process.env.BREVO_SENDER_NAME || 'Mesas Rosas', email: process.env.BREVO_SENDER_EMAIL },
        to: [{ email: to, name: toName || undefined }],
        subject, htmlContent: html, textContent: text, tags
      }),
      signal: ctrl.signal
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(`Brevo rechazó el envío (${res.status}): ${data.message || 'error desconocido'}`);
    return { messageId: data.messageId || null };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Brevo no respondió a tiempo');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { enviar, configurado };
