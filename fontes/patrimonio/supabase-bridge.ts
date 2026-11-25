import {assetIconNames} from './lib/asset-map';
import {defaultRegions,validateLayout} from './lib/floor-layout';
import {getAreas,getSectors,type State,type Asset,type Person,areaName as defaultAreaName} from './lib/model';
import {planImport,type ImportRow} from './lib/import-assets';
declare const supabase:any;
export const client=supabase.createClient('https://qjyppukemulithkkqzvy.supabase.co','sb_publishable_Gw4hZX0VpqtWEOlMZ_yZRg__tXj0FSt');
const clean=(v:unknown,max=2000)=>typeof v==='string'?v.trim().slice(0,max):'';
async function execute(input:any,row:any){
  const s:State=structuredClone(row.payload);const areaName=(id:string)=>getAreas(s).find(a=>a.id===id)?.name||id;let note='';const now=new Date().toISOString();
  const validArea=(v:string)=>getAreas(s).some(a=>a.id===v);const fail=(m:string)=>{throw new Error(m)};
  if(input.action==='clear_all'){
   if(input.confirmation!=='EXCLUIR TUDO')fail('Confirmação inválida.');
   s.assets=[];s.people=[];s.history=[];s.sectors=[];s.areaNames={};s.layout={pieces:[],labels:[],regions:[],assetPositions:[]};s.round='Conferência inicial';
   return s;
  }else if(input.action==='import'){
   if(!Array.isArray(input.rows)||input.rows.length>5000)fail('Arquivo de importação inválido.');
   const rows:ImportRow[]=input.rows.map((r:any)=>({code:clean(r.code,50),description:clean(r.description,500),legacy:clean(r.legacy,100),notes:clean(r.notes,2000)}));
   const plan=planImport(s,rows);if(plan.issues.length)fail('Existem inconsistências na importação. Recarregue e revise antes de salvar.');
   for(const entry of plan.updates){const {row,old}=entry;if(old){old.description=row.description;old.legacy=row.legacy;old.notes=row.notes;}else s.assets.push({id:crypto.randomUUID(),...row,area:'pending',person:'',position:'',condition:'Não informado',verified:'',archived:false});}
   note=`Importação: ${plan.updates.filter(x=>x.kind==='novo').length} novos, ${plan.updates.filter(x=>x.kind==='alterado').length} atualizados e ${plan.updates.filter(x=>x.kind==='inalterado').length} inalterados.`;
  }else if(input.action==='layout'){
   const validated=validateLayout(input.layout,input.sectors);
   if(validated.layout.assetPositions?.some(p=>!s.assets.some(a=>a.id===p.id&&a.area===p.area&&(a.mapRegion||'')===p.mapRegion&&!a.archived)))fail('A localização de um bem mudou. Recarregue antes de salvar o layout.');
   if(validated.layout.pieces.some(p=>p.assetId&&!s.assets.some(a=>a.id===p.assetId&&!a.archived)))fail('Selecione um bem ativo para vincular ao móvel.');
   if(validated.layout.assetPositions)validated.layout.assetPositions=validated.layout.assetPositions.filter(p=>!validated.layout.pieces.some(f=>f.assetId===p.id));
   const allowed=new Set(['pending',...validated.sectors.map(a=>a.id)]);
   if(s.assets.some(a=>!allowed.has(a.area))||s.people.some(p=>!allowed.has(p.area)))fail('Transfira os bens e servidores vinculados antes de excluir o setor, incluindo os bens arquivados.');
   const previous=getSectors(s);
   const renamed=validated.sectors.filter(a=>previous.some(p=>p.id===a.id&&p.name!==a.name)).map(a=>`${areaName(a.id)} → ${a.name}`);
   for(const a of s.assets)if(a.mapRegion&&!validated.layout.regions!.some(r=>r.id===a.mapRegion&&r.sectorId===a.area))a.mapRegion='';
   s.layout=validated.layout;s.sectors=validated.sectors;s.areaNames=validated.areaNames;
   note=`Layout atualizado: ${validated.layout.pieces.length} peças, ${validated.layout.regions!.length} áreas tracejadas e ${validated.sectors.length} setores.${renamed.length?' Setores renomeados: '+renamed.join('; '):''}`;
  }else if(input.action==='asset'){
   const a=input.asset||{};const old=s.assets.find(x=>x.id===a.id);const code=clean(a.code,50);const description=clean(a.description,500);
   if(!code||!description)fail('Preencha código e descrição.');if(!validArea(a.area))fail('Selecione uma área válida.');
   if((!old||old.code!==code)&&s.assets.some(x=>x.code===code))fail('Este código já está cadastrado.');
   if(a.person&&!s.people.some(p=>p.id===a.person))fail('Servidor inválido.');
   const icon=clean(a.icon,40),mapRegion=clean(a.mapRegion,100);
   if(icon&&!Object.hasOwn(assetIconNames,icon))fail('Escolha um ícone válido.');
   if(mapRegion&&!(s.layout?.regions??defaultRegions()).some(r=>r.id===mapRegion&&r.sectorId===a.area))fail('Escolha uma área tracejada do setor selecionado.');
   const updated:Asset={id:old?.id||crypto.randomUUID(),code,description,icon,mapRegion,area:a.area,person:clean(a.person,100),position:clean(a.position,150),condition:clean(a.condition,100),notes:clean(a.notes),legacy:old?.legacy||'',sourceRow:old?.sourceRow,verified:old?.verified||'',archived:old?.archived||false};
   if(old&&(old.area!==updated.area||(old.mapRegion||'')!==mapRegion)&&s.layout?.assetPositions)s.layout.assetPositions=s.layout.assetPositions.filter(p=>p.id!==old.id);
   if(old&&(old.area!==updated.area||(old.mapRegion||'')!==mapRegion)&&s.layout)s.layout.pieces=s.layout.pieces.map(p=>p.assetId===old.id?{...p,assetId:undefined}:p);
   if(old)s.assets[s.assets.indexOf(old)]=updated;else s.assets.push(updated);
   note=old?`Bem ${code} atualizado. Local: ${areaName(old.area)} / ${old.position||'sem posto'} → ${areaName(updated.area)} / ${updated.position||'sem posto'}.`:`Bem ${code} cadastrado: ${description}.`;
  }else if(input.action==='person'){
   const p=input.person||{};const name=clean(p.name,150);if(!name||!validArea(p.area))fail('Preencha nome e área.');const old=s.people.find(x=>x.id===p.id);const updated:Person={id:old?.id||crypto.randomUUID(),name,area:p.area,position:clean(p.position,150)};
   const ids:Array<string>=Array.isArray(input.assetIds)?input.assetIds:[];
   if(ids.some(id=>!s.assets.some(a=>a.id===id&&a.person===old?.id&&!a.archived)))fail('Seleção de bens inválida.');
   const moves=s.assets.filter(a=>ids.includes(a.id)).map(a=>`${a.code}: ${areaName(a.area)} / ${a.position||'sem posto'} → ${areaName(updated.area)} / ${updated.position||'sem posto'}`);
   for(const a of s.assets)if(ids.includes(a.id)){if(a.area!==updated.area){if(s.layout)s.layout.pieces=s.layout.pieces.map(p=>p.assetId===a.id?{...p,assetId:undefined}:p);a.mapRegion='';if(s.layout?.assetPositions)s.layout.assetPositions=s.layout.assetPositions.filter(p=>p.id!==a.id);}a.area=updated.area;a.position=updated.position;}
   if(old)s.people[s.people.indexOf(old)]=updated;else s.people.push(updated);
   note=old?`${name}: ${areaName(old.area)} / ${old.position||'sem posto'} → ${areaName(updated.area)} / ${updated.position||'sem posto'}. Bens movimentados: ${moves.join('; ')||'nenhum'}.`:`Servidor ${name} cadastrado em ${areaName(updated.area)}.`;
  }else if(input.action==='verify'){
   const a=s.assets.find(x=>x.id===input.id&&!x.archived);if(!a)fail('Bem não encontrado.');a!.verified=input.undo?'':now;note=`${a!.code}: ${input.undo?'conferência desmarcada':'encontrado'} (${s.round}).`;
  }else if(input.action==='archive'){
   const a=s.assets.find(x=>x.id===input.id);if(!a)fail('Bem não encontrado.');a!.archived=!a!.archived;if(a!.archived&&s.layout)s.layout.pieces=s.layout.pieces.map(p=>p.assetId===a!.id?{...p,assetId:undefined}:p);if(s.layout?.assetPositions)s.layout.assetPositions=s.layout.assetPositions.filter(p=>p.id!==a!.id);note=`${a!.code}: ${a!.archived?'arquivado do controle (não representa baixa oficial)':'restaurado ao controle'}.`;
  }else if(input.action==='round'){
   const name=clean(input.name,150);if(!name)fail('Informe o nome da conferência.');const count=s.assets.filter(a=>!a.archived&&a.verified).length;note=`Encerrada ${s.round}: ${count} bens conferidos. Iniciada ${name}.`;s.round=name;s.assets.forEach(a=>a.verified='');
  }else throw Error('Ação inválida');
  s.history.unshift({id:crypto.randomUUID(),date:now,text:note});return s;
}
const originalFetch=window.fetch.bind(window);
export function installBridge(){window.fetch=async function(resource:any,init?:RequestInit){const url=typeof resource==='string'?resource:resource.url;if(url!=='/api/inventory')return originalFetch(resource,init);try{const {data:{session}}=await client.auth.getSession();if(!session)return Response.json({error:'Entre na sua conta.'},{status:401});const id=session.user.id;const {data:row,error}=await client.from('central_patrimonio_workspace').select('payload,revision').eq('user_id',id).maybeSingle();if(error)throw error;if(!row)return Response.json({error:'Dados ainda não migrados.'},{status:404});if(!init?.method||init.method==='GET')return Response.json({state:row.payload,revision:row.revision,canEdit:true});const input=JSON.parse(String(init.body));if(input.revision!==row.revision)return Response.json({error:'Os dados mudaram em outra aba. Recarregue antes de salvar.'},{status:409});const state=await execute(input,row);const result=await client.from('central_patrimonio_workspace').update({payload:state,revision:row.revision+1}).eq('user_id',id).eq('revision',row.revision).select('revision').maybeSingle();if(result.error)throw result.error;if(!result.data)return Response.json({error:'Outra atualização ocorreu. Recarregue os dados.'},{status:409});return Response.json({state,revision:result.data.revision});}catch(e){return Response.json({error:e instanceof Error?e.message:'Não foi possível acessar os dados.'},{status:400})}} as typeof fetch;}
