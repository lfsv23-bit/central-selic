(function(root){
 const key=r=>BackupComparison.key(r.numero??(r.protocol+'/'+r.year));
 const iso=s=>{s=String(s||'');if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);const m=/^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);return m?m[3]+'-'+m[2]+'-'+m[1]:'';};
 const inside=(r,f)=>{if(!f.start&&!f.end)return true;const d=iso(r.date);return !!d&&(!f.start||d>=f.start)&&(!f.end||d<=f.end);};
 const active=r=>r.ativo===true?'True':r.ativo===false?'False':'Não informado';
 const base=r=>({...r,number:key(r)||r.numero||r.protocol+'/'+r.year,statusText:r.statusText||'Não avaliado'});
 function jsonRows(data){return (data?.records||[]).map((r,i)=>base({numero:r.numero,protocol:key(r)?.split('/')[0]||r.numero,year:key(r)?.split('/')[1]||'',date:r.data||'',sector:r.setor||r.sector||'Não informado na planilha',subject:r.objeto||'',interested:r.secretaria||'',responsible:r.responsavel||'',opinion:r.andamento||'',sender:'',ativo:active(r),json:r,index:i,details:['Secretaria: '+(r.secretaria||''),'Andamento: '+(r.andamento||''),'Modalidade: '+(r.modalidade||''),'Valor: '+(r.valor||''),'Ativo: '+active(r),'ID: '+(r.id||'')].join('\n')}));}
 function run(state,mode,f){
 const report=SectorCatalog.select(state.report,f.sectors),pending=SectorCatalog.select(state.pending,f.sectors);
 const rr=report?.records.map(base)||[],pr=pending?.records.map(r=>base({...r,statusText:'Pendente'}))||[];
 const jr=jsonRows(state.backup).filter(r=>(f.active==='all'||r.ativo===f.active)&&(!f.secretaria||r.interested.toLocaleLowerCase().includes(f.secretaria.toLocaleLowerCase())));
 const jm=new Map();for(const r of jr){const k=key(r);if(k)jm.set(k,[...(jm.get(k)||[]),r]);}
 let rows=[],required=[],note='',categories=[];
 if(mode==='protocol'){required=['report'];rows=rr.map(r=>({...r,statusText:'No setor (Protocolo)'}));note='Data da tramitação no TXT de processos no setor.';}
 if(mode==='pending'){required=['pending'];rows=pr;note='Data da tramitação no TXT de pendências.';}
 if(mode==='json'){required=['backup'];rows=jr.map(r=>({...r,statusText:'Na planilha'}));note='A data é o campo data da planilha. O JSON não comprova localização física nem setor atual no Protocolo; os setores selecionados não filtram esta consulta. Duplicados do JSON são preservados.';}
 if(mode==='receipt'){required=['report','pending'];rows=report&&pending?ProtocolComparison.compare(report,pending).map(r=>base({...r,statusText:({pending:'Pendente',received:'Recebido por comparação',unknown:'Sem cobertura para concluir'})[r.status]})):[];categories=['Pendente','Recebido por comparação','Sem cobertura para concluir'];note='Recebido por comparação: consta no setor e não consta nas pendências do mesmo setor, dentro da cobertura consultada. Use fontes próximas no tempo; isso não comprova a entrega física nem informa a data do recebimento.';}
 if(mode==='protocol-json'){required=['report','backup'];rows=rr.map(r=>{const matches=jm.get(key(r))||[];return {...r,statusText:matches.length?'Está na planilha':'Não está na planilha',ativo:matches.map(m=>m.ativo).join(', '),details:(r.details||'')+'\n\nRegistros na planilha: '+matches.length+matches.map(m=>'\n'+m.subject+'\n'+m.details).join('\n')};});categories=['Está na planilha','Não está na planilha'];note='A presença na planilha é verificada pelo número e ano completos. Os filtros Ativo e Secretaria definem quais registros JSON entram no cruzamento.';}
 if(mode==='json-receipt'){required=['backup','report','pending'];const cmp=report&&pending?ProtocolComparison.compare(report,pending):[];rows=jr.map(r=>{const k=key(r),p=pr.filter(m=>key(m)===k&&k),matches=cmp.filter(m=>key(m)===k&&k);const label=p.length?'Pendente':matches.length&&matches.every(m=>m.status==='received')?'Recebido por comparação':'Sem comprovação';return {...r,statusText:label,sector:[...new Set([...p,...matches].map(m=>m.sector))].join('; ')||r.sector};});categories=['Pendente','Recebido por comparação','Sem comprovação'];note='A data filtrada é a data da planilha. Os setores selecionados limitam as evidências dos TXT. Sem correspondência e cobertura suficientes, a situação fica Sem comprovação. Não se presume recebimento pela simples ausência nas pendências.';}
 if(mode==='json-pending'){
  required=['backup','pending'];
  rows=jr.map(r=>{
   const k=key(r),matches=k?pr.filter(p=>key(p)===k):[];
   return {...r,statusText:matches.length?'Consta nas pendências':'Não localizado nas pendências',
    sector:[...new Set(matches.map(p=>p.sector).filter(Boolean))].join('; ')||r.sector,
    details:r.details+'\n\nPendências correspondentes: '+matches.length+matches.map(p=>'\nSetor: '+(p.sector||'Não informado')+' · Tramitação: '+(p.date||'Não informada')+'\n'+(p.subject||'')).join('\n')};
  });
  categories=['Consta nas pendências','Não localizado nas pendências'];
  note='Comparação apenas entre a planilha JSON e os TXT de pendências, por número e ano completos. A data filtrada é a data da planilha. Ativo e Secretaria filtram o JSON; os setores selecionados limitam os TXT. Não localizado significa ausência nos arquivos selecionados, sem comprovar recebimento. Registros duplicados da planilha são preservados.';
 }
 const missing=required.filter(k=>!state[k]);rows=rows.filter(r=>inside(r,f));
 if(f.search){const q=f.search.toLocaleLowerCase();rows=rows.filter(r=>Object.values(r).some(v=>typeof v==='string'&&v.toLocaleLowerCase().includes(q)));}
 const stats=Object.fromEntries(categories.map(c=>[c,rows.filter(r=>r.statusText===c).length]));const beforeStatus=rows.length;if(f.status&&f.status!=='all')rows=rows.filter(r=>r.statusText===f.status);
 return {rows,missing,note,categories,stats,total:beforeStatus,unique:new Set(rows.map(key).filter(Boolean)).size,invalid:rows.filter(r=>!key(r)).length};
 }
 root.ControlEngine={key,iso,run};if(typeof module!=='undefined')module.exports=root.ControlEngine;
})(globalThis);

