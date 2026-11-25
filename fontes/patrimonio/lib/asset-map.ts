import type {Asset,FloorLayout,Region,Sector} from './model';
export const assetIconNames={desk:'Mesa',deskL:'Mesa em L',roundTable:'Mesa redonda',chair:'Cadeira / poltrona',bench:'Longarina',shelf:'Estante',cabinet:'Armário',file:'Arquivo de gavetas',partition:'Divisória',cpuStand:'Suporte para CPU',footrest:'Apoio para pés',board:'Quadro branco',fridge:'Frigobar / geladeira',ups:'Nobreak',shredder:'Fragmentadora',projector:'Projetor',computer:'CPU / computador',monitor:'Monitor',network:'Switch / rede',drive:'HD externo',air:'Ar-condicionado',water:'Bebedouro',fire:'Extintor',printer:'Impressora',other:'Outro bem'};
export type AssetIcon=keyof typeof assetIconNames;
export function inferAssetIcon(description:string):AssetIcon{
 const d=description.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const rules:[RegExp,AssetIcon][]=[[/suporte.*cpu/,'cpuStand'],[/apoio.*pe/,'footrest'],[/longarina/,'bench'],[/cadeira|poltrona/,'chair'],[/estante/,'shelf'],[/arquivo/,'file'],[/armario/,'cabinet'],[/divisoria/,'partition'],[/mesa.*redonda/,'roundTable'],[/(mesa|estacao).*\b(l|com l|em l)\b/,'deskL'],[/mesa|estacao de trabalho/,'desk'],[/quadro|lousa/,'board'],[/frigobar|geladeira/,'fridge'],[/nobreak|no-break/,'ups'],[/fragmentadora/,'shredder'],[/projetor/,'projector'],[/monitor/,'monitor'],[/cpu|computador|notebook/,'computer'],[/switch|roteador/,'network'],[/hd externo/,'drive'],[/ar condicionado|ar-condicionado/,'air'],[/bebedouro/,'water'],[/extintor/,'fire'],[/impressora/,'printer']];
 return rules.find(([re])=>re.test(d))?.[1]||'other';
}
export function assetIcon(a:Asset):AssetIcon{return a.icon&&Object.hasOwn(assetIconNames,a.icon)?a.icon as AssetIcon:inferAssetIcon(a.description);}
export function sectorRegions(layout:FloorLayout,sectorId:string){return (layout.regions||[]).filter(r=>r.sectorId===sectorId);}
export function regionAt(regions:Region[],x:number,y:number){return regions.filter(r=>x>=r.x&&x<=r.x+r.width&&y>=r.y&&y<=r.y+r.height).sort((a,b)=>a.width*a.height-b.width*b.height)[0];}
export function placeAssets(assets:Asset[],layout:FloorLayout,sectors:Sector[]){
 const groups=new Map<string,{region:Region;items:Asset[]}>();
 for(const a of assets){if(layout.pieces.some(p=>p.assetId===a.id)||a.archived||a.area==='pending'||!sectors.some(s=>s.id===a.area))continue;
  const regions=sectorRegions(layout,a.area);const anchor=layout.labels.find(l=>l.id===a.area)||{x:350,y:420};
  const region=regions.find(r=>r.id===a.mapRegion)||[...regions].sort((a,b)=>b.width*b.height-a.width*a.height)[0]||{id:'anchor-'+a.area,sectorId:a.area,x:Math.max(10,Math.min(550,anchor.x-60)),y:Math.max(10,Math.min(750,anchor.y-40)),width:120,height:90};
  if(!groups.has(region.id))groups.set(region.id,{region,items:[]});groups.get(region.id)!.items.push(a);
 }
 return [...groups.values()].map(({region,items})=>{
  const pinned=items.flatMap(asset=>{const p=layout.assetPositions?.find(p=>p.id===asset.id&&p.area===asset.area&&p.mapRegion===(asset.mapRegion||''));return p?[{asset,x:p.x,y:p.y}]:[];});
  items=items.filter(a=>!pinned.some(p=>p.asset.id===a.id));
  items.sort((a,b)=>a.id.localeCompare(b.id));
  const cols=Math.max(1,Math.floor((region.width-8)/34)),rows=Math.max(1,Math.floor((region.height-8)/34));
  const cells=Array.from({length:cols*rows},(_,i)=>({x:region.x+4+(i%cols+.5)*(region.width-8)/cols,y:region.y+4+(Math.floor(i/cols)+.5)*(region.height-8)/rows})).filter(p=>!(layout.regions||[]).some(r=>r.sectorId!==region.sectorId&&r.width*r.height<=region.width*region.height&&p.x+15>r.x&&p.x-15<r.x+r.width&&p.y+15>r.y&&p.y-15<r.y+r.height));
  const capacity=cells.length;
  const overflow=items.length>capacity;const shown=items.slice(0,overflow?Math.max(0,capacity-1):capacity);
  const position=(i:number)=>cells[i]||{x:region.x+region.width/2,y:region.y+region.height/2};
  return {region,markers:[...pinned,...shown.map((asset,i)=>({asset,...position(i)}))],overflow:overflow?{count:items.length-shown.length,...position(shown.length)}:null};
 });
}
