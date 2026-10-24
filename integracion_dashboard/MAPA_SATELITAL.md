# Rutas sobre el mapa del dashboard — Android 0.2.2

## Qué está implementado

1. La APK importa los contornos que devuelve `/api/lotes` y los conserva localmente, con URL de origen y fecha.
2. Al crear una demo, genera posiciones de visualización dentro del lote seleccionado y una trayectoria que las conecta. No necesita confirmar cada punto. Los puntos y el avance siguen siendo simulados por tiempo; las puntuaciones y fotos se obtienen de la cámara.
3. Envía la geometría, sus referencias de origen y el progreso con los registros existentes. Conserva la información offline y la incluye en la exportación.
4. El adaptador prepara GeoJSON y una capa de Leaflet para dibujar líneas, puntos y un marcador de posición asignada en el mapa existente. **Esta capa aún debe incorporarse al dashboard original y desplegarse. No se recibió ese código ni se cambió la web publicada.**

## Fondo satelital y datos de la finca

Se aprovecha la capa de imágenes del dashboard. La capa de rutas incluida no reemplaza el fondo, no genera imágenes artificiales y conserva las atribuciones del proveedor. En la captura compartida aparecen Esri, Maxar y Earthstar Geographics; World Imagery combina imágenes satelitales y aéreas. La fecha y resolución dependen de la ubicación y del proveedor; no se ha verificado la fecha de esa imagen concreta.

El catálogo público del dashboard devuelve 10 lotes con sus coordenadas. Se usó ese catálogo para preparar la geometría; **no se verificó en campo que esos polígonos correspondan a los límites reales de las parcelas**. Los contornos de la captura son rectángulos definidos en el dashboard. El técnico debe validarlos o sustituirlos por sus límites medidos si se requiere una representación real de la finca.

Una posición de la demo no identifica una planta observada por satélite ni una ubicación GPS medida del teléfono. El campo de GPS medido `location` continúa nulo para la demo. Las coordenadas de dibujo están en `display_position`, con `source:"simulated_within_lot"` y el registro conserva `simulated:true`.

## Uso de la APK

1. Instalar `Cultivos_a_bordo_0.2.2.apk` sobre la anterior, sin desinstalar ni borrar datos.
2. Con conexión, abrir **Lotes y recorrido → Importar lotes del receptor**. Hazlo de nuevo aunque ya existieran sus nombres en 0.2.1: ahora también se necesita guardar el contorno. Si la URL no estaba configurada, la importación usa por defecto `https://arandanos-dashboard.vercel.app/api/lotes`.
3. Crear una demo para L01 y otra para L02, o para los lotes deseados. Por defecto cada demo tiene 5 puntos de 20 s. El formulario de nuevas demos exige un contorno importado para poder representarlas sobre el mapa.
4. Seleccionar una revisión e iniciar el análisis. El teléfono avanza por los puntos de esa revisión sin confirmaciones individuales. La transición entre revisiones/lotes sigue siendo una selección del operador; no conduce el robot entre ellos.
5. Pausar para cargar o cerrar conserva el punto pendiente. Al reanudar, su temporizador empieza de nuevo; no completa puntos mientras la app está cerrada.
6. Al sincronizar con el adaptador compatible, se guardan geometría y progreso. Con los componentes visuales integrados, el mapa muestra las rutas de los lotes correspondientes y la última posición asignada recibida por el servidor.

La importación inicial requiere alcanzar el servidor de lotes. Después, la geometría queda disponible offline. Las rutas antiguas sin contorno se conservan, pero no se les inventa una geometría retroactiva: crea nuevas demos tras importar para verlas en el mapa.

## Exportación sin conexión al receptor

**Capturas → Exportar ZIP** ahora incluye:

- `routes.geojson`: contornos, trayectorias, puntos y posiciones asignadas disponibles para dibujar.
- `route_state.json`: catálogo local y estado de las revisiones.
- `records/*.json`: puntuaciones y datos por captura/evento.
- `photos/*.jpg`: fotografías guardadas.

El GeoJSON de exportación describe la geometría y progreso; las evidencias se relacionan mediante `inspection_id` y `waypoint_id` con los JSON de records. El feed de mapa del servidor ya realiza esa relación y añade la última observación y disponibilidad de foto a cada punto.

Se puede compartir ese ZIP sin estar en la misma red. El formato GeoJSON se puede cargar directamente en Leaflet; no hace falta convertirlo a un `.raw` para este mapa. Un `.raw` para otro robot/SDK seguiría necesitando su especificación.

## Archivos para tu compañero

En `integracion_dashboard/`:

- `cultivos/geometry.mjs`: validación espacial y conversión a GeoJSON.
- `cultivos/repository.mjs`: persistencia y consulta de revisiones/observaciones.
- `cultivos/http.mjs` y `service.mjs`: recepción y lectura autenticadas.
- `app/api/events/route.js`: recepción existente del adaptador.
- `app/api/recorridos/route.js`: feed GeoJSON para el mapa.
- `client/leaflet-routes.mjs`: capa de dibujo sobre **la instancia Leaflet existente**.
- `Ejemplo_dos_recorridos.geojson`: ejemplo ilustrativo L01/L02, sin medición de plantas ni resultados reales de inspección.

Las tablas de PostgreSQL siguen siendo las de `001_cultivos.sql`. La geometría se guarda en JSONB; no se necesita otra migración de PostgreSQL respecto a 0.2.1. La APK migra automáticamente su SQLite local de versión 2 a 3 para conservar los contornos.

### Feed del mapa

`GET /api/recorridos` devuelve una `FeatureCollection` GeoJSON. `?lote=L01` filtra por lote.

Tipos en `feature.properties.kind`:

- `boundary`: contorno de referencia del catálogo.
- `route`: trayectoria simulada.
- `waypoint`: punto con estado `reviewed`, `current` o `pending`.
- `position`: posición asignada del marcador; avanza al siguiente punto cuando se recibe progreso actualizado.

Las propiedades incluyen `inspection_id`, `lot_id`, `completed`, `total`, `simulated`, y en los puntos pueden incluir `scores`, `observation_id`, `photo_available`, `alert` y `captured_at`. `omitted_routes` indica revisiones antiguas sin coordenadas de visualización.

GeoJSON usa **[longitud, latitud]**. La entrada `poligono` de `/api/lotes` usa **[latitud, longitud]**; la APK realiza esa conversión. No invertir nuevamente los ejes al usar `L.geoJSON`.

### Integración con el mapa Leaflet existente

Importar el módulo desde el componente de mapa que ya corre en el navegador. No crear otra instancia en el mismo contenedor y no sustituir su capa satelital.

```js
import { attachRoutesLayer } from './client/leaflet-routes.mjs';

// L y map son Leaflet y la instancia que ya utiliza el dashboard.
const overlay = attachRoutesLayer(L, map, {
  onPointClick: (point) => {
    // Integrar aquí el panel existente de detalle.
    // point.scores son los cuatro valores de la última observación.
    // point.observation_id permite solicitar la foto si photo_available es true.
  },
  onError: (error) => console.error('No se pudo actualizar el recorrido', error),
});

// Opción A: datos ya obtenidos por el servidor tras validar sesión/permisos.
overlay.setData(geojsonRecorridos);

// Opción B: consultar una ruta que verifique la sesión real del dashboard.
overlay.startPolling(async () => {
  const response = await fetch('/api/recorridos', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}, 10000);

// Sólo al encuadrar por primera vez, si se desea:
// overlay.fit();
// Al desmontar el componente:
// overlay.destroy();
```

**Autenticación pendiente de unir al proyecto original:** el GET del adaptador exige `DASHBOARD_READ_API_KEY` para llamadas entre servidores. La opción B no funcionará desde el navegador hasta que el compañero integre su sesión y filtre los lotes autorizados en ese handler. No colocar esa clave ni `INGEST_API_KEY` en JavaScript del navegador. Como alternativa, un Server Component que ya haya verificado al propietario puede llamar a `(await getRepository()).mapRoutes(loteAutorizado)` y pasar el GeoJSON como prop al componente de mapa.

La misma adaptación de sesión aplica al GET de fotos. El teléfono usa sólo el token de ingesta y no recibe credenciales PostgreSQL.

### Cargar el ejemplo o una exportación manual

En el componente del mapa, una vez elegida la exportación `.geojson` por el usuario:

```js
const geojson = JSON.parse(await archivoSeleccionado.text());
overlay.setData(geojson);
overlay.fit();
```

Esto dibuja lo que contiene el archivo, sin depender de la ingesta. Para que el marcador refleje nuevas revisiones de progreso hay que volver a cargar datos o usar el feed autenticado. El ejemplo incluido tiene progreso ilustrativo y no representa un robot moviéndose ni inspecciones reales.

## Límites de la generación

Se admiten polígonos simples de 3 a 200 vértices y hasta 100 puntos de demo. Se rechazan contornos degenerados, cruzados, con huecos o que crucen el antimeridiano. Los puntos se distribuyen dentro del contorno y se conectan mediante segmentos visibles; en un contorno cóncavo se evita dibujar atajos por fuera del lote. Esta geometría es para visualización: no modela obstáculos, ancho del robot, terreno ni cobertura agronómica.

El reconocimiento sigue analizando la cámara completa en el teléfono; la imagen satelital sirve para ubicar la demostración en el mapa. No se calculan enfermedades, NDVI ni severidad a partir del fondo satelital.

## Validación

45 pruebas Android/JVM y 18 del receptor. Se probaron conversión de ejes, polígonos cóncavos, puntos y trayectorias dentro del contorno, migración/conservación local, dos lotes del catálogo descargado, exportación GeoJSON y recepción de los JSON generados por Android. El feed relaciona la observación/foto correcta con su punto y exige autenticación.

Pendiente: instalar esta APK en el S24 Ultra y comprobar cámara/interfaz reales; integrar y compilar la capa visual dentro del proyecto original, verificar su sesión y desplegar. No se modificó el dashboard publicado ni se midió una ruta física.

Referencias: https://leafletjs.com/reference.html ; https://hub.arcgis.com/datasets/esri%3A%3Aworld-imagery/about ; https://arandanos-dashboard.vercel.app/api/lotes .
