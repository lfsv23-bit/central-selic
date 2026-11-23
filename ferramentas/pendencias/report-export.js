globalThis.ReportExport=(()=>{
 const line=s=>String(s??'').replace(/[\t\r\n]+/g,' ').trim();
 function pending(data,start,end){
  let text=`PROCESSOS TRAMITADOS E AINDA NÃO RECEBIDOS\r\nSetor: ${data.sector}\r\nConsulta: ${data.collectedAt}\r\nPeríodo: ${start} a ${end}\r\n\r\n`;
  for(const r of data.records)text+=['Protocolo: '+r.protocol+'/'+r.year,'Data da tramitação: '+r.date,'Setor remetente: '+line(r.sender),'Interessado: '+line(r.interested),'Responsável: '+line(r.responsible),'Assunto: '+line(r.subject),'Parecer: '+line(r.opinion),'DADOS: '+line(r.details)].join('\r\n')+'\r\n\r\n';
  return text+'Total de processos: '+data.records.length+'\r\n';
 }
 function sector(data,start,end){
  let text=`Lista de Protocolos / Processos Encontrados\r\nConsulta: ${data.collectedAt}\r\nPeríodo: ${start} a ${end}\r\nSetor: ${data.sector}\r\n\r\nCódigo  Exerc.  Data\tResponsável\tAssunto\tParecer\tInteressado\tSetor Atual\r\n\r\n`;
  for(const r of data.records)text+=`${r.protocol}\t${r.year}\t${r.date}${r.responsible?'   '+line(r.responsible):''}\t${[r.subject,r.opinion,r.interested,data.sector].map(line).join('\t')}\r\nDADOS: ${line(r.details)}\r\n\r\n`;
  return text+'Total de Protocolos:  '+data.records.length+'\r\n';
 }
 let urls=[];
 function showFiles(container,data,start,end){
  urls.forEach(URL.revokeObjectURL);urls=[];container.replaceChildren();
  for(const [kind,value] of [['sector',data.report],['pending',data.pending]]){
   if(!value)continue;
   const url=URL.createObjectURL(new Blob(['\ufeff',kind==='sector'?sector(value,start,end):pending(value,start,end)],{type:'text/plain;charset=utf-8'}));urls.push(url);
   const a=document.createElement('a');a.href=url;a.download=(kind==='sector'?'processos_no_setor':'pendencias')+'_'+start+'_a_'+end+'.txt';a.textContent=(kind==='sector'?'Baixar processos':'Baixar pendências')+` (${value.records.length})`;container.append(a);
  }
 }
 return {pending,sector,showFiles};
})();

