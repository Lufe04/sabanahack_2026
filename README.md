# Monitoreo de cultivos de arándano

Dashboard para una finca de arándanos que integra tres fuentes de datos: un robot con cámara que recorre los lotes y clasifica lo que ve, sensores de humedad y ambiente, y el historial de plagas y enfermedades (Trips, Botrytis y Alternaria). Está pensado para el agrónomo: la portada dice qué hacer hoy, y la analítica responde qué tanto se enferman los lotes, cuáles más, cada cuánto y bajo qué condiciones.

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
| `npm run db:timezone` | Fija la zona horaria de la base en America/Bogota (el seed ya lo hace) |
| `npm run db:setup:prod` | Crea tablas y carga datos en la base de producción |
| `npm run test:adaptador` | Pruebas del adaptador de la APK (PGlite, sin red) |
| `npm run probar:apk` | Envía los JSON de Android a un servidor y revisa el contrato |
| `npm run sim:calibrar` | Corre la simulación sin lecturas y muestra conteos de brotes |
| `node scripts/capturas.mjs` | Captura las 7 vistas con Chrome y reporta errores de consola |

Variables de `SEED_DIAS` y `SEED` controlan cuántos días genera el seed y la semilla aleatoria.

## Estructura

```
src/
  app/                 Datos reales: /capturas, /recorridos (APK Cultivos a bordo)
                       Simulación: / (hoy), /bloques, /bloques/[id] (plano), /brotes, /historial, /analitica, /sensores
  app/api/events/      Receptor de la APK: observaciones, fotos y recorridos (idempotente por UUID)
  app/api/recorridos/  Feed GeoJSON de rutas de la APK para otros servidores
  lib/cultivos/        Adaptador 0.2.2 de la APK (adaptador/) y su conexión con el dashboard
  app/api/ingesta/     POST lecturas de sensores
  app/api/cron/        Avanza el simulador un día (Vercel Cron)
  db/schema.ts         Tablas: lotes (bloques), sensores, lecturas, cultivos_* (robot),
                       eventos_enfermedad, cosechas, resumen_diario_lote
  lib/queries/         Consultas SQL del dashboard (ranking, heatmaps, correlaciones)
  lib/recomendaciones.ts Reglas agronómicas que convierten el estado en acciones del día
  lib/simulador/       Clima de la sabana, balance hídrico, modelo de brotes, rondas del robot
  lib/viz/             Paleta y formatos de las gráficas
  components/charts/   Gráficas reutilizables (Recharts)
  components/dashboard Mapa, KPIs, badges, tablas
scripts/seed.ts        Carga el historial simulado
```

## Modelo de datos

- **lotes**: variedad, hectáreas, drenaje, polígono geográfico.
- **sensores** y **lecturas**: serie de tiempo cada 30 min (humedad de suelo y aire, temperatura, radiación). Es la tabla grande, indexada por sensor y fecha.
- **cultivos_registros** y **cultivos_recorridos**: datos reales del robot que envía la APK: lecturas con cuatro puntuaciones, fotos y progreso de cada revisión.
- **eventos_enfermedad**: un brote desde que inicia hasta que se cierra, con fecha de detección y origen (robot o inspección en campo).
- **cosechas**: kilos cosechados y descartados por lote y semana, con la plaga responsable del descarte. De aquí salen las pérdidas en kilos y en pesos (precio de referencia en `src/lib/queries/historial.ts`).
- **resumen_diario_lote**: agregado precalculado por lote y día, incluye el **índice de riesgo** (0 a 100) total y por plaga. El dashboard lee de aquí para no agregar cientos de miles de lecturas en cada carga.

## Cómo funciona el simulador

El simulador es causal, no ruido aleatorio. Eso hace que la analítica tenga señales reales:

1. **Clima** de la sabana de Bogotá: frío, húmedo, con régimen bimodal de lluvias (abril a mayo y octubre a noviembre).
2. **Balance hídrico** por lote: la lluvia infiltra, la evapotranspiración drena y el riego repone. Los lotes con mal drenaje se encharcan.
3. **Brotes**: Botrytis y Alternaria suben con horas de humedad del aire sobre 85 % y con mal drenaje; los trips, al contrario, con rachas secas y cálidas. La tasa de aparición usa el promedio de 5 días y la susceptibilidad de la variedad.
4. **Robot**: recorre cada lote cada 2 a 4 días con la cámara a la altura de la planta y detecta un brote con probabilidad creciente según su severidad. Ve con claridad Botrytis y Alternaria; los trips le cuestan más. Lo que no ve lo encuentran las trampas y la inspección de campo.
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
```

`GET /api/lotes` devuelve el estado actual de cada lote.

## Despliegue en Vercel

El proyecto ya está preparado: conexión a Neon con TLS, cierre de conexiones en Fluid Compute, zona horaria fijada en la base, cron diario que se pone al día si falla, y `.vercelignore` para no subir secretos.

```bash
# 1. Iniciar sesión y vincular el proyecto (una sola vez)
vercel login
vercel link --yes

# 2. Crear la base Postgres (Neon) desde el Marketplace.
#    Inyecta DATABASE_URL y DATABASE_URL_UNPOOLED en el proyecto.
vercel integration add neon

# 3. Secretos de la API de ingesta y del cron
openssl rand -hex 24 | vercel env add INGEST_API_KEY production
openssl rand -hex 24 | vercel env add CRON_SECRET production
openssl rand -hex 24 | vercel env add DASHBOARD_READ_API_KEY production

# 4. Crear tablas y cargar los 6 meses simulados en Neon
vercel env pull .env.production.local --environment=production --yes
npm run db:setup:prod

# 5. Desplegar
npm run deploy
```

Notas:

- El seed sube unas 370.000 lecturas a Neon y tarda uno o dos minutos.
- Vercel llama a `/api/cron/simular-dia` todos los días a las 00:15 de Colombia con el `CRON_SECRET`. Si alguna ejecución falla, la siguiente simula hasta 7 días pendientes.
- Para reiniciar los datos de la demo basta con volver a correr `npm run db:seed:prod`.
- Cuando lleguen datos reales, se elimina el cron de `vercel.json` y los sensores escriben por `/api/ingesta` y el robot por `/api/events`.

## Plano de cada bloque

`/bloques/[id]` dibuja el bloque con sus camas, pasillos y plantas (`src/lib/bloque/plano.ts`, `src/components/bloque/plano-bloque.tsx`):

- Marco de plantación: camas de 1,2 m, pasillos de 1,8 m (3 m entre centros) y plantas cada 0,75 m. Cada planta tiene un tag `BLOQUE-Ccama-Pposición`, por ejemplo `L08-C12-P049`, contando de sur a norte.
- Capa **Sanidad**: afectación por planta (sana, leve, moderada, severa) a partir de los focos de los brotes abiertos del bloque. Los hongos se concentran en la parte baja cuando el drenaje es malo; los trips entran por los bordes y avanzan a lo largo de la cama.
- Capas **Temperatura**, **Humedad del aire** y **Humedad del suelo**: interpoladas desde la posición de los sensores del bloque, con un microclima simulado.
- Encima se ven los puntos reales del robot y la posición de los sensores. Zoom con rueda, doble clic o botones; los tags aparecen al acercarse.

En la base y en la API el bloque conserva el nombre técnico `lote` (`lote_id`, `/api/lotes`, códigos L01 a L10), porque la app del robot ya usa esos identificadores. La interfaz los llama bloques; `/lotes` redirige a `/bloques`.

## Recomendaciones del día

`src/lib/recomendaciones.ts` tiene reglas explícitas y fáciles de ajustar con el agrónomo: riesgo por plaga sobre 30 % sin brote conocido, brotes abiertos, suelo seco o encharcado, sensores caídos y lluvia del día. Cada regla produce una acción con prioridad (urgente, hoy, esta semana).

## Siguientes pasos

- Autenticación y multi finca.
- Fotos del robot en Vercel Blob en vez de `bytea`, conservando el UUID de cada captura.
- Filtro de rango de fechas en Analítica.
- Alertas por WhatsApp o correo cuando un lote pase a riesgo alto.
- Modelo predictivo entrenado con datos reales, reemplazando el índice de riesgo heurístico.
- Si las lecturas crecen a millones, mover `lecturas` a TimescaleDB sin cambiar el esquema.
