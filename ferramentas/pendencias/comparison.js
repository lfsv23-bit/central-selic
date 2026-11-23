/* Parsing and matching of user-supplied TXT exports. No requests to the system. */
(function(root){
  const normalize=(n,y)=>`${Number(n)}/${y}`;
  function validDate(s){const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);if(!m)return false;const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));return d.getUTCFullYear()===+m[3]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[1];}
  const iso=s=>s.slice(6)+'-'+s.slice(3,5)+'-'+s.slice(0,2);
  function parseSector(text,name='Relatório do setor'){
    const t=text.replace(/^\uFEFF/,'').replace(/\r/g,'');
    if(!t.includes('Lista de Protocolos / Processos Encontrados'))throw Error('Escolha o TXT da Lista de Protocolos / Processos Encontrados.');
    const sector=/^Setor: (.+)$/m.exec(t)?.[1]?.trim()||SectorCatalog.items.find(s=>t.includes(s.name))?.name;
    if(!SectorCatalog.find(sector))throw Error('O TXT deve identificar um dos sete setores disponíveis; Arquivo de Finalizados não é aceito.');
    const matches=Array.from(t.matchAll(/^(\d+)\s+(\d{4})\s+(\d{2}\/\d{2}\/\d{4})([^\n]*)/gm));
    const total=Array.from(t.matchAll(/Total de Protocolos:\s*(\d+)/g));
    if(total.length!==1)throw Error('Importe um relatório de um único setor, com Total de Protocolos no final.');
    if(matches.length!==+total[0][1])throw Error('O número de linhas não corresponde ao total do relatório. Verifique se o TXT está completo.');
    const records=matches.map((m,i)=>{
      if(!validDate(m[3]))throw Error('O relatório contém uma data inválida.');
      let tail=m[4],responsible='';const resp=/^ +([^\t]+)\t/.exec(tail);if(resp){responsible=resp[1].trim();tail=tail.slice(resp[0].length);}else tail=tail.replace(/^\t/,'');
      const parts=tail.split('\t').map(s=>s.trim());
      const chunk=t.slice(m.index,(matches[i+1]?.index??t.length));
      let detail=chunk.match(/DADOS:\s*([\s\S]*)/)?.[1]||'';
      detail=detail.split(/\nPREFEITURA MUNICIPAL|\nTotal de Protocolos:/)[0].trim();
      const original=m[0].split(/\s+DADOS:/)[0];
      const clean=s=>s.split(/\s*SEPRAD - PROTOCOLO GERAL \/ SEL|\s*DADOS:/)[0].trim();
      const readableOpinion=/^(PEDIDO|COTAÇÃO|HOMOLOGAÇÃO|ENCAMINHAMENTO|DEVOLUÇÃO)$/.test(parts[1]||'');
      const opinion=readableOpinion?parts[1]:'';
      const interested=readableOpinion?clean(parts.slice(2).join(' ')):'';
      return {protocol:String(Number(m[1])),year:m[2],date:m[3],sector,subject:parts[0]?.split(/\s+DADOS:/)[0]||'',responsible,details:detail,sourceLine:original,interested,sender:'',opinion,item:''};
    });
    if(new Set(records.map(r=>normalize(r.protocol,r.year))).size!==records.length)throw Error('O relatório contém mais de um trâmite do mesmo protocolo. Gere a consulta com Último Trâmite marcado.');
    return {records,sector,name,total:records.length};
  }
  function parsePending(text,name='Lista de pendentes'){
    const t=text.replace(/^\uFEFF/,'').replace(/\r/g,'');
    if(!t.startsWith('PROCESSOS TRAMITADOS E AINDA NÃO RECEBIDOS'))throw Error('Escolha o TXT exportado pela visão Pendências.');
    const sector=/^Setor: (.+)$/m.exec(t)?.[1]?.trim();
    if(!SectorCatalog.find(sector))throw Error('O TXT deve identificar um dos sete setores disponíveis.');
    const coverage=/^Período: (\d{4}-\d{2}-\d{2}|início) a (\d{4}-\d{2}-\d{2}|fim)$/m.exec(t);
    if(!coverage)throw Error('O TXT não informa o período da consulta.');
    const matches=Array.from(t.matchAll(/^Protocolo: (\d+)\/(\d{4})$/gm));
    const total=/^Total de processos: (\d+)$/m.exec(t);
    if(!total||+total[1]!==matches.length)throw Error('O TXT de pendentes está incompleto.');
    const records=matches.map((m,i)=>{const chunk=t.slice(m.index,matches[i+1]?.index??t.length);const value=label=>chunk.match(new RegExp('^'+label+': *(.*)$','m'))?.[1]?.trim()||'';const date=value('Data da tramitação');if(!validDate(date))throw Error('O TXT de pendentes contém uma data inválida.');return {protocol:String(Number(m[1])),year:m[2],date,sector,sender:value('Setor remetente'),interested:value('Interessado'),responsible:value('Responsável'),subject:value('Assunto'),opinion:value('Parecer'),details:value('DADOS')};});
    return {records,collectedAt:/^Consulta: (.+)$/m.exec(t)?.[1]||null,sector,coverageStart:coverage[1]==='início'?null:coverage[1],coverageEnd:coverage[2]==='fim'?null:coverage[2],name};
  }
  function compare(report,pending){
    const keys=new Set(pending.records.map(r=>(r.sector||pending.sector)+'|'+normalize(r.protocol,r.year)));
    return report.records.map(r=>{const d=iso(r.date);const source=(pending.sources||[pending]).find(s=>s.sector===(r.sector||report.sector));const covered=!!source&&(!source.coverageStart||d>=source.coverageStart)&&(!source.coverageEnd||d<=source.coverageEnd);const status=keys.has((r.sector||report.sector)+'|'+normalize(r.protocol,r.year))?'pending':covered?'received':'unknown';const p=pending.records.find(p=>(p.sector||pending.sector)===(r.sector||report.sector)&&normalize(p.protocol,p.year)===normalize(r.protocol,r.year));return {...p,...r,sender:p?.sender||'',interested:r.interested||p?.interested||'',opinion:r.opinion||p?.opinion||'',responsible:r.responsible||p?.responsible||'',status};});
  }
  function nativeSector(text,name){
    text=text.replace(/\uFEFF/g,'').replace(/\r/g,'');
    if(/^Setor: /m.test(text))return consolidated(text,name,parseSector,'Lista de Protocolos / Processos Encontrados');
    const matches=[...text.matchAll(/^(\d+)\s+(\d{4})\s+(\d{2}\/\d{2}\/\d{4})[^\n]*/gm)];
    const totals=[...text.matchAll(/Total de Protocolos:\s*(\d+)/g)];
    if(totals.length!==1||matches.length!==Number(totals[0][1]))throw Error('O TXT do setor está incompleto ou contém vários relatórios sem cabeçalho.');
    const lines=matches.map(m=>m[0]).join('\n');
    const candidates=SectorCatalog.items.filter(s=>lines.includes(s.name.slice(0,30)));
    if(candidates.length!==1)throw Error('Não foi possível identificar com segurança o setor no TXT. Solicite o arquivo com cabeçalho Setor.');
    const body=matches.map((m,i)=>text.slice(m.index,matches[i+1]?.index??text.length).split(/\nPREFEITURA MUNICIPAL|\nTotal de Protocolos:/)[0].trim()).join('\n\n');
    return parseSector('Lista de Protocolos / Processos Encontrados\nSetor: '+candidates[0].name+'\n'+body+'\nTotal de Protocolos: '+matches.length,name);
  }
  function consolidated(text,name,parser,title){
    const starts=Array.from(text.matchAll(new RegExp('^'+title,'gm'))).map(m=>m.index);
    if(starts.length<=1)return parser(text,name);
    let result=null;
    for(let i=0;i<starts.length;i++)result=SectorCatalog.merge(result,parser(text.slice(starts[i],starts[i+1]??text.length),name));
    return result;
  }
  root.ProtocolComparison={parseSector:nativeSector,parsePending:(text,name)=>consolidated(text.replace(/\uFEFF/g,'').replace(/\r/g,''),name,parsePending,'PROCESSOS TRAMITADOS E AINDA NÃO RECEBIDOS'),compare};
  if(typeof module!=='undefined')module.exports=root.ProtocolComparison;
})(typeof globalThis!=='undefined'?globalThis:this);

