(function(root){
 function key(number){const m=/^\s*(\d[\d.]*)\s*\/\s*(\d{4})\s*$/.exec(String(number??''));return m?`${Number(m[1].replace(/\./g,''))}/${m[2]}`:null;}
 function parse(text,name){let records;try{records=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('O arquivo não contém um JSON válido.');}
  if(!Array.isArray(records)||records.some(r=>!r||typeof r!=='object'||Array.isArray(r)||!('numero' in r)))throw Error('Escolha um backup com uma lista de processos e o campo numero.');
  return {name,records};
 }
 function compare(backup,pending){const keys=new Map(pending.records.map(r=>[key(`${r.protocol}/${r.year}`),r]));const matches=[],invalid=[];
  for(const r of backup.records){const number=key(r.numero);if(!number){invalid.push(r);continue;}const p=keys.get(number);if(p)matches.push({number,process:r,pending:p});}
  return {matches,invalid,unique:new Set(matches.map(m=>m.number)).size};
 }
 root.BackupComparison={key,parse,compare};if(typeof module!=='undefined')module.exports=root.BackupComparison;
})(typeof globalThis!=='undefined'?globalThis:this);

