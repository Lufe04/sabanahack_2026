# Cultivos a bordo · Monitoreo de arándanos

Entrega para el reto SabanaHack 2026. Un robot con cámara recorre los invernaderos de arándano, un modelo en el teléfono clasifica cada cuadro en **Alternaria, Botrytis, Sana o Trips**, y el dashboard le muestra al agrónomo dónde está el problema, qué tan grave es y qué hacer hoy.

- **Dashboard en producción:** https://arandanos-dashboard.vercel.app
- **Receptor para la app:** `https://arandanos-dashboard.vercel.app/api` (la app agrega `/events`)

## Contenido del repositorio

```
.
├── dashboard/                Dashboard web (Next.js + PostgreSQL), desplegado en Vercel
└── integracion_dashboard/    Paquete de integración de la app Cultivos a bordo 0.2.2
```

Las dos partes están separadas a propósito: cada una tiene su propio `package.json`, sus pruebas y su README, y se pueden revisar o correr de forma independiente.

### `dashboard/`

La aplicación web. Recibe las lecturas de la app, las guarda en PostgreSQL y las muestra junto a una finca simulada para la demo.

- **Hoy:** acciones del día, mapa de calor de la finca y bloques ordenados por prioridad.
- **Bloques:** cada bloque es un invernadero dividido en naves de 9 m con 3 camas. Su plano muestra cada planta con su tag (por ejemplo `B01-N07-C20-P057`) y mapas de calor de sanidad, temperatura y humedad.
- **Capturas:** las lecturas reales del robot, con sus cuatro puntuaciones, la foto de las alertas y la revisión humana.
- **Pérdidas y Patrones:** cuánta fruta se pierde, qué bloques se enferman más, cada cuánto y por qué.
- **Sensores y Conexión del robot:** estado de los equipos y diagnóstico de cada envío de la app.

Cómo correrlo, el modelo de datos y el despliegue están en [`dashboard/README.md`](dashboard/README.md). El contrato de la API está en [`dashboard/docs/INTEGRACION.md`](dashboard/docs/INTEGRACION.md).

### `integracion_dashboard/`

El paquete que entregó el equipo de la app (versión 0.2.2), **sin modificar**: el receptor de referencia (`cultivos/`), la migración SQL, las pruebas con JSON generados por Android y la documentación de la app. Ver [`integracion_dashboard/README.md`](integracion_dashboard/README.md).

El dashboard usa una copia de esos módulos en `dashboard/src/lib/cultivos/adaptador/`, conectada a su base y a su catálogo de bloques. Esa copia tiene tres correcciones, documentadas en `dashboard/docs/INTEGRACION.md`:

1. El catálogo de bloques es configurable (el dashboard valida contra su tabla `lotes`).
2. El cursor de `GET /api/events` ordenaba como texto y fallaba con más de 9 registros.
3. Los puntos de la capa de mapa se dibujaban vacíos y no se podían seleccionar.

## Pruebas

```bash
# Receptor del dashboard: las 18 pruebas del paquete de la app + 1 del cursor
cd dashboard && npm install && npm run test:adaptador

# Paquete de la app, tal como se entregó
cd integracion_dashboard && npm install && npm test
```

## Lo que es real y lo que es simulado

- **Real:** las lecturas que envía la app del robot (puntuaciones, alertas y fotos). Se ven en **Capturas** y sobre las plantas del plano.
- **Simulado:** la finca de 10 bloques, sus sensores, brotes, cosechas y la sanidad por planta del plano. Sirve para mostrar el dashboard completo mientras se acumulan datos reales.
- **Asignado en el MVP:** la app todavía no envía bloque, nave ni cama; el dashboard los asigna con una regla fija a partir del identificador de planta (`dashboard/src/lib/cultivos/asignacion-mvp.ts`).

## Secretos

Ningún token ni contraseña está en el repositorio. Los archivos `.env*.local` están ignorados; los tokens de producción viven en Vercel. Cada carpeta trae un `.env.example` con las variables que necesita.
