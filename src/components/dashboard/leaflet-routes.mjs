/** Overlay for the existing Leaflet map. No basemap, satellite imagery or credentials are replaced. */
export function attachRoutesLayer(L,map,{onPointClick,onError,showBoundaries=false}={}){
 const group=L.layerGroup().addTo(map),colors=new Map(),palette=['#2563eb','#ea580c','#9333ea','#0891b2','#be123c','#4d7c0f'];
 let rendered=null,timer=null,busy=false,destroyed=false;
 function color(id){if(!colors.has(id))colors.set(id,palette[colors.size%palette.length]);return colors.get(id);}
 function description(p){
  const lines=[p.name??'Recorrido',`Lote ${p.lot_id} · ${p.completed}/${p.total} puntos`,p.simulated?'RECORRIDO SIMULADO · CÁMARA REAL':'Recorrido'];
  if(p.index)lines.push(`Punto ${p.index} · ${p.status}`);
  if(p.scores)for(const label of ['alternaria','botrytis','sana','trips'])lines.push(`${label}: ${(p.scores[label]*100).toFixed(1)}%`);
  if(p.kind==='position')lines.push('Posición asignada por el temporizador; no es GPS medido.');
  const node=document.createElement('div');node.style.whiteSpace='pre-line';node.textContent=lines.join('\n');return node;
 }
 function setData(data){
  if(destroyed)return;if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('GeoJSON inválido');
  group.clearLayers();
  rendered=L.geoJSON(data,{
   filter:f=>showBoundaries||f.properties.kind!=='boundary',
   // Corrección al integrar: L.geoJSON también aplica `style` a los circleMarker de pointToLayer; sin este
   // filtro los puntos quedaban como aros vacíos punteados y el clic caía en la línea de la ruta.
   style:f=>f.geometry?.type==='Point'?{}:({color:color(f.properties.inspection_id),weight:f.properties.kind==='boundary'?1:3,fill:false,dashArray:f.properties.simulated?'7 5':null}),
   pointToLayer:(f,latlng)=>{const p=f.properties;return L.circleMarker(latlng,{radius:p.kind==='position'?10:5,color:p.kind==='position'?'#111827':'#ffffff',weight:2,fillColor:p.kind==='position'?color(p.inspection_id):p.status==='reviewed'?'#15803d':p.status==='current'?color(p.inspection_id):'#9ca3af',fillOpacity:.95});},
   onEachFeature:(f,layer)=>{
    const p=f.properties;layer.bindPopup(description(p));
    if(p.kind==='waypoint'||p.kind==='position'){layer.bindTooltip(description({...p,scores:null}));layer.on('click',()=>onPointClick?.(p));}
   }
  }).addTo(group);
  return data.omitted_routes??[];
 }
 async function refresh(load){if(busy||destroyed)return;busy=true;try{const data=await load();if(!destroyed)setData(data);}catch(e){onError?.(e);}finally{busy=false;}}
 return {
  setData,
  fit(){const bounds=rendered?.getBounds();if(bounds?.isValid())map.fitBounds(bounds,{padding:[20,20],maxZoom:20});},
  startPolling(load,intervalMs=10000){if(timer)clearInterval(timer);refresh(load);timer=setInterval(()=>refresh(load),Math.max(1000,intervalMs));},
  destroy(){destroyed=true;if(timer)clearInterval(timer);group.clearLayers();map.removeLayer(group);}
 };
}
