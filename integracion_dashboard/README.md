# Compatibilidad del dashboard y recorridos — APK 0.2.2

## Actualización 0.2.2: posiciones para el mapa satelital

La APK importa contornos, genera puntos/trayectoria simulados dentro del lote y envía geometría con el progreso. El receptor expone `/api/recorridos` como GeoJSON y el módulo `client/leaflet-routes.mjs` dibuja las rutas sobre la instancia Leaflet existente. **Falta incorporar esa capa a la interfaz original y desplegarla**; no se modificó la web publicada. Consulta **MAPA_SATELITAL.md** para integración, autenticación, exportación y límites. Los contornos proceden del catálogo del dashboard y no se verificaron en campo. El fondo satelital/aéreo existente se conserva.

## Nuevo: demo automática para la hackathon (0.2.1)

La app puede simular la ruta por tiempo mientras ejecuta el modelo sobre la cámara real. Usa **Lotes y recorrido → Crear demo automática (hackathon)**; por defecto son 5 puntos de 20 segundos. Sólo pulsa Iniciar una vez: los puntos se completan automáticamente mientras la app analiza, sin confirmación por punto. Al pausar/cargar/cerrar conserva el punto pendiente; su temporizador reinicia al reanudar. No necesita GPS ni referencias individuales para crear la demo.

La ubicación y la llegada están simuladas; no se inventan coordenadas ni puntuaciones. La pantalla muestra SIMULACIÓN. El backend recibe `simulated:true`, `simulation_scope:"route_progress_only"` y contexto `navigation_mode:"timed_simulation"`. Cada punto completado lleva `completion_source:"timed_simulation"`; el feed de consulta incluye `simulado`. La foto de alerta y los cuatro valores siguen correspondiendo al cuadro realmente analizado.

El dashboard debe mostrar **Recorrido simulado · cámara real** y separar sus estadísticas de las reales. Excluir `COALESCE((datos->>'simulated')::boolean,false)=true` en estadísticas de recorridos reales. Actualiza el código receptor de este paquete; los puntos virtuales tienen referencia nula sólo dentro del modo simulado. No se necesita nueva migración SQL respecto a 0.2.0: las marcas se conservan en JSONB.

Las instrucciones de registro de puntos y confirmación manual de las siguientes secciones corresponden al **modo asistido**. Para la demostración consulta el archivo `DEMO_HACKATHON.md` incluido.

## Resultado de esta entrega

La APK conserva el modelo experimental v5 y lo ejecuta en el teléfono. No se reentrenó el modelo en esta actualización.

- Durante una revisión guarda las cuatro puntuaciones cada 10 segundos: Alternaria, Botrytis, Sana y Trips. Se guardan los valores reales; no se modifica el resultado para aumentar Sana.
- Una alerta automática incluye la foto y esas mismas puntuaciones del cuadro analizado. Las lecturas periódicas llevan valores sin foto.
- Guardar foto y registrar un punto del recorrido son excepciones explícitas: también incluyen foto por solicitud del usuario.
- Cada registro tiene UUID estable, fecha UTC, lote, revisión y punto del plan. Puntuaciones de 0 a 1; el dashboard puede mostrarlas multiplicadas por 100.
- La fotografía y las puntuaciones corresponden al mismo cuadro. No se toma otra foto distinta después de clasificarlo.
- El correo queda aplazado y no se configura en este paquete.

El modelo clasifica el encuadre completo: una lectura no equivale a una planta identificada. Las puntuaciones no están calibradas como probabilidades diagnósticas, no indican porcentaje de área enferma y no prueban salud cuando Sana resulta alta.

## Qué hace el recorrido en el modo asistido

El técnico crea o importa lotes y registra un plan como una secuencia ordenada de puntos. Cada punto tiene una fotografía de referencia y GPS opcional con precisión y fecha de la posición. La pantalla dibuja las posiciones GPS cuando todos los puntos tienen ubicación; si falta alguna, muestra un esquema del orden sin escala. No hay mapas de internet ni claves de Google Maps.

Una revisión recorre los puntos de ese plan. Su estado, siguiente punto pendiente y lecturas se guardan inmediatamente en SQLite dentro del teléfono. Al cerrar la app, apagar y volver a abrir o pausar para cargar, se conserva el progreso. El plan puede reutilizarse en una nueva revisión sin borrar las anteriores. El mismo nombre no identifica una revisión: cada una tiene UUID propio.

Completar exige una lectura guardada en el punto actual. La foto de referencia del plan no cuenta como revisión. Después de completar un punto, la cámara se pausa para que el operador se desplace al siguiente y reanude allí, evitando registrar el trayecto como análisis de la siguiente planta.

**Esta es una revisión asistida. No implementa SLAM, reconocimiento automático del lugar por cámara, reubicación visual después de reiniciar, un mapa de obstáculos ni conducción del robot.** Las referencias fotográficas son consultables como capturas, pero no son un mapa métrico navegable. Tampoco verifica que se cubrió toda la superficie del lote: la marca de completo significa que se revisaron todos los puntos definidos por el técnico.

### Uso en el Samsung

1. Instala `Cultivos_a_bordo_0.2.2.apk` encima de la versión anterior. Conserva los datos; no desinstales ni borres almacenamiento.
2. Abre **Lotes y recorrido**. Usa **Importar lotes del receptor** para descargar el catálogo existente de `/api/lotes`, o crea un lote con ID y nombre. Los IDs deben coincidir con los autorizados por el servidor.
3. Crea un recorrido para el lote; el nombre aparece automáticamente con la fecha y puede cambiarse al crearlo.
4. Si deseas ubicación aproximada, activa **GPS opcional** mientras la app está visible. Permite ubicación y activa el GPS del teléfono. Si no existe una posición de menos de 30 segundos, se guarda ubicación nula, sin inventarla. Se admite ubicación aproximada y se conserva su precisión.
5. Camina hasta el primer punto. En **Lotes y recorrido → Añadir punto con foto de cámara**, vuelve a la cámara y apunta a esa referencia: se guarda el próximo cuadro analizado. Repite en los siguientes puntos. Para un plan grande divide el lote en varias rutas; máximo 1000 puntos por plan.
6. Al terminar de registrar, entra en **Lotes y recorrido → Cerrar plan de puntos**. No se siguen añadiendo puntos a ese plan cerrado.
7. Para revisar, vuelve físicamente al primer punto pendiente y pulsa **Iniciar / reanudar**. Espera una lectura periódica o guarda una foto manual. Si aparece una alerta confirmada se guarda foto automática.
8. Pulsa **✓ Punto revisado** cuando hayas inspeccionado ese punto. Desplázate al siguiente y reanuda. No se avanza por GPS ni por parecido de imágenes.
9. Para cargar usa **Pausar para cargar** y enchufa el robot cuando corresponda. Al volver, selecciona la revisión y continúa en el punto pendiente. Si el cierre fue inesperado se conserva el último punto completado: se vuelve a revisar el que quedó pendiente.
10. La revisión queda completa sólo al terminar todos sus puntos. **Nueva revisión del mismo plan** crea otro historial para otra inspección, conservando las anteriores.

El técnico define los lotes; la app no deduce límites de parcelas a partir del video. En el prototipo local no hay separación de roles con contraseña. El dashboard debe aplicar sus permisos de técnico/ingeniero al aprobar lotes y planes. Crear un lote sólo en la APK no lo registra automáticamente en el catálogo autorizado del servidor.

### Carga, autonomía y trabajo diario

Las 10 horas son la autonomía nominal del robot indicada por el usuario, no una medición del S24. La app no interpreta la batería del teléfono como batería del robot ni decide cuándo enchufarlo. La pausa por carga es manual.

No se puede garantizar que termine toda la finca en un día sin conocer: longitud del recorrido, velocidad útil entre plantas, tiempo de inspección por punto, cantidad de robots y tiempo de cada recarga. Que un robot dure 10 horas por carga no determina cuántas recargas necesita al día. Esta versión registra tiempo de análisis aproximado y progreso; no programa un horario garantizado.

La cámara funciona con la app visible y el análisis iniciado. Al salir, bloquear o abrir la pantalla de recorridos se pausa. No hay cámara ni GPS continuos con la app cerrada. Un robot real necesitará un servicio de operación y la integración con su controlador.

## Cambios necesarios en el dashboard de tu compañera

| Componente | Cambio necesario |
| --- | --- |
| Recepción | Añadir `POST /api/events` para observaciones y estados de recorrido. Mantener `/api/ingesta/vuelos` para los vuelos que ya lo utilicen. |
| Puntuaciones | Guardar las cuatro por captura, incluida Sana; mostrar porcentajes sólo al presentar. No reemplazarlas por una única enfermedad o una severidad inventada. |
| Imagen | Aceptar JPEG base64 opcional; guardar en la misma transacción que el registro. Este adaptador usa `bytea` de PostgreSQL, adecuado para el prototipo. |
| Identificadores | UUID único por evento; los reintentos devuelven la confirmación del mismo UUID sin insertar otra fila o foto. |
| Lotes | Catálogo compartido entre `/api/lotes`, dashboard y recepción. El ingeniero lo crea/edita con sus permisos. |
| Plan y revisión | Separar `plan_id` (plan reutilizable) de `inspection_id` (una revisión concreta). Conservar los puntos y la revisión más reciente de su progreso. |
| Progreso | Mostrar completados/total y estados listo, en revisión, pausado, en carga y completo; no retroceder al recibir una actualización antigua. |
| Mapa | Dibujar los puntos con ubicación real y su precisión; presentar los que no tengan GPS como lista/esquema. No inventar coordenadas con el centro del lote. |
| Mediciones ausentes | NDVI, cobertura real, severidad, área afectada y porcentaje de plantas afectadas deben quedar nulos/no disponibles en estas observaciones. No los exige esta nueva ruta. |
| Interfaz | Filtros por lote, revisión, fecha y alerta; detalle con las cuatro puntuaciones, modelo, foto si existe y estado de revisión humana. |
| Datos simulados | Identificar y separar lo simulado de las observaciones reales; no mezclar ambos al calcular estadísticas. |
| Correo | Aplazado; este adaptador no lo envía. |

No se debe contar cada lectura de 10 segundos como una planta diferente. Tampoco dividir alertas entre lecturas para afirmar un porcentaje real de plantas enfermas. Para eso haría falta identificar plantas y definir cómo se muestrean.

### Código preparado

Esta carpeta es un adaptador para integrar, **no el proyecto original del dashboard**. No se ha modificado ni desplegado el dashboard publicado porque no se recibió su repositorio.

1. Si el proyecto usa `app/`, copia `cultivos/` junto a `app/` y añade los dos archivos de `app/api/events/`. Si usa `src/app/`, sitúa ambas carpetas bajo `src/`. No sustituyas el proyecto ni su `package.json`; integra los archivos. Si la ruta ya existe, fusiona sus handlers.
2. Ya usan `pg`; conserva una versión compatible del proyecto. Si faltara, instala `pg`. Las pruebas ejecutan el SQL y las transacciones sobre PGlite con un adaptador de la interfaz de `pg`; no verifican la conexión TCP/TLS del driver con Neon de producción ni compilan el proyecto Next.js original ausente.
3. Ejecuta `001_cultivos.sql` en la base de pruebas primero y luego mediante su proceso habitual de migraciones. Crea tablas nuevas con prefijo `cultivos_`; no elimina tablas anteriores.
4. Conecta `cultivos_lotes` con el catálogo existente. Lo preferible es adaptar la consulta de validación/clave foránea a su tabla real de lotes. Si mantienen esta tabla auxiliar, el ingeniero debe poblarla con los mismos IDs y mantenerla sincronizada mediante su CRUD autorizado. La migración no crea lotes de prueba automáticamente.
5. Configura `DATABASE_URL`, `INGEST_API_KEY` y, si usarán la consulta entre servidores incluida, `DASHBOARD_READ_API_KEY`. Usa la conexión de Neon con sus parámetros TLS; no desactives verificación de certificados. Ninguna de estas variables debe llevar prefijo `NEXT_PUBLIC_`.
6. Integra la lectura con la autenticación real del dashboard. Los GET de ejemplo exigen una clave privada **entre servidores**; no se debe colocar esa clave en JavaScript del navegador. El servidor del dashboard puede consultar PostgreSQL directamente con la sesión del propietario y filtrar sus lotes, o adaptar esos GET para verificar su sesión y permisos.
7. Añade los componentes visuales del cuadro anterior a sus pantallas. Los archivos de este paquete reciben/consultan datos; no sustituyen la interfaz ni implementan el login o la gestión de permisos existentes.
8. Despliega primero en un entorno de pruebas y realiza el ensayo final descrito abajo.

### Contrato de envío

La URL base que se introduce en **Receptor** es:

- Vercel: `https://arandanos-dashboard.vercel.app/api` **después de incorporar el adaptador**.
- Servidor en el PC: `http://IP_LOCAL_DEL_PC:3000/api` si Next.js está escuchando en esa interfaz y puerto.

La app añade `/events`. No pegues `/api/events` en el campo base, porque se repetiría `/events`.

Cabeceras: `Authorization: Bearer TOKEN` y `Content-Type: application/json`. Se acepta también `x-api-key` en el adaptador, aunque la APK envía Bearer.

Ejemplo de lectura sin foto (UUID y valores de muestra):

```json
{
  "id":"6e30b46c-015a-4ef1-a35b-d43e53f1930a",
  "schema_version":2,
  "type":"observation",
  "captured_at":"2026-10-24T15:00:00Z",
  "mission":"Revisión lote norte",
  "model_version":"experimental-v5",
  "scores":{"alternaria":0.02,"botrytis":0.03,"sana":0.93,"trips":0.02},
  "alert":false,
  "capture_mode":"periodic",
  "photo_filename":null,
  "photo_mime":null,
  "photo_base64":null,
  "route_context":{
    "inspection_id":"98e9769c-571e-4aa4-8cc2-ac0bf024a380",
    "plan_id":"7181386d-0aaf-4450-a707-6dd5666e24ca",
    "lot_id":"L01",
    "waypoint_id":"c661f7f0-4c8c-4d07-a29a-e7f09648602a",
    "location":null
  },
  "location":null,
  "status":"experimental_requires_review",
  "device":"android",
  "crop":"blueberry"
}
```

Una alerta lleva `alert:true`, `capture_mode:"automatic"`, los nombres de foto y MIME JPEG y `photo_base64` con bytes reales sin prefijo `data:`. Las puntuaciones cambian según el cuadro. La referencia de un punto lleva `capture_mode:"route_reference"`, `alert:false` y foto; una captura manual usa `manual` y puede no ser alerta.

El criterio automático sigue siendo una afectación con puntuación ≥0,8, ventaja ≥0,2 sobre la siguiente y tres lecturas consecutivas. Hay 30 segundos de intervalo por clase dentro del mismo punto. Cambiar de punto permite registrar una nueva alerta de la misma clase. No son umbrales de diagnóstico validados en la finca.

El segundo tipo, `type:"route_snapshot"`, lleva `id` de evento, fecha y un objeto `route`. Ese objeto contiene `id` de revisión, `plan_id`, `lot_id`, `name`, `phase`, `completed`, `revision`, `updated_at`, `waypoints`, referencias fotográficas y tiempo aproximado de análisis. Su formato completo se genera en `RouteStore.java`. No lleva foto embebida ni puntuaciones: las fotos de referencia se envían como observaciones aparte.

Respuesta **sólo después de COMMIT**:

```json
{"id":"6e30b46c-015a-4ef1-a35b-d43e53f1930a","status":"stored","new":true}
```

HTTP 201 al insertar, HTTP 200 y `new:false` al repetir exactamente el mismo UUID/contenido. Un UUID reutilizado con contenido diferente devuelve 409 y no sobrescribe datos.

La foto y sus puntuaciones se almacenan juntas en `cultivos_registros`. PostgreSQL conserva el JPEG en `foto`, las cuatro puntuaciones en `puntuaciones` y el resto en `datos`. El adaptador no necesita una subida previa a un alojamiento de imágenes. Para un despliegue de gran volumen conviene mover imágenes a almacenamiento de objetos conservando la relación por UUID y la confirmación duradera.

Consulta entre servidores: `GET /api/events?after=0&lote=L01` con la clave de lectura. Devuelve hasta 100 registros con cursor `siguiente`. Para la fotografía: `GET /api/events/{id}/photo`, también autenticado. Las fotos sin imagen responden 404. No expongas estas claves al navegador; integra la sesión real del dashboard.

Las versiones más recientes de cada revisión están en `cultivos_recorridos`. El historial de estados permanece en `cultivos_registros`; una revisión antigua que llegue tarde no reduce el progreso actual. Los planes/revisiones se guardan localmente y se envían al servidor; esta versión no descarga y fusiona planes editados desde varios dispositivos.

### Reconexión

Por defecto sólo se envía por Wi-Fi o Ethernet. La app prueba el receptor cada 10 segundos mientras está abierta, al guardar datos y al detectar Wi-Fi; Android puede agrupar o retrasar el trabajo en segundo plano. No hay garantía de entrega instantánea con la app cerrada o forzada a detenerse.

- Sin red, ante error 5xx, tiempo de espera, HTTP 408/429 o confirmación incorrecta: conserva UUID, valores y foto y reintenta.
- Ante otros 4xx: conserva el registro y lo bloquea para evitar reenvíos repetidos con datos rechazados. Corregir y guardar **Receptor** desbloquea pendientes. Un lote rechazado exige corregir primero el catálogo del servidor.
- Nunca borra automáticamente las evidencias después de enviarlas.
- La copia enviada de la foto tiene máximo 2.000.000 bytes; el JSON completo máximo 3.500.000 bytes. El original local permanece intacto.
- Datos de versiones anteriores se conservan y el adaptador los acepta como capturas antiguas sin inventarles lote o recorrido.

### Misma red y Vercel

Estar en la misma Wi-Fi que el computador **no vuelve local un servidor desplegado en Vercel**. La dirección `https://...vercel.app` y Neon necesitan conexión a internet.

Si necesitan sincronizar sin salida a internet, deben ejecutar el backend compatible en el PC/red local y usar PostgreSQL local o un servidor de base de datos alcanzable en esa LAN. Next.js puede ejecutarse escuchando en `0.0.0.0` en un puerto autorizado del firewall. El teléfono usará la IP local del PC, no `localhost`. Si mantienen únicamente Neon remoto, ese backend local seguirá necesitando internet para guardar en Neon.

HTTP se admite para probar dentro de una LAN privada; usa HTTPS al exponer el receptor a internet. La app no descubre automáticamente la IP del PC. Cambiar receptor requiere introducir su URL base; no se duplica automáticamente la misma captura en local y en la nube. Un receptor local no la replicará a Vercel salvo que se implemente esa función aparte.

## Ensayo de aceptación pendiente

1. Actualizar APK y verificar que siguen presentes las capturas anteriores.
2. Crear un lote autorizado y un plan con dos puntos con referencias de cámara.
3. En modo avión revisar el primer punto: confirmar que hay cuatro puntuaciones y que la lectura periódica no contiene foto.
4. Probar una foto manual y, si el modelo alcanza su umbral, una alerta automática con foto y puntuaciones de ese cuadro.
5. Completar el primer punto, pausar para carga y reiniciar el teléfono. Confirmar que el siguiente pendiente es el segundo.
6. Conectar a la LAN con su receptor o a internet con Vercel, habilitar Receptor y observar los UUID confirmados. Reenviar uno en un entorno de prueba: debe seguir existiendo una sola fila/foto.
7. Verificar en el dashboard que coinciden lote, punto, hora, modelo, cuatro puntuaciones y presencia/ausencia de fotografía.
8. Terminar el plan y crear otra revisión: el historial anterior debe permanecer.

Se completaron pruebas automatizadas del almacenamiento, migración, progreso y recepción. **Queda pendiente probar la nueva APK en el S24 Ultra, integrar/compilar el dashboard original y verificar contra su PostgreSQL desplegado.** No se afirma precisión de reconocimiento adicional ni ejecución autónoma en un robot físico.

## Para el robot real

Antes de implementar navegación necesitamos modelo exacto, SDK/ROS disponibles, cámara (RGB, profundidad o estéreo), odometría/IMU, sensores de obstáculos y modo de localizarse después de reiniciar. El teléfono por sí solo no garantiza navegación entre plantas parecidas. El sistema de navegación deberá informar llegada y análisis confirmado por punto; sólo entonces podrá avanzar automáticamente el mismo progreso que aquí confirma el operador.

Referencias técnicas:

- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Transacciones con pg: https://node-postgres.com/features/transactions
- PostgreSQL ON CONFLICT: https://www.postgresql.org/docs/17/sql-insert.html
- Límites de Vercel Functions: https://vercel.com/docs/functions/limitations (4,5 MB; el dato de 100 MB del PDF no debe usarse para estas rutas).
- Preparación de navegación y sensores Nav2: https://docs.nav2.org/rolling/configuration_and_development/first_time_robot_setup_guide/
- Conceptos de seguimiento visual ARCore: https://developers.google.com/ar/develop/fundamentals

## Repetir las pruebas del adaptador

En una copia aislada de esta carpeta, con Node.js 24:

```sh
npm install
npm test
```

Las 18 pruebas usan PGlite para ejecutar el SQL y peticiones Request/Response locales. Incluyen registros JSON realmente generados por las pruebas Android, con datos y fotografías sintéticos. No hacen peticiones a la producción ni envían correos. La carpeta tests y las dependencias de desarrollo no necesitan copiarse al dashboard.
