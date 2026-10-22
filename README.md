# Sistema de Gestión de Mesas y Sillas

Node.js + Express + PostgreSQL (Neon) + frontend HTML/CSS/JS. Una sola app: Express sirve `frontend/`.

## Estructura
```
database/ (schema.sql, migracion_pagos.sql, seed_demo.sql)
backend/ (package.json, .env.example, src/{config,controllers,middleware,routes,services,utils,app.js})
frontend/ (html, css/, js/)
```

## 1. Crear la base en Neon
1. Entra a https://neon.tech y crea un proyecto.
2. En **Connection Details** copia la cadena (`postgresql://...?sslmode=require`).

## 2. Ejecutar schema.sql
En Neon: **SQL Editor** → pega todo `database/schema.sql` → **Run**.
(El script borra y recrea las tablas; incluye datos de prueba.)

## 2a. ¿Ya tenías la base creada? (migración de pagos)
`schema.sql` **borra y recrea todo**. Si ya tienes datos que quieres conservar, ejecuta en su lugar
`database/migracion_pagos.sql` (una sola vez): agrega precios, estado de pago y la tabla `pagos` sin tocar tus datos.
Las reservas existentes reciben su monto según el precio vigente; las canceladas/finalizadas quedan sin deuda.

## 2a-bis. Facturas (migración)
Si ya tienes la base creada, ejecuta **una vez** `database/migracion_facturas.sql` (crea `facturas` y sus correlativos).
Sin ella, la pantalla **Pagos** dará error porque ahora consulta esa tabla. Con una base nueva, `schema.sql` ya lo incluye.

## 2b. (Opcional) Datos para las gráficas
Ejecuta `database/seed_demo.sql` en Neon para tener historial de 7 días.

## 3. Configurar .env
```
cd backend
cp .env.example .env
```
Edita `.env`:
```
DATABASE_URL=<cadena de Neon>
JWT_SECRET=<texto largo aleatorio>
PORT=10000
NODE_ENV=production
```

## 4. Ejecutar local
```
cd backend
npm install
npm start
```
Abre http://localhost:10000

## 5. GitHub
```
git init
git add .
git commit -m "Sistema de mesas y sillas"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```
`.env` está en `.gitignore`; no se sube.

## 6. Desplegar en Render
1. Render → **New → Web Service** → conecta el repo.
2. **Root Directory:** `backend`
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. **Environment Variables:**
   - `DATABASE_URL` = cadena de Neon
   - `JWT_SECRET` = secreto largo
   - `NODE_ENV` = `production`
   - `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` y los `EMPRESA_*` (ver sección Facturas)
   - (`PORT` lo asigna Render)
6. Deploy. Health check: `/health`.

## 7. Probar la API
```
# login
curl -X POST $URL/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Admin123!"}'

# inventario / dashboard
curl $URL/api/inventario -H "Authorization: Bearer TOKEN"
curl $URL/api/dashboard  -H "Authorization: Bearer TOKEN"

# reserva confirmada (admin)
curl -X POST $URL/api/reservas -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"usuario_id":2,"fecha":"2030-01-10","hora_inicio":"08:00","hora_fin":"12:00","mesas":2,"sillas":30,"confirmar":true}'

# pagar una reserva con tarjeta de prueba (el dueño o un ADMIN)
curl -X POST $URL/api/reservas/2/pagar -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"metodo":"TARJETA","tarjeta":{"numero":"4242424242424242","titular":"Ana Perez","vencimiento":"12/30","cvv":"123"}}'

# préstamo desde reserva
curl -X POST $URL/api/prestamos -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"reserva_id":4,"fecha_prevista_devolucion":"2030-01-12T12:00:00Z"}'

# devolución parcial
curl -X POST $URL/api/devoluciones -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"prestamo_id":4,"mesas":1,"sillas":15}'
```

## Endpoints
| Método | Ruta | Rol |
|---|---|---|
| POST | /api/auth/login, /api/auth/register | público |
| GET | /api/inventario | todos |
| POST/PUT | /api/inventario(/:id) | ADMIN |
| GET/POST | /api/reservas | todos (USER ve solo las suyas) |
| POST | /api/reservas/:id/confirmar | ADMIN |
| POST/DELETE | /api/reservas/:id/cancelar, /api/reservas/:id | dueño o ADMIN (reembolsa si estaba pagada) |
| POST | /api/reservas/:id/pagar | dueño o ADMIN (`EFECTIVO` solo ADMIN) |
| GET | /api/pagos | todos (USER solo los suyos) |
| GET | /api/pagos/tarjetas-prueba | todos |
| POST | /api/facturas | dueño del pago o ADMIN (emite y envía por correo) |
| POST | /api/facturas/:id/reenviar | dueño o ADMIN |
| GET | /api/prestamos(/:id) | todos (USER solo suyos) |
| POST/PUT | /api/prestamos(/:id) | ADMIN |
| GET | /api/devoluciones | todos (USER solo suyas) |
| POST | /api/devoluciones | ADMIN |
| GET | /api/historial | ADMIN |
| GET | /api/dashboard | todos (USER: datos propios) |
| GET/POST/PUT | /api/usuarios | ADMIN |

## Pagos simulados
Cada reserva tiene un **monto** = Σ cantidad × precio unitario (mesas $5.00, sillas $1.00 en los datos de prueba).
Los precios los edita el ADMIN en **Inventario**; el monto se fija al crear la reserva, así que un cambio de precio
solo afecta a reservas futuras.

**Flujo:** el usuario crea la reserva → paga (en el momento o después) → el ADMIN la confirma como siempre.
El pago **no confirma** la reserva automáticamente ni descuenta stock; son procesos independientes.

**Estados de pago** (`reservas.estado_pago`): `PENDIENTE` → `PAGADO` → `REEMBOLSADO`; `NO_REQUERIDO` si el monto es $0
o si se canceló sin haber pagado. Cada intento queda en la tabla `pagos` (`APROBADO`, `RECHAZADO` o `REEMBOLSADO`).

**Reglas:**
- Solo se puede pagar si `estado_pago = PENDIENTE` y la reserva no está cancelada. El pago es por el total (no hay abonos).
- Pagos concurrentes de la misma reserva: solo uno se aprueba (reserva bloqueada con `FOR UPDATE` + índice único parcial).
- Cancelar una reserva pagada **reembolsa el total automáticamente**, en la misma transacción que libera el stock.
- Los pagos aprobados y los reembolsos quedan en el **Historial** (tipos `PAGO` y `REEMBOLSO`). Los intentos rechazados se ven solo en la pantalla **Pagos**.
- Un pago `EFECTIVO` solo lo registra un ADMIN (no pasa por la pasarela).

**Tarjetas de prueba** (cualquier titular, vencimiento futuro, CVV de 3–4 dígitos):

| Número | Resultado |
|---|---|
| 4242 4242 4242 4242 (VISA) | Aprobado |
| 5555 5555 5555 4444 (MASTERCARD) | Aprobado |
| 4000 0000 0000 0002 (VISA) | Rechazada por el banco (HTTP 402) |
| 4000 0000 0000 9995 (VISA) | Fondos insuficientes (HTTP 402) |

> ⚠️ **No usa ninguna pasarela real.** Por seguridad solo acepta estas tarjetas: cualquier otro número, incluso una
> tarjeta real válida, se rechaza antes de procesarse. Nunca se guarda el número completo ni el CVV (solo marca y
> últimos 4 dígitos). Para integrar una pasarela real (Stripe, Wompi, etc.) se reemplaza `services/pasarela.service.js`
> y los datos de tarjeta deben capturarse con los campos alojados del proveedor, no con formularios propios.

## Facturas por correo (Brevo)
Cada **pago aprobado** puede tener **una** factura, de dos tipos:

| Tipo | Correlativo | Datos del receptor |
|---|---|---|
| Consumidor final | `FCF-00000001` | nombre (DUI opcional). Precio con IVA incluido. |
| Crédito fiscal | `CCF-00000001` | razón social, NIT, NRC, giro y dirección (obligatorios). Se desglosa venta gravada + IVA. |

**Uso:** en **Pagos** (o desde el comprobante al pagar) pulsa **Facturar** → elige el tipo → el correo se envía al instante.
Si el pago ya tiene factura, el botón pasa a **Reenviar** (se puede cambiar el correo destino). El tipo no se puede cambiar una vez emitida.

**IVA:** los precios de las reservas ya incluyen IVA (13 %, configurable con `IVA_RATE`). Se calcula en centavos enteros
para que `subtotal + IVA = total` sea exacto.

**Si el correo falla** (clave inválida, remitente sin verificar, etc.) la factura queda igualmente emitida con el error guardado
(`facturas.error_envio`) y se reintenta con **Reenviar**.

### Configurar Brevo
1. Crea una cuenta en https://www.brevo.com y genera una clave en **SMTP & API → API Keys** → `BREVO_API_KEY`.
2. En **Senders, Domains & Dedicated IPs → Senders** agrega y **verifica** el correo remitente → `BREVO_SENDER_EMAIL`.
   Brevo rechaza envíos desde remitentes no verificados.
3. Si en **Security → Authorized IPs** tienes el bloqueo por IP activo, desactívalo: Render usa IPs dinámicas y
   el envío falla con `unrecognised IP address`.
4. Completa los datos del emisor (`EMPRESA_NOMBRE`, `EMPRESA_NIT`, `EMPRESA_NRC`, `EMPRESA_GIRO`, `EMPRESA_DIRECCION`, `EMPRESA_TELEFONO`).

El envío usa la API REST de Brevo por HTTPS (sin SMTP ni dependencias nuevas; requiere Node >= 18).

> ⚠️ **Documento de práctica.** Igual que los pagos, las facturas son simuladas: no son Documentos Tributarios Electrónicos
> (DTE) ni se transmiten al Ministerio de Hacienda, y el correo lo indica. Para facturación fiscal real hay que integrar
> un proveedor/firmador de DTE. Tampoco se genera nota de crédito cuando se reembolsa un pago ya facturado.

## Reglas de inventario
- Reserva PENDIENTE no descuenta stock. Al CONFIRMAR: disponible → reservada.
- Cancelar confirmada: reservada → disponible.
- Préstamo desde reserva: reservada → prestada (reserva pasa a FINALIZADA). Préstamo directo: disponible → prestada.
- Devolución (total o parcial): prestada → disponible.
- Todo en transacción con `SELECT … FOR UPDATE`; `CHECK` en PostgreSQL garantiza `total = disponible + reservada + prestada`.
- `movimientos` es inmutable (trigger).

## Usuarios de prueba
| Correo | Contraseña | Rol |
|---|---|---|
| admin@demo.com | Admin123! | ADMIN |
| user1@demo.com | User123! | USER |
| user2@demo.com | User123! | USER |
