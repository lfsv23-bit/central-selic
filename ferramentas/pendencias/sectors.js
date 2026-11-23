(function(root){
 const items=[
 ['10261','SEPRAD - SECRETARIA EXECUTIVA DE LICITAÇÕES E CONTRATAÇÕES'],
 ['10265','SEPRAD - PROTOCOLO GERAL / SELIC'],
 ['10266','SEPRAD - IRP / SELIC'],
 ['10267','SEPRAD - PLANEJAMENTO / SELIC'],
 ['10268','SEPRAD - COTAÇÃO / SELIC'],
 ['10269','SEPRAD - EDITAL / SELIC'],
 ['10270','SEPRAD - LICITAÇÃO / SELIC']
 ].map(([id,name])=>({id,name}));
 const find=name=>items.find(s=>s.name===name||s.id===String(name).replace(/^0/,''));
 const ids=value=>value==='all'?items.map(s=>s.id):Array.isArray(value)?value:[value];
 const label=value=>{const selected=items.filter(s=>ids(value).includes(s.id));return selected.length===items.length?'Todos os setores disponíveis':selected.map(s=>s.name).join('; ')||'Nenhum setor selecionado';};
 function select(data,id){if(!data)return null;const names=items.filter(s=>ids(id).includes(s.id)).map(s=>s.name);const records=data.records.filter(r=>items.some(s=>s.name===(r.sector||data.sector))&&names.includes(r.sector||data.sector));return {...data,records:records.map(r=>({...r,sector:r.sector||data.sector})),sources:(data.sources||[(({records,sources,...metadata})=>metadata)(data)]).filter(s=>names.includes(s.sector)),sector:label(id)};}
 function merge(previous,next){const incoming=new Set(next.records.map(r=>r.sector));for(const s of next.sources||[next])incoming.add(s.sector);const sources=[...(previous?.sources|| (previous?[previous]:[])).filter(s=>!incoming.has(s.sector)),...(next.sources||[next])].map(s=>{const {records,sources,...metadata}=s;return metadata;});return {...next,records:[...(previous?.records||[]).filter(r=>!incoming.has(r.sector||previous.sector)),...next.records],sources,sector:sources.length===1?sources[0].sector:'Todos os setores disponíveis'};}
 root.SectorCatalog={items,find,select,merge,ids,label};if(typeof module!=='undefined')module.exports=root.SectorCatalog;
})(globalThis);



