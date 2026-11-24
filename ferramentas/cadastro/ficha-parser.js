'use strict';
function parseStandardFichas(paragraphs){
 const starts=[];paragraphs.forEach((p,i)=>{if(/^Item nº\s*\d+\s+de\s+\d+/i.test(p.trim()))starts.push(i)});
 return starts.map((start,index)=>{
  const section=paragraphs.slice(start+1,starts[index+1]??paragraphs.length),fields={};let key='';
  for(const paragraph of section){const match=paragraph.match(/^([1-7])\s+(Tipo de item|Nome resumido|Descrição detalhada|Unidade de fornecimento e apresentação|Justificativa da necessidade do item|Destinação e forma de utilização|Informações complementares e anexos)$/i);if(match){key=match[1];fields[key]=[]}else if(key&&paragraph.trim()!=='Ficha do item')fields[key].push(paragraph)}
  const value=k=>(fields[k]||[]).join('\n').trim();
  let unit=value('4').match(/Unidade:\s*([^\n]*)/i)?.[1]?.trim()||'';
  if(/^não informad|^\[/i.test(unit))unit='';
  const justification=value('5').split(/\nFinalidade específica deste item:/i)[0].trim();
  return {nome:value('2'),descricao:value('3'),unidade:unit,tipo:/^\s*(?:\[x\]\s*)?serviço/i.test(value('1'))?'Serviço':'Produto',justificativa:/^\[/.test(justification)?'':justification,pendencias:[!unit?'Unidade de fornecimento não informada.':'',value('6'),value('7')].filter(Boolean).join('\n'),pendenciasResolvidas:false};
 }).filter(it=>it.nome&&!it.nome.startsWith('['));
}
if(typeof module!=='undefined')module.exports={parseStandardFichas};
if(typeof readDocxXml==='function'){
 const tableParser=readDocxXml;
 readDocxXml=function(xml){const result=tableParser(xml);if(result.items.length)return result;const doc=new DOMParser().parseFromString(xml,'application/xml');
 const paragraphs=[...doc.getElementsByTagNameNS(NS,'p')].map(p=>[...p.getElementsByTagNameNS(NS,'r')].map(r=>[...r.childNodes].map(n=>n.localName==='t'?n.textContent:n.localName==='br'?'\n':n.localName==='tab'?'\t':'').join('')).join(''));
 const items=parseStandardFichas(paragraphs);return {source:paragraphs.join('\n'),items:items.map(it=>blank(it))};
 };
}
