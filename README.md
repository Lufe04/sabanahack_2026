# Monitoreo de cultivos de arándano

Dashboard para una finca de arándanos que integra tres fuentes de datos: vuelos de dron por lote, sensores de humedad y ambiente, y el historial de plagas y enfermedades (Trips, Botrytis y Alternaria). Está pensado para el agrónomo: la portada dice qué hacer hoy, y la analítica responde qué tanto se enferman los lotes, cuáles más, cada cuánto y bajo qué condiciones.

Es un MVP con **datos simulados**, pero está armado para recibir datos reales sin tocar el dashboard: el simulador escribe por las mismas tablas que usará la API de ingesta.

## Stack

- **Next.js 16** (App Router, TypeScript) con **Tailwind 4** y **shadcn/ui**
- **Postgres** con **Drizzle ORM**. Local en Docker, en producción Neon vía Vercel Marketplace
- **Recharts** para gráficas y **Leaflet** para el mapa de lotes
- Despliegue en **Vercel**, con un cron diario que avanza el simulador

## Correr en local

```bash
npm install
cp .env.example .env.local        # ajusta tokens si quieres
npm run db:up                      # Postgres en Docker (puerto 5433)
npm run db:push                    # crea las tablas
npm run db:seed                    # genera 6 meses de historia simulada (~1 min)
npm run dev
```

Abre http://localhost:3000.

Scripts útiles:

| Script | Qué hace |
|---|---|
| `npm run db:reset` | Recrea tablas y vuelve a cargar los datos |
| `npm run db:studio` | Explorador visual de la base de datos |
| `npm run sim:calibrar` | Corre la simulación sin lecturas y muestra conteos de brotes |
| `node scripts/capturas.mjs` | Captura las 7 vistas con Chrome y reporta errores de consola |

Variables de `SEED_DIAS` y `SEED` controlan cuántos días genera el seed y la semilla aleatoria.

## Estructura

```
src/
  app/                 Vistas: / (hoy: acciones), /lotes, /lotes/[id], /brotes, /historial, /analitica, /sensores
  app/api/ingesta/     POST lecturas y vuelos (para sensores y dron reales)
  app/api/cron/        Avanza el simulador un día (Vercel Cron)
  db/schema.ts         Tablas: lotes, sensores, lecturas, vuelos_dron, detecciones,
                       eventos_enfermedad, cosechas, resumen_diario_lote
  lib/queries/         Consultas SQL del dashboard (ranking, heatmaps, correlaciones)
  lib/recomendaciones.ts Reglas agronómicas que convierten el estado en acciones del día
  lib/simulador/       Clima de la sabana, balance hídrico, modelo de brotes, dron
  lib/viz/             Paleta y formatos de las gráficas
  components/charts/   Gráficas reutilizables (Recharts)
  components/dashboard Mapa, KPIs, badges, tablas
scripts/seed.ts        Carga el historial simulado
```

## Modelo de datos

- **lotes**: variedad, hectáreas, drenaje, polígono geográfico.
- **sensores** y **lecturas**: serie de tiempo cada 30 min (humedad de suelo y aire, temperatura, radiación). Es la tabla grande, indexada por sensor y fecha.
- **vuelos_dron** y **detecciones**: NDVI, cobertura, área anómala y cada zona enferma identificada con coordenadas, severidad y confianza.
- **eventos_enfermedad**: un brote desde que inicia hasta que se cierra, con fecha de detección y origen (dron o inspección).
- **cosechas**: kilos cosechados y descartados por lote y semana, con la plaga responsable del descarte. De aquí salen las pérdidas en kilos y en pesos (precio de referencia en `src/lib/queries/historial.ts`).
- **resumen_diario_lote**: agregado precalculado por lote y día, incluye el **índice de riesgo** (0 a 100) total y por plaga. El dashboard lee de aquí para no agregar cientos de miles de lecturas en cada carga.

## Cómo funciona el simulador

El simulador es causal, no ruido aleatorio. Eso hace que la analítica tenga señales reales:

1. **Clima** de la sabana de Bogotá: frío, húmedo, con régimen bimodal de lluvias (abril a mayo y octubre a noviembre).
2. **Balance hídrico** por lote: la lluvia infiltra, la evapotranspiración drena y el riego repone. Los lotes con mal drenaje se encharcan.
3. **Brotes**: Botrytis y Alternaria suben con horas de humedad del aire sobre 85 % y con mal drenaje; los trips, al contrario, con rachas secas y cálidas. La tasa de aparición usa el promedio de 5 días y la susceptibilidad de la variedad.
4. **Dron**: vuela cada 4 a 6 días por lote, mide NDVI (que cae con enfermedad y estrés hídrico) y detecta hongos con facilidad pero trips casi nunca. Lo que el dron no ve lo encuentran las trampas y la inspección de campo.
5. **Tratamiento**: al detectar un brote se acorta su duración y se limita su severidad.
6. **Cosecha**: cada lunes se registra la semana anterior. El potencial depende de variedad, edad del cultivo y época del año; el descarte crece con el área afectada y la severidad de los brotes activos.

Dos sensores dejan de reportar al final del período para probar la vista de sensores caídos.

## API de ingesta

Autenticación con `Authorization: Bearer <INGEST_API_KEY>`.

```bash
# Lecturas de sensores (hasta 5000 por llamada)
curl -X POST https://<host>/api/ingesta/lecturas \
  -H "Authorization: Bearer $INGEST_API_KEY" -H "content-type: application/json" \
  -d '{"lecturas":[{"sensorId":"L01-HS-1","ts":"2026-10-23T12:00:00Z","valor":41.2}]}'

# Vuelo de dron con detecciones
curl -X POST https://<host>/api/ingesta/vuelos \
  -H "Authorization: Bearer $INGEST_API_KEY" -H "content-type: application/json" \
  -d '{"loteId":"L04","dronId":"DJI-M3M-01","fecha":"2026-10-23T13:00:00Z","duracionMin":18,
       "coberturaPct":98,"ndvi":0.68,"ndviMin":0.52,"areaAnomalaPct":6.1,
       "detecciones":[{"enfermedad":"botrytis","severidad":3,"plantasAfectadasPct":8,
                       "lat":4.9897,"lng":-73.8978,"confianza":0.86}]}'
```

`GET /api/lotes` devuelve el estado actual de cada lote.

## Despliegue en Vercel

1. `vercel link` y luego `vercel integration add neon` para crear la base de datos. Neon inyecta `DATABASE_URL`.
2. Agrega `INGEST_API_KEY` y `CRON_SECRET` con `vercel env add`.
3. `vercel env pull .env.local` y corre `npm run db:push` y `npm run db:seed` contra Neon.
4. `vercel deploy --prod`. El cron de `vercel.json` llama a `/api/cron/simular-dia` cada madrugada para que el dashboard siga vivo.

## Recomendaciones del día

`src/lib/recomendaciones.ts` tiene reglas explícitas y fáciles de ajustar con el agrónomo: riesgo por plaga sobre 30 % sin brote conocido, brotes abiertos, suelo seco o encharcado, vuelos atrasados, sensores caídos y lluvia del día. Cada regla produce una acción con prioridad (urgente, hoy, esta semana).

## Siguientes pasos

- Autenticación y multi finca.
- Imágenes del dron en Vercel Blob, enlazadas desde `vuelos_dron.imagen_url`.
- Filtro de rango de fechas en Analítica.
- Alertas por WhatsApp o correo cuando un lote pase a riesgo alto.
- Modelo predictivo entrenado con datos reales, reemplazando el índice de riesgo heurístico.
- Si las lecturas crecen a millones, mover `lecturas` a TimescaleDB sin cambiar el esquema.
