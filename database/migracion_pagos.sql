-- MIGRACIÓN: agrega el sistema de pagos simulados SIN borrar datos existentes.
-- Úsala solo si ya tienes la base creada con el schema anterior. Si empiezas de cero,
-- ejecuta schema.sql (ya incluye todo esto). Ejecutar UNA vez en el SQL Editor de Neon.

-- Valores nuevos del historial (PostgreSQL >= 12 permite esto dentro de una transacción
-- siempre que no se usen en la misma; aquí no se usan).
ALTER TYPE tipo_movimiento ADD VALUE IF NOT EXISTS 'PAGO';
ALTER TYPE tipo_movimiento ADD VALUE IF NOT EXISTS 'REEMBOLSO';

BEGIN;

CREATE TYPE estado_pago        AS ENUM ('PENDIENTE','PAGADO','REEMBOLSADO','NO_REQUERIDO');
CREATE TYPE metodo_pago        AS ENUM ('TARJETA','EFECTIVO');
CREATE TYPE estado_transaccion AS ENUM ('APROBADO','RECHAZADO','REEMBOLSADO');

-- Precio por unidad (USD). Ajusta estos valores o edítalos luego desde la pantalla Inventario.
ALTER TABLE inventario ADD COLUMN precio_unitario NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0);
UPDATE inventario SET precio_unitario = 5.00 WHERE tipo = 'MESA';
UPDATE inventario SET precio_unitario = 1.00 WHERE tipo = 'SILLA';

ALTER TABLE reservas_detalle ADD COLUMN precio_unitario NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0);
ALTER TABLE reservas ADD COLUMN monto_total NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (monto_total >= 0);
ALTER TABLE reservas ADD COLUMN estado_pago estado_pago NOT NULL DEFAULT 'PENDIENTE';

-- Reservas existentes: se les asigna el precio vigente y su monto.
UPDATE reservas_detalle d SET precio_unitario = i.precio_unitario FROM inventario i WHERE i.id = d.inventario_id;
UPDATE reservas r SET monto_total = (SELECT COALESCE(SUM(cantidad*precio_unitario),0) FROM reservas_detalle WHERE reserva_id = r.id);
-- Las canceladas o finalizadas antes de existir los pagos no deben quedar como deuda.
UPDATE reservas SET estado_pago = 'NO_REQUERIDO' WHERE estado IN ('CANCELADA','FINALIZADA') OR monto_total = 0;

CREATE TABLE pagos (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reserva_id       INTEGER NOT NULL REFERENCES reservas(id),
  usuario_id       INTEGER NOT NULL REFERENCES usuarios(id),
  registrado_por   INTEGER NOT NULL REFERENCES usuarios(id),
  monto            NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  metodo           metodo_pago NOT NULL,
  estado           estado_transaccion NOT NULL,
  referencia       VARCHAR(30) NOT NULL UNIQUE,
  tarjeta_marca    VARCHAR(20),
  tarjeta_ultimos4 CHAR(4),
  motivo_rechazo   VARCHAR(120),
  reembolsado_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_pago_aprobado ON pagos (reserva_id) WHERE estado = 'APROBADO';
CREATE INDEX idx_pagos_usuario ON pagos (usuario_id);
CREATE INDEX idx_pagos_reserva ON pagos (reserva_id);

COMMIT;
