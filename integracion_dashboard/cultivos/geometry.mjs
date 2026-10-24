const EPS=1e-14;
const coord=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const on=(p,a,b)=>Math.abs(cross(a,b,p))<EPS&&p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS;
function intersects(a,b,c,d){return (cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(c,a,b)||on(d,a,b)||on(a,c,d)||on(b,c,d);}
export function polygonRing(p){
 if(p?.type!=='Polygon'||!Array.isArray(p.coordinates)||p.coordinates.length!==1)throw Error('Polígono simple requerido');
 const ring=p.coordinates[0];if(!Array.isArray(ring)||ring.length<4||ring.length>201||!ring.every(coord)||JSON.stringify(ring[0])!==JSON.stringify(ring.at(-1)))throw Error('Contorno inválido');
 const v=ring.slice(0,-1);let area=0;
 for(let i=0;i<v.length;i++){const a=v[i],b=v[(i+1)%v.length];if(a[0]===b[0]&&a[1]===b[1])throw Error('Vértice repetido');area+=(b[0]-a[0])*(b[1]+a[1]);}
 if(Math.abs(area)<EPS||Math.max(...v.map(p=>p[0]))-Math.min(...v.map(p=>p[0]))>180)throw Error('Contorno degenerado');
 for(let i=0;i<v.length;i++)for(let j=i+1;j<v.length;j++)if(j!==i+1&&!(i===0&&j===v.length-1)&&intersects(v[i],v[(i+1)%v.length],v[j],v[(j+1)%v.length]))throw Error('Contorno cruzado');
 return v;
}
export function inside(v,p){
 let yes=false;for(let i=0,j=v.length-1;i<v.length;j=i++){
  const a=v[j],b=v[i];if(on(p,a,b))return true;
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
 }return yes;
}
export function segmentInside(v,a,b){
 if(!inside(v,a)||!inside(v,b))return false;const dx=b[0]-a[0],dy=b[1]-a[1],ts=[0,1];
 for(let i=0;i<v.length;i++){
  const c=v[i],d=v[(i+1)%v.length],ex=d[0]-c[0],ey=d[1]-c[1],den=dx*ey-dy*ex;
  if(Math.abs(den)>1e-18){const t=((c[0]-a[0])*ey-(c[1]-a[1])*ex)/den,u=((c[0]-a[0])*dy-(c[1]-a[1])*dx)/den;if(t>0&&t<1&&u>=-EPS&&u<=1+EPS)ts.push(t);}
 }
 ts.sort((x,y)=>x-y);for(let i=1;i<ts.length;i++){const t=(ts[i]+ts[i-1])/2;if(!inside(v,[a[0]+dx*t,a[1]+dy*t]))return false;}return true;
}
export function validateDisplayPosition(p){
 if(!p||!coord([p.longitude,p.latitude])||p.source!=='simulated_within_lot')throw Error('Posición de visualización inválida');
}
export function validateRouteGeometry(r){
 const has=r.lot_boundary!=null||r.display_path!=null||r.waypoints.some(p=>p.display_position!=null);if(!has)return;
 if(r.navigation_mode!=='timed_simulation'||r.simulated!==true)throw Error('La geometría generada debe estar marcada como simulación');
 const v=polygonRing(r.lot_boundary);
 for(const p of r.waypoints){validateDisplayPosition(p.display_position);if(!inside(v,[p.display_position.longitude,p.display_position.latitude]))throw Error('Punto fuera del lote');}
 if(r.waypoints.length>1){
  const line=r.display_path?.coordinates;if(r.display_path?.type!=='LineString'||!Array.isArray(line)||line.length<2||line.length>25000||!line.every(coord))throw Error('Trayectoria inválida');
  for(let i=1;i<line.length;i++)if(!segmentInside(v,line[i-1],line[i]))throw Error('Trayectoria fuera del lote');
  let cursor=0;for(const p of r.waypoints){while(cursor<line.length&&(line[cursor][0]!==p.display_position.longitude||line[cursor][1]!==p.display_position.latitude))cursor++;if(cursor===line.length)throw Error('Trayectoria no visita los puntos en orden');}
 }
}
export function toGeoJSON(routeRows,observationRows=[]){
 const features=[],omitted_routes=[],readings=new Map();
 for(const row of observationRows){const e=row.datos??row,c=e.route_context;if(c&&!readings.has(c.inspection_id+':'+c.waypoint_id))readings.set(c.inspection_id+':'+c.waypoint_id,{...e,id:e.id??row.id,hasPhoto:row.photo_available??(e.photo_filename!=null)});}
 const add=(id,geometry,properties)=>features.push({type:'Feature',id,geometry,properties});
 for(const row of routeRows){
  const r=row.datos??row,points=r.waypoints??[],common={inspection_id:r.id,plan_id:r.plan_id,lot_id:r.lot_id,name:r.name,phase:r.phase,completed:r.completed,total:points.length,simulated:r.simulated===true,revision:r.revision,geometry_source:r.geometry_source??''};
  if(!points.some(p=>p.display_position)){omitted_routes.push({inspection_id:r.id,lot_id:r.lot_id,reason:'missing_display_geometry'});continue;}
  if(r.lot_boundary)add(r.id+':boundary',r.lot_boundary,{...common,kind:'boundary'});
  if(r.display_path)add(r.id+':route',r.display_path,{...common,kind:'route'});
  points.forEach((p,i)=>{
   const loc=p.display_position;if(!loc)return;const e=readings.get(r.id+':'+p.id);
   const geometry={type:'Point',coordinates:[loc.longitude,loc.latitude]};
   const props={...common,kind:'waypoint',waypoint_id:p.id,index:i+1,status:i<r.completed?'reviewed':i===r.completed?'current':'pending',position_source:'simulated_within_lot',scores:e?.scores??null,observation_id:e?.id??null,photo_available:e?.hasPhoto??false,alert:e?.alert??false,captured_at:e?.captured_at??null};
   add(r.id+':'+p.id,geometry,props);
   if(i===Math.min(r.completed,points.length-1))add(r.id+':position',geometry,{...props,kind:'position'});
  });
 }
 return {type:'FeatureCollection',features,omitted_routes};
}
