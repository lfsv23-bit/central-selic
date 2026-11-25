export const areas=[{id:'super',name:'Superintendência',x:15,y:10},{id:'recepcao',name:'Recepção',x:46,y:10},{id:'pregao',name:'Pregão',x:80,y:14},{id:'planejamento',name:'Planejamento',x:18,y:44},{id:'edital',name:'Edital',x:53,y:43},{id:'obras',name:'Obras',x:85,y:46},{id:'cotacao',name:'Cotação',x:62,y:72},{id:'secretaria',name:'Secretaria',x:18,y:77},{id:'copa',name:'Copa',x:22,y:94},{id:'pending',name:'Localização a confirmar',x:0,y:0}];
export type Asset={id:string;code:string;description:string;notes:string;legacy:string;area:string;person:string;position:string;condition:string;verified:string;archived:boolean;sourceRow?:number;icon?:string;mapRegion?:string};
export type Person={id:string;name:string;area:string;position:string};
export type Furniture={id:string;assetId?:string;kind:"desk"|"deskL"|"chair"|"printer";x:number;y:number;rotation:number;label:string};
export type Sector={id:string;name:string;color:string};
export type Region={id:string;sectorId:string;x:number;y:number;width:number;height:number};
export type AssetPosition={id:string;area:string;mapRegion:string;x:number;y:number};
export type FloorLayout={assetPositions?:AssetPosition[];regions?:Region[];pieces:Furniture[];labels:{id:string;x:number;y:number}[]};
export type State={sectors?:Sector[];layout?:FloorLayout;areaNames?:Record<string,string>;assets:Asset[];people:Person[];history:{id:string;date:string;text:string}[];round:string};
export const areaName=(id:string)=>areas.find(a=>a.id===id)?.name||'Localização a confirmar';

export const sectorColors:Record<string,string>={super:'#d25951',recepcao:'#ad6824',pregao:'#388965',planejamento:'#7951ae',edital:'#238168',obras:'#466bb2',cotacao:'#aa8200',secretaria:'#ad567f',copa:'#367f91'};
export function getSectors(s:Pick<State,'sectors'|'areaNames'>):Sector[]{return s.sectors??areas.filter(a=>a.id!=='pending').map(a=>({id:a.id,name:s.areaNames?.[a.id]||a.name,color:sectorColors[a.id]}));}
export function getAreas(s:Pick<State,'sectors'|'areaNames'>){return [...getSectors(s),{id:'pending',name:'Localização a confirmar',color:'#64748b'}];}
