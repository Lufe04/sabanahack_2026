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

Los endpoints de `/api/ingesta` y `/api/lotes` están probados en producción. `/api/events` está probado en local y queda activo en producción después del próximo despliegue.

| Método | Ruta | Qué recibe | Auth |
|---|---|---|---|
| `POST` | `/api/ingesta/vuelos` | Un vuelo de dron con sus detecciones | Sí |
| `POST` | `/api/ingesta/lecturas` | Lote de lecturas de sensores (hasta 5000) | Sí |
| `POST` | `/api/events` | Observaciones y estados de recorrido de la APK Cultivos a bordo 0.2.0 | Sí |
| `GET` | `/api/events?after=0&lote=L01` | Consulta entre servidores, hasta 100 registros con cursor | Clave de lectura |
| `GET` | `/api/events/{id}/photo` | JPEG de una captura, entre servidores | Clave de lectura |
| `GET` | `/api/lotes` | Lotes con su estado actual (para validar IDs) | No |

## 3. Autenticación

Token compartido en una cabecera. Se acepta cualquiera de las dos formas:

```
Authorization: Bearer <INGEST_API_KEY>
x-api-key: <INGEST_API_KEY>
```

El token se entrega por un canal privado. Está guardado en Vercel como variable `INGEST_API_KEY` de tipo sensitive y no se puede volver a leer desde el panel. Para rotarlo se crea uno nuevo y se redespliega.

## 4. `POST /api/events` (APK Cultivos a bordo 0.2.0)

URL base que se escribe en **Receptor** de la APK: `https://arandanos-dashboard.vercel.app/api`. La app agrega `/events`.

### Tipos de evento

- `type: "observation"`: cuatro puntuaciones de 0 a 1 (`alternaria`, `botrytis`, `sana`, `trips`), `alert`, `capture_mode` (`periodic`, `automatic`, `manual`, `route_reference`), foto JPEG opcional en `photo_base64` sin prefijo `data:`, y `route_context` con `inspection_id`, `plan_id`, `lot_id`, `waypoint_id` y `location`.
- `type: "route_snapshot"`: objeto `route` con `id` de revisión, `plan_id`, `lot_id`, `name`, `phase`, `completed`, `revision`, `updated_at` y `waypoints`.
- Capturas de versiones anteriores sin `type`: se aceptan como capturas antiguas, sin inventarles lote ni recorrido.

### Reglas del receptor

| Caso | Respuesta |
|---|---|
| UUID nuevo, guardado después del COMMIT | `201` `{"id":"…","status":"stored","new":true}` |
| Mismo UUID y mismo contenido (reintento) | `200` `{"id":"…","status":"stored","new":false}`, sin otra fila ni foto |
| Mismo UUID con contenido distinto | `409`, no sobrescribe |
| Lote que no está en `/api/lotes` | `422` con `lotesValidos` |
| Campo inválido, puntuación fuera de 0 a 1, foto con `data:` o que no es JPEG | `400` |
| Foto mayor a 2.000.000 bytes o JSON mayor a 3.500.000 bytes | `413` |
| Sin token | `401` |

- La foto y sus puntuaciones se guardan en la misma fila de `cultivos_registros`, en la misma transacción. La foto va en una columna `bytea`.
- Cada revisión guarda su última versión en `cultivos_recorridos`. Una versión con `revision` menor o igual que llega tarde queda en el historial, pero no hace retroceder el progreso.
- NDVI, cobertura, severidad y área afectada no se piden ni se calculan para estas observaciones.
- Estas tablas no se mezclan con la simulación y no tienen clave foránea a `lotes`, así que recargar la simulación no borra capturas reales.
- Vercel limita el cuerpo de las funciones a 4,5 MB. Los límites de la APK quedan por debajo.

### Consulta entre servidores

`GET /api/events?after=0&lote=L01&limit=100` con `Authorization: Bearer <DASHBOARD_READ_API_KEY>`. Responde `{ "registros": [...], "siguiente": <seq o null> }`; para la página siguiente se pasa `after=<siguiente>`. Los registros no traen los bytes de la foto, solo `tiene_foto`. La foto se pide en `GET /api/events/{id}/photo`, que responde `404` si no hay foto. Esta clave nunca debe ir al navegador.

Pruebas del contrato: `scripts/probar-events.mjs` (ver el encabezado del archivo).

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
