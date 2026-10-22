-- MIGRACIÓN: agrega facturas (Consumidor Final y Crédito Fiscal) SIN borrar datos existentes.
-- Úsala si ya tienes la base creada. Si empiezas de cero, schema.sql ya incluye todo esto.
-- Ejecutar UNA vez en el SQL Editor de Neon.

BEGIN;

CREATE TYPE tipo_factura AS ENUM ('CONSUMIDOR_FINAL','CREDITO_FISCAL');

-- correlativos independientes por tipo de documento
CREATE SEQUENCE factura_cf_seq;    -- FCF-00000001
CREATE SEQUENCE factura_ccf_seq;   -- CCF-00000001

CREATE TABLE facturas (
  id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pago_id            INTEGER NOT NULL UNIQUE REFERENCES pagos(id),      -- una factura por pago
  reserva_id         INTEGER NOT NULL REFERENCES reservas(id),
  usuario_id         INTEGER NOT NULL REFERENCES usuarios(id),          -- dueño de la reserva
  emitida_por        INTEGER NOT NULL REFERENCES usuarios(id),
  tipo               tipo_factura NOT NULL,
  numero             VARCHAR(20) NOT NULL UNIQUE,
  -- receptor
  cliente_nombre     VARCHAR(120) NOT NULL,
  cliente_email      VARCHAR(160) NOT NULL,
  cliente_documento  VARCHAR(20),     -- Consumidor final: DUI (opcional) · Crédito fiscal: NIT
  cliente_nrc        VARCHAR(10),
  cliente_giro       VARCHAR(120),
  cliente_direccion  VARCHAR(200),
  -- montos (el precio de la reserva ya incluye IVA)
  items              JSONB NOT NULL,
  subtotal           NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),      -- venta gravada (sin IVA)
  iva                NUMERIC(10,2) NOT NULL CHECK (iva >= 0),
  total              NUMERIC(10,2) NOT NULL CHECK (total > 0),
  iva_tasa           NUMERIC(5,4)  NOT NULL,
  -- envío por correo (Brevo)
  enviada_at         TIMESTAMPTZ,
  envios             INTEGER NOT NULL DEFAULT 0,
  brevo_message_id   VARCHAR(200),
  error_envio        VARCHAR(300),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT factura_total_ok CHECK (total = subtotal + iva),
  CONSTRAINT factura_ccf_datos CHECK (tipo = 'CONSUMIDOR_FINAL' OR
    (cliente_documento IS NOT NULL AND cliente_nrc IS NOT NULL AND cliente_giro IS NOT NULL AND cliente_direccion IS NOT NULL))
);
CREATE INDEX idx_facturas_usuario ON facturas (usuario_id);

COMMIT;
