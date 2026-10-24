# Integración: envío de capturas al dashboard de arándanos

Guía para el sistema que procesa los vuelos del dron (o los sensores) y envía sus resultados al dashboard.

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
| `POST` | `/api/ingesta/vuelos` | Un vuelo de dron con sus detecciones | Sí |
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

### Cambios sobre el código del adaptador 0.2.2

Para que el equipo de la APK los lleve a su versión:

1. **`repository.mjs`: catálogo configurable.** `makeRepository(pool, { tablaLotes })`. El valor por defecto sigue siendo `cultivos_lotes`.
2. **`repository.mjs`: el cursor de `GET /api/events` se ordenaba como texto.** La consulta seleccionaba `seq::text` y luego hacía `ORDER BY seq`, y PostgreSQL ordenaba por ese alias de texto: 1, 10, 11, …, 2. Con más de 9 registros, `siguiente` apuntaba a un registro equivocado y la paginación repetía o saltaba registros. Se corrigió con `ORDER BY cultivos_registros.seq`. Lo cubre la prueba `tests/adaptador/cursor.test.mjs`.
3. **`leaflet-routes.mjs`: los puntos se dibujaban vacíos.** `L.geoJSON` aplica `style` también a los `circleMarker` de `pointToLayer`, así que los puntos tomaban `fill:false` y el trazo punteado de la ruta. Se veían como aros sin color de estado, y el clic en su centro caía en la línea de la ruta, no en el punto. Se corrigió devolviendo `{}` en `style` para geometrías `Point`.

### Pruebas

- `npm run test:adaptador`: las 18 pruebas originales del adaptador, sin cambios, más la del cursor. Usan PGlite.
- `npm run probar:apk`: envía por HTTP los JSON de Android a un servidor real y revisa respuestas, reintentos, el feed GeoJSON y las fotos. Variables: `BASE_URL`, `INGEST_API_KEY`, `READ_KEY`.

## 5. `POST /api/ingesta/vuelos`

Un llamado por vuelo y por lote. Las imágenes **no** se suben a este endpoint: se envía la URL donde ya están alojadas en `imagenUrl`.

### Cuerpo

```json
{
  "loteId": "L04",
  "dronId": "DJI-M3M-01",
  "fecha": "2026-10-24T13:30:00Z",
  "duracionMin": 18.5,
  "coberturaPct": 97.2,
  "ndvi": 0.68,
  "ndviMin": 0.51,
  "areaAnomalaPct": 6.4,
  "imagenUrl": "https://almacen.ejemplo.com/vuelos/L04/2026-10-24.jpg",
  "detecciones": [
    {
      "enfermedad": "botrytis",
      "severidad": 3,
      "plantasAfectadasPct": 7.5,
      "lat": 4.98965,
      "lng": -73.89782,
      "confianza": 0.87
    }
  ]
}
```

| Campo | Tipo | Regla |
|---|---|---|
| `loteId` | string | Debe existir: `L01` a `L10` |
| `dronId` | string | Libre, no vacío |
| `fecha` | string ISO 8601 | Instante del vuelo, con zona (`Z` o `-05:00`) |
| `duracionMin` | número | ≥ 0 |
| `coberturaPct` | número | 0 a 100, porcentaje del lote cubierto |
| `ndvi` | número | -1 a 1, promedio del lote |
| `ndviMin` | número | -1 a 1, zona más débil |
| `areaAnomalaPct` | número | 0 a 100, área marcada como anómala |
| `imagenUrl` | string URL o `null` | Opcional |
| `detecciones` | arreglo | Opcional, por defecto vacío |
| `detecciones[].enfermedad` | enum | `trips`, `botrytis` o `alternaria` |
| `detecciones[].severidad` | entero | 1 (leve) a 5 (crítica) |
| `detecciones[].plantasAfectadasPct` | número | 0 a 100 |
| `detecciones[].lat`, `lng` | número | Coordenadas WGS84 del punto detectado |
| `detecciones[].confianza` | número | 0 a 1, confianza del modelo de visión |

### Respuestas

`201 Created`

```json
{ "ok": true, "vueloId": 354, "detecciones": 1 }
```

`401` sin token o token inválido

```json
{ "error": "No autorizado" }
```

`400` cuerpo inválido. Ejemplo con una enfermedad no soportada:

```json
{
  "error": "Body inválido",
  "detalle": {
    "formErrors": [],
    "fieldErrors": { "detecciones": ["Invalid option: expected one of \"trips\"|\"botrytis\"|\"alternaria\""] }
  }
}
```

`422` lote inexistente

```json
{
  "error": "Lote desconocido",
  "loteId": "L99",
  "lotesValidos": ["L01", "L02", "L03", "L04", "L05", "L06", "L07", "L08", "L09", "L10"]
}
```

## 6. `POST /api/ingesta/lecturas`

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

`400` y `401` con el mismo formato que en vuelos.

## 7. Ejemplo completo

```bash
curl -X POST https://arandanos-dashboard.vercel.app/api/ingesta/vuelos \
  -H "Authorization: Bearer $INGEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d @vuelo.json
```

## 8. Comportamiento a tener en cuenta

- **Sin idempotencia.** Reenviar el mismo vuelo crea un vuelo duplicado. Reintentar solo ante errores de red o respuestas 5xx, no ante 4xx.
- **Transaccional.** Un vuelo y sus detecciones se guardan juntos o no se guarda nada.
- **Visible de inmediato.** El dashboard no usa caché: un vuelo aparece en la siguiente carga de la página.
- **Datos simulados.** Mientras el MVP use el simulador, un cron diario sigue agregando datos a la misma base. Al conectar datos reales se desactiva quitando el cron de `vercel.json`.
- **Límite de cuerpo:** 4,5 MB por petición en las funciones de Vercel.

## 9. Acceso directo a PostgreSQL

No se recomienda escribir directo en la base: la API valida y mantiene la consistencia. Si otro componente necesita leer, se le puede dar una rama de Neon o un rol de solo lectura. El esquema completo está en `src/db/schema.ts`.
