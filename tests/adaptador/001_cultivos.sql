-- Ejecutar como migración. Adaptar cultivos_lotes al catálogo real del dashboard.
-- No modifica ni elimina tablas existentes.
CREATE TABLE IF NOT EXISTS cultivos_lotes (
  id text PRIMARY KEY,
  nombre text NOT NULL
);
CREATE TABLE IF NOT EXISTS cultivos_registros (
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id uuid PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('observation','route_snapshot')),
  lote_id text REFERENCES cultivos_lotes(id),
  capturado_en timestamptz NOT NULL,
  recibido_en timestamptz NOT NULL DEFAULT now(),
  alerta boolean NOT NULL DEFAULT false,
  puntuaciones jsonb,
  datos jsonb NOT NULL,
  foto bytea,
  data_hash text NOT NULL,
  CHECK (NOT alerta OR foto IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS cultivos_registros_lote_fecha ON cultivos_registros(lote_id,capturado_en DESC);
CREATE TABLE IF NOT EXISTS cultivos_recorridos (
  inspection_id uuid PRIMARY KEY,
  plan_id uuid NOT NULL,
  lote_id text NOT NULL REFERENCES cultivos_lotes(id),
  revision bigint NOT NULL,
  fase text NOT NULL,
  completados integer NOT NULL,
  total integer NOT NULL,
  datos jsonb NOT NULL,
  actualizado_en timestamptz NOT NULL,
  recibido_en timestamptz NOT NULL DEFAULT now()
);
-- El ingeniero registra aquí únicamente los lotes reales; usar los mismos IDs de /api/lotes.
-- Ejemplo para pruebas, no ejecutar automáticamente en producción:
-- INSERT INTO cultivos_lotes(id,nombre) VALUES ('L01','Lote de prueba') ON CONFLICT(id) DO NOTHING;
