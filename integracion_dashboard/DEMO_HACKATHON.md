# Demostración con avance automático — Android 0.2.2

Para la hackathon puedes simular el recorrido sin confirmar cada punto. El reconocimiento y las fotografías proceden de la cámara del celular; el desplazamiento por la ruta se representa con un temporizador. No detecta la posición real ni reconoce por cámara que llegaste a una planta.

## Prueba rápida

1. Instala `Cultivos_a_bordo_0.2.2.apk` encima de la anterior, sin desinstalar ni borrar datos.
2. Entra a **Lotes y recorrido**. Importa el catálogo y sus contornos desde el receptor. La nueva demo necesita ese contorno para generar posiciones sobre el mapa; los nombres solos de versiones anteriores no bastan.
3. Pulsa **Crear demo automática (hackathon)**. Selecciona el lote; por defecto son 5 puntos y 20 segundos por punto. Puedes cambiar el nombre, de 1 a 100 puntos y de 5 a 600 segundos por punto.
4. Al regresar a cámara, pulsa **Iniciar / reanudar** una sola vez. Mantén la app abierta y apunta a las plantas. La pantalla indica `SIMULACIÓN`, punto actual y segundos para avanzar.
5. Al pasar el intervalo, si existe una lectura guardada del punto, se marca completo automáticamente y comienza el siguiente. No aparece el botón de confirmar cada punto en este modo.
6. Al terminar todos los puntos, se pausa el análisis y queda guardada la revisión completa.

Después de importar los contornos una vez, no hace falta activar GPS, tener señal de internet ni registrar fotos de referencia para crear los puntos simulados. Una demo de 5 × 20 s dura aproximadamente 100 segundos de análisis continuo, más el tiempo inicial de carga y los intervalos entre cuadros. Puede demorarse si la cámara o el modelo no producen lecturas válidas.

## Si ya tienes un plan

Con el plan cerrado y sin puntos completados, entra a **Lotes y recorrido → Avance automático por tiempo (simulación)**. Define el intervalo. Los puntos existentes se reutilizan; la llegada y la asociación de las lecturas con esos puntos pasan a ser simuladas. Si ya completaste puntos, crea una demo nueva para conservar la procedencia del historial anterior.

## Pausa, carga y reanudación

**Pausar para cargar**, cerrar la app o bloquear el teléfono detiene el análisis. Se conserva el siguiente punto pendiente. Al reabrir, pulsa **Iniciar / reanudar**: el temporizador del punto pendiente empieza de nuevo desde su duración completa. No intenta recuperar de golpe el tiempo pasado con la app cerrada ni completa puntos en segundo plano.

La marca de carga sigue siendo manual: no interpreta la batería del S24 como batería del robot. No controla motores ni conecta un cargador físico.

## Datos y fotografías

Se guardan las cuatro puntuaciones reales calculadas por el modelo. No se inventan diagnósticos ni se fuerza Sana. La lectura periódica guarda valores sin foto; la alerta automática incluye foto y puntuaciones del mismo cuadro. Puedes solicitar una foto manual.

Todos los registros de la demo se etiquetan:

```json
{
  "simulated": true,
  "simulation_scope": "route_progress_only",
  "route_context": {
    "navigation_mode": "timed_simulation",
    "position_source": "timed_simulation",
    "location": null
  }
}
```

El ejemplo muestra únicamente las marcas adicionales; los registros completos incluyen UUID, fecha, lote, plan, punto, scores y foto cuando corresponda. No se inventan latitudes o longitudes. El estado del recorrido guarda `simulation_point_seconds`, y cada punto completado guarda `completion_source: "timed_simulation"`.

## Dashboard

Actualiza el adaptador con el incluido en esta entrega. La base y las tablas son las mismas que en 0.2.0; no se necesita otra migración para estos campos, almacenados en JSONB.

- Mostrar un distintivo visible **Recorrido simulado · cámara real**.
- El feed de ejemplo incluye `simulado` además de los datos originales.
- Separar las estadísticas de recorridos reales y simulados. Para las estadísticas reales de estas tablas, excluir `COALESCE((datos->>'simulated')::boolean,false) = true`.
- No interpretar cada punto virtual como una planta identificada ni como una cobertura física medida.
- Una referencia nula sólo se permite para puntos virtuales expresamente marcados dentro de una ruta simulada.

El dashboard publicado sigue requiriendo integrar el adaptador, su interfaz y autenticación. El correo permanece aplazado.

## GPS real después de la hackathon

La app ya tiene lectura opcional de ubicación mediante Android; no requiere contratar una API externa para esa lectura. Para llegar realmente a un punto habría que comparar una posición reciente y su precisión con las coordenadas del destino, definir una tolerancia y comprobar estabilidad. El GPS no sustituye un sistema de navegación entre plantas ni garantiza precisión suficiente para distinguirlas. Esta entrega utiliza tiempo y no implementa llegada automática por GPS.

Para la presentación puedes decir: **“El modelo corre offline en el celular. El recorrido autónomo está simulado por tiempo; las detecciones y evidencias se obtienen de la cámara, se conservan localmente y se sincronizan al receptor compatible cuando hay conexión.”**

## Mapa 0.2.2
La geometría nueva está en `display_position` y `display_path`, con GPS medido nulo y marca de simulación. Exportar incluye `routes.geojson`. Consulta MAPA_SATELITAL.md; todavía falta integrar la capa de Leaflet al dashboard original.
