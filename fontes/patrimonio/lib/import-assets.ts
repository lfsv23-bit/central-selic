import type {State, Asset} from './model';
export type ImportRow={code:string;description:string;legacy:string;notes:string};
const norm=(s:string)=>s.replace(/\*/g,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function parseImport(text:string):ImportRow[]{
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
 const markdown=lines[0]?.trim().startsWith('|');
 const parse=(line:string)=>{if(markdown)return line.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());const out:string[]=[];let part='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){part+='"';i++}else quoted=!quoted}else if(c===';'&&!quoted){out.push(part.trim());part=''}else part+=c}if(quoted)throw Error('CSV inválido: aspas abertas ou campo com quebra de linha.');out.push(part.trim());return out};
 const header=parse(lines[0]||'').map(norm);const at=(names:string[])=>header.findIndex(h=>names.includes(h));
 const code=at(['grupo/chapa','grupo / chapa','codigo','codigo patrimonial']),description=at(['descricao do patrimonio','descricao']),legacy=at(['existe','situacao']),notes=at(['observacao','observacoes']);
 if(code<0||description<0||legacy<0||notes<0)throw Error('A planilha deve conter Grupo/Chapa, Descrição do Patrimônio, Existe e Observação.');
 return lines.slice(markdown?2:1).map(parse).map(r=>({code:r[code]||'',description:r[description]||'',legacy:r[legacy]||'',notes:r[notes]||''})).filter(r=>r.code||r.description);
}
export function planImport(s:State, rows:ImportRow[]){
 const seen=new Set<string>(),duplicates=new Set<string>();for(const r of rows){if(seen.has(r.code))duplicates.add(r.code);seen.add(r.code)}
 const issues:string[]=[],updates:{row:ImportRow;old?:Asset;kind:'novo'|'alterado'|'inalterado'}[]=[];
 for(const row of rows){if(!row.code||!row.description||duplicates.has(row.code)){issues.push(`${row.code||'Sem chapa'}: chapa ou descrição ausente, ou chapa repetida na planilha.`);continue}const matches=s.assets.filter(a=>a.code===row.code);if(matches.length>1){issues.push(`${row.code}: código duplicado no cadastro; revise manualmente.`);continue}const old=matches[0];const kind=!old?'novo':old.description!==row.description||old.legacy!==row.legacy||old.notes!==row.notes?'alterado':'inalterado';updates.push({row,old,kind});}
 return {updates,issues};
}
