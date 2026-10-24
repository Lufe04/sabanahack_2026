# Integración: envío de capturas al dashboard de arándanos

Guía para los sistemas que envían datos al dashboard: la app del robot con cámara y los sensores.

## 1. Tecnología

| Pieza | Tecnología |
|---|---|
| Aplicación y API | Next.js 16 (App Router, route handlers), TypeScript, Node.js 24 |
| Validación | Zod 4 |
| Base de datos | PostgreSQL 17 en **Neon**, aprovisionado desde Vercel Marketplace (región `iad1`, Virginia) |
| ORM | Drizzle ORM con el driver `pg` |
| Alojamiento | Vercel (Fluid Compute) |
| Zona horaria | America/Bogota (UTC-5). Las fechas se envían en ISO 8601 con zona |

URL base de producción: `https://arandanos-dashboard.vercel.app`

## 2. Endpoints

Los endpoints de `/api/ingesta` y `/api/lotes` están probados en producción. `/api/events` y `/api/recorridos` usan el adaptador 0.2.2 de la APK (sección 4).

| Método | Ruta | Qué recibe | Auth |
|---|---|---|---|
| `POST` | `/api/ingesta/lecturas` | Lote de lecturas de sensores (hasta 5000) | Sí |
| `POST` | `/api/events` | Observaciones y estados de recorrido de la APK Cultivos a bordo 0.2.2 | Sí |
| `GET` | `/api/events?after=0&lote=L01` | Consulta entre servidores, hasta 100 registros con cursor | Clave de lectura |
| `GET` | `/api/events/{id}/photo` | JPEG de una captura, entre servidores | Clave de lectura |
| `GET` | `/api/recorridos?lote=L01` | GeoJSON de rutas para mapas, entre servidores | Clave de lectura |
| `GET` | `/api/lotes` | Lotes con su estado actual (para validar IDs) | No |

## 3. Autenticación

Token compartido en una cabecera. Se acepta cualquiera de las dos formas:

```
Authorization: Bearer <INGEST_API_KEY>
x-api-key: <INGEST_API_KEY>
```

El token se entrega por un canal privado. Está guardado en Vercel como variable `INGEST_API_KEY` de tipo sensitive y no se puede volver a leer desde el panel. Para rotarlo se crea uno nuevo y se redespliega.

## 4. APK Cultivos a bordo 0.2.2: `/api/events` y `/api/recorridos`

El receptor usa el código del adaptador **Integracion_dashboard 0.2.2** copiado en `src/lib/cultivos/adaptador/`. Las reglas de validación, la idempotencia y el GeoJSON son las del adaptador, probadas con JSON generados por Android. La conexión vive en `src/lib/cultivos/servicio.ts`.

URL base que se escribe en **Receptor** de la APK: `https://arandanos-dashboard.vercel.app/api`. La app agrega `/events` y, para importar contornos, usa `/api/lotes`.

| Ruta | Para qué | Clave |
|---|---|---|
| `POST /api/events` | Observaciones (`observation`) y estados de recorrido (`route_snapshot`) | `INGEST_API_KEY` |
| `GET /api/events?after=0&lote=L01` | Hasta 100 registros con cursor `siguiente` | `DASHBOARD_READ_API_KEY` |
| `GET /api/events/{id}/photo` | JPEG de una captura; 404 si no tiene | `DASHBOARD_READ_API_KEY` |
| `GET /api/recorridos?lote=L01` | `FeatureCollection` con `boundary`, `route`, `waypoint` y `position` | `DASHBOARD_READ_API_KEY` |
| `GET /recorridos/geojson` | Mismo GeoJSON para los mapas del propio dashboard | Ninguna (ver nota) |

Respuestas del receptor: `201` al guardar, `200` con `new:false` al reintentar el mismo contenido, `409` si el UUID se reutiliza con otro contenido, `422` si el lote no está en el catálogo, `400` si no cumple el contrato, `413` si el JSON supera 3,5 MB, `415` si no es JSON y `401` sin token.

Cómo se integró:

- **Catálogo de lotes.** El adaptador valida el lote contra la tabla `lotes` del dashboard, la misma que publica `/api/lotes`. No se usa `cultivos_lotes`.
- **Tablas.** `cultivos_registros` y `cultivos_recorridos` tienen las columnas y restricciones de `001_cultivos.sql`, más `revision_humana` y `revisado_en`. No tienen clave foránea al catálogo, para que recargar la simulación nunca borre evidencia real.
- **Demo simulada.** Los registros con `simulated:true` se muestran con el distintivo **Recorrido simulado · cámara real** y se cuentan aparte de las revisiones reales.
- **Mapa.** `leaflet-routes.mjs` se monta sobre la instancia Leaflet existente, sin reemplazar el fondo satelital, en Hoy, Recorridos, el detalle de cada lote y el detalle de cada recorrido.
- **Nota de seguridad.** El dashboard no tiene login en el MVP. Por eso `/recorridos/geojson` y las fotos de `/capturas/{id}/foto` tienen la misma visibilidad que el resto del dashboard. Al agregar sesión, hay que verificarla en esas dos rutas.

### Bloque y cama asignados en el MVP

La app todavía envía las capturas en el formato antiguo: sin `route_context`, así que llegan sin bloque, cama ni planta. Lo único que identifica la planta es el texto de `mission` (`arandanos-prueba-01 | planta <uuid>`). Mientras la app no los envíe, el receptor los completa con una regla fija en `src/lib/cultivos/asignacion-mvp.ts`:

- **Bloque:** el que traiga la app; si no trae ninguno, `L01` (constante `BLOQUE_POR_DEFECTO`).
- **Cama y planta:** se derivan del identificador de planta de `mission`, o del UUID del registro si no hay. La misma planta cae siempre en el mismo tag, por ejemplo `L01-C28-P101`.
- Se guarda en `datos.asignacion_mvp`, con `origen` = `app` o `mvp` para cada parte. No cambia `data_hash`, así que los reintentos siguen respondiendo 200 sin duplicar.
- Si la app empieza a enviar `route_context.lot_id` y la cama (`bed` y `plant_position`), se usan esos valores y la regla deja de actuar.
- Para completar registros que ya estaban en la base: `npx dotenv -e .env.production.local -- tsx scripts/completar-capturas.ts`.

### Cambios sobre el código del adaptador 0.2.2

Para que el equipo de la APK los lleve a su versión:

1. **`repository.mjs`: catálogo configurable.** `makeRepository(pool, { tablaLotes })`. El valor por defecto sigue siendo `cultivos_lotes`.
2. **`repository.mjs`: el cursor de `GET /api/events` se ordenaba como texto.** La consulta seleccionaba `seq::text` y luego hacía `ORDER BY seq`, y PostgreSQL ordenaba por ese alias de texto: 1, 10, 11, …, 2. Con más de 9 registros, `siguiente` apuntaba a un registro equivocado y la paginación repetía o saltaba registros. Se corrigió con `ORDER BY cultivos_registros.seq`. Lo cubre la prueba `tests/adaptador/cursor.test.mjs`.
3. **`leaflet-routes.mjs`: los puntos se dibujaban vacíos.** `L.geoJSON` aplica `style` también a los `circleMarker` de `pointToLayer`, así que los puntos tomaban `fill:false` y el trazo punteado de la ruta. Se veían como aros sin color de estado, y el clic en su centro caía en la línea de la ruta, no en el punto. Se corrigió devolviendo `{}` en `style` para geometrías `Point`.

### Pruebas

- `npm run test:adaptador`: las 18 pruebas originales del adaptador, sin cambios, más la del cursor. Usan PGlite.
- `npm run probar:apk`: envía por HTTP los JSON de Android a un servidor real y revisa respuestas, reintentos, el feed GeoJSON y las fotos. Variables: `BASE_URL`, `INGEST_API_KEY`, `READ_KEY`.

## 5. `POST /api/ingesta/lecturas`

### Cuerpo

```json
{
  "lecturas": [
    { "sensorId": "L04-HS-1", "ts": "2026-10-24T13:30:00Z", "valor": 57.3 },
    { "sensorId": "L04-HA-1", "ts": "2026-10-24T13:30:00Z", "valor": 91.2 }
  ]
}
```

IDs de sensor: `<lote>-<tipo>-<n>`. Tipos: `HS` humedad del suelo (%), `HA` humedad del aire (%), `TE` temperatura (°C), `RA` radiación solar (W/m²). Ejemplo del lote L04: `L04-HS-1`, `L04-HS-2`, `L04-HA-1`, `L04-TE-1`.

### Respuestas

`200 OK`

```json
{ "ok": true, "insertadas": 2 }
```

`422` sensor inexistente

```json
{ "error": "Sensores desconocidos", "desconocidos": ["L04-XX-9"] }
```

`400` cuando el cuerpo no cumple las reglas y `401` sin token, con el formato `{ "error": "…" }`.

## 6. Ejemplo completo

```bash
curl -X POST https://arandanos-dashboard.vercel.app/api/ingesta/lecturas \
  -H "Authorization: Bearer $INGEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"lecturas":[{"sensorId":"L04-HS-1","ts":"2026-10-24T13:30:00Z","valor":57.3}]}'
```

## 7. Comportamiento a tener en cuenta

- **Lecturas de sensores sin idempotencia.** Reenviar las mismas lecturas las duplica. El robot sí es idempotente por UUID en `/api/events`.
- **Visible de inmediato.** El dashboard no usa caché: un dato aparece en la siguiente carga de la página.
- **Datos simulados.** Mientras el MVP use el simulador, un cron diario sigue agregando datos a la misma base. Al conectar datos reales se desactiva quitando el cron de `vercel.json`.
- **Límite de cuerpo:** 4,5 MB por petición en las funciones de Vercel.

## 8. Acceso directo a PostgreSQL

No se recomienda escribir directo en la base: la API valida y mantiene la consistencia. Si otro componente necesita leer, se le puede dar una rama de Neon o un rol de solo lectura. El esquema completo está en `src/db/schema.ts`.
