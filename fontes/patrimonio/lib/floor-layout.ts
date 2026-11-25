import {areas,type FloorLayout,type Furniture,type Sector,type Region} from './model';
export const pieceNames={desk:'Mesa reta',deskL:'Mesa em L',chair:'Cadeira',printer:'Impressora'};
export function initialLayout():FloorLayout{
 const pieces:Furniture[]=[];
 const desk=(x:number,y:number,kind:Furniture['kind']='deskL',rotation=0)=>{const n=pieces.length;pieces.push({id:'base-'+n,kind,x,y,rotation,label:''});pieces.push({id:'base-'+(n+1),kind:'chair',x:x+45,y:y+40,rotation:0,label:''});};
 desk(85,75,'desk',90);desk(500,80);desk(580,80,'deskL',90);desk(515,170,'deskL',180);
 desk(90,255);desk(170,255,'deskL',90);desk(90,345,'deskL',270);desk(170,345,'deskL',180);
 desk(90,440);desk(170,440,'deskL',90);desk(90,535,'deskL',270);desk(170,535,'deskL',180);
 desk(330,350,'desk');desk(465,350,'desk');
 desk(590,295,'desk',90);desk(590,390,'desk',90);desk(595,505,'deskL');
 desk(430,505);desk(415,660);desk(505,660,'deskL',90);desk(415,745,'deskL',270);desk(505,745,'deskL',180);
 desk(595,670,'desk',90);
 pieces.push({id:'printer-1',kind:'printer',x:342,y:195,rotation:0,label:'Impressora'});
 return {pieces,labels:areas.filter(a=>a.id!=='pending').map(a=>({id:a.id,x:a.x*7,y:a.id==='copa'?805:a.id==='secretaria'?640:a.y*8.5-35}))};
}
export function defaultRegions():Region[]{return [
 ['super',25,22,220,135],['pregao',428,22,232,195],['planejamento',25,180,210,395],['edital',275,310,250,105],['obras',535,240,120,310],['cotacao',300,460,235,325]
].map(([sectorId,x,y,width,height])=>({id:'region-'+sectorId,sectorId:String(sectorId),x:Number(x),y:Number(y),width:Number(width),height:Number(height)}));}
export function validateLayout(input:unknown,sectorInput:unknown):{layout:FloorLayout;sectors:Sector[];areaNames:Record<string,string>}{
 const l=input as FloorLayout;
 if(!l||!Array.isArray(l.pieces)||l.pieces.length>250||!Array.isArray(l.labels)||!Array.isArray(l.regions)||l.regions.length>150)throw Error('Layout inválido: limite de 250 peças e 150 áreas.');
 if(!Array.isArray(sectorInput)||sectorInput.length>40)throw Error('Use até 40 setores.');
 const sectorIds=new Set<string>(),unique=new Set<string>();
 const sectors:Sector[]=sectorInput.map(a=>{if(!a||typeof a.id!=='string'||!/^[a-z0-9-]{1,100}$/.test(a.id)||a.id==='pending'||sectorIds.has(a.id)||typeof a.name!=='string'||!a.name.trim()||a.name.trim().length>60||typeof a.color!=='string'||!/^#[0-9a-f]{6}$/i.test(a.color))throw Error('Setor inválido. Informe nome e cor.');const name=a.name.trim();if(unique.has(name.toLocaleLowerCase('pt-BR')))throw Error('Use nomes diferentes para os setores.');unique.add(name.toLocaleLowerCase('pt-BR'));sectorIds.add(a.id);return {id:a.id,name,color:a.color};});
 const ids=new Set<string>();const num=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
 const linkedAssets=new Set<string>();
 const pieces=l.pieces.map(p=>{if(!p||typeof p.id!=='string'||!p.id||p.id.length>100||ids.has(p.id)||!Object.hasOwn(pieceNames,p.kind)||!num(p.x,50,650)||!num(p.y,50,810)||![0,90,180,270].includes(p.rotation)||typeof p.label!=='string'||p.label.length>80)throw Error('Há uma peça inválida ou fora dos limites da planta.');ids.add(p.id);if(p.assetId!==undefined&&(typeof p.assetId!=='string'||p.assetId.length>100))throw Error('Vínculo patrimonial inválido.');if(p.assetId&&linkedAssets.has(p.assetId))throw Error('Cada bem pode estar vinculado a apenas um móvel.');if(p.assetId)linkedAssets.add(p.assetId);return {...(p.assetId?{assetId:p.assetId}:{}),id:p.id,kind:p.kind,x:p.x,y:p.y,rotation:p.rotation,label:p.label.trim()};});
 const seen=new Set<string>();const labels=l.labels.map(a=>{if(!a||!sectorIds.has(a.id)||seen.has(a.id)||!num(a.x,40,660)||!num(a.y,30,825))throw Error('Posição de setor inválida.');seen.add(a.id);return {id:a.id,x:a.x,y:a.y};});
 if(labels.length!==sectors.length)throw Error('Cada setor deve possuir um nome na planta.');
 const regionIds=new Set<string>();const regions=l.regions.map(r=>{if(!r||typeof r.id!=='string'||!r.id||r.id.length>100||regionIds.has(r.id)||!sectorIds.has(r.sectorId)||!num(r.x,10,630)||!num(r.y,10,800)||!num(r.width,40,660)||!num(r.height,40,830)||r.x+r.width>670||r.y+r.height>840)throw Error('Área tracejada inválida ou fora dos limites da planta.');regionIds.add(r.id);return {id:r.id,sectorId:r.sectorId,x:r.x,y:r.y,width:r.width,height:r.height};});
 const positionIds=new Set<string>();
 if(l.assetPositions!==undefined&&(!Array.isArray(l.assetPositions)||l.assetPositions.length>10000))throw Error('Posições de bens inválidas.');
 const assetPositions=(l.assetPositions||[]).map(p=>{if(!p||typeof p.id!=='string'||!p.id||p.id.length>100||positionIds.has(p.id)||!sectorIds.has(p.area)||typeof p.mapRegion!=='string'||p.mapRegion.length>100||!num(p.x,26,654)||!num(p.y,26,824))throw Error('Posição de bem inválida.');positionIds.add(p.id);return {id:p.id,area:p.area,mapRegion:p.mapRegion,x:p.x,y:p.y};});
 return {layout:{pieces,labels,regions,...(l.assetPositions!==undefined?{assetPositions}:{})},sectors,areaNames:Object.fromEntries(sectors.map(a=>[a.id,a.name]))};
}
