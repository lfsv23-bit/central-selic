/* Acervo persistente; os originais ficam no armazenamento privado. */
let catalogRows=[], importRows=[];
window.catalogContext=null;
window.catalogDownload='';
window.actNames={licitacao:'Aviso de licitação',resultado:'Aviso de resultado',contratacao_direta:'Aviso de contratação direta',homologacao:'Homologação / Adjudicação',retificacao:'Retificação',prorrogacao:'Prorrogação',suspensao:'Suspensão',reabertura:'Reabertura',contrato:'Extrato de contrato / adesão',aditivo:'Termo aditivo',outro:'Outro / não identificado'};
const mediumNames={corumba:'Município',estado:'Estado',jornal:'Jornal',uniao:'União'};
const modalityNames={pregao:'Pregão eletrônico',concorrencia:'Concorrência eletrônica',dispensa:'Dispensa eletrônica',chamada:'Chamada pública',credenciamento:'Credenciamento',outro:'Outra modalidade'};
const searchText=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\.(?=\d)/g,'').toLowerCase();
const options=(map,value)=>Object.entries(map).map(([k,v])=>`<option value="${esc(k)}" ${k===value?'selected':''}>${esc(v)}</option>`).join('');
document.head.insertAdjacentHTML('beforeend',`<style>
.acervo{margin-bottom:24px}.acervo table{width:100%;border-collapse:collapse;font-size:13px}.acervo td,.acervo th{text-align:left;border-bottom:1px solid var(--border);padding:14px 8px;vertical-align:top}.acervo th{font-size:11px;color:var(--muted);text-transform:uppercase}.acervo td button{padding:7px 9px;margin:3px 3px 0 0}.acervo .scroll-table{overflow:auto}.acervo td:first-child{min-width:220px;max-width:370px}.acervo label{margin-top:10px}.preview-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.preview-grid .wide{grid-column:1/-1}.preview-card{border:1px solid var(--border);border-radius:10px;padding:16px;margin-top:14px}.preview-card pre{white-space:pre-wrap;max-height:220px;overflow:auto;font:12px/1.5 inherit}.preview-card input[type=checkbox]{width:auto}.file-row{display:flex;align-items:center;gap:15px;margin:10px 0}.file-row span{flex:1;overflow-wrap:anywhere}.file-row select{max-width:180px}.acervo-top{display:flex;align-items:center;justify-content:space-between;gap:15px}.acervo-top h2{margin:0}.acervo-toolbar{display:flex;gap:12px;align-items:center;margin:16px 0}.acervo-toolbar input{margin:0}.acervo-status{margin:12px 0;white-space:pre-wrap;color:var(--teal)}#editExtract{max-width:850px}#editExtract label{display:block;border:0;padding:0;margin:8px 0;background:none}#editExtract input{width:100%;height:auto;margin-top:7px}#activeExtract{margin-bottom:16px}@media(max-width:700px){.preview-grid{grid-template-columns:1fr}.file-row{display:block}.acervo-top{align-items:flex-start;flex-direction:column}}
</style>`);
document.querySelector('.layout').insertAdjacentHTML('beforebegin',`<section class="panel acervo" id="catalogPanel">
<div class="acervo-top"><div><h2>Meus extratos</h2><div class="hint">Importe os documentos preparados, encontre o extrato e guarde as páginas localizadas.</div></div><span class="tag" id="catalogCount">Acervo online</span></div>
<details id="importArea"><summary style="cursor:pointer;margin-top:18px;color:var(--teal)">Importar documentos de publicação</summary>
<p class="hint">DOC, DOCX, RTF ou TXT · até 10 MB por arquivo. Pode selecionar vários documentos, cada um com vários extratos. Confirme o meio de cada documento e revise os campos antes de salvar.</p>
<input type="file" id="importFiles" multiple accept=".doc,.docx,.rtf,.txt" aria-label="Documentos de extratos"><div id="fileMedia"></div><button id="readExtracts" class="primary" type="button">Identificar extratos</button>
<div id="importPreview"></div><button id="saveExtracts" type="button" class="primary hidden" style="margin-top:16px">Salvar extratos selecionados na tabela</button></details>
<p id="catalogMessage" class="acervo-status" role="status"></p>
<div class="acervo-toolbar"><input type="search" id="catalogSearch" placeholder="Buscar por processo, licitação, e-Sfinge ou objeto…" aria-label="Pesquisar no acervo"><select id="catalogType" aria-label="Tipo de extrato na tabela"><option value="all">Todos os tipos</option></select><button id="refreshCatalog" type="button">Atualizar</button></div>
<div class="hint">Meios informados vêm dos documentos importados. Só as páginas que você conferir e selecionar na busca ficam vinculadas para baixar novamente. Aviso, resultado e retificação são atos distintos.</div>
<div class="scroll-table"><table><thead><tr><th>Processo / licitação</th><th>Objeto</th><th>Meios informados</th><th>Páginas vinculadas</th><th>Ações</th></tr></thead><tbody id="catalogBody"></tbody></table></div>
</section><div id="activeExtract" class="status hidden"></div>`);
document.body.insertAdjacentHTML('beforeend',`<dialog id="editExtract"><h2>Revisar extrato</h2><div id="editFields"></div><details><summary>Documentos de origem</summary><div id="editOriginals"></div></details><div class="dialog-actions"><button id="deleteExtract" class="danger">Excluir extrato</button><button id="cancelEdit">Cancelar</button><button class="primary" id="saveEdit">Salvar alterações</button></div><p id="editError" role="alert"></p></dialog>`);

const searchScreen=document.createElement('section');searchScreen.id='searchScreen';
document.querySelector('.layout').before(searchScreen);
searchScreen.append($('activeExtract'),document.querySelector('.layout'));
$('catalogPanel').insertAdjacentHTML('beforebegin','<nav aria-label="Menu principal" style="display:flex;gap:10px;margin-bottom:24px"><button type="button" id="menuCatalog" aria-controls="catalogPanel">Meus extratos</button><button type="button" id="menuSearch" aria-controls="searchScreen">Buscar publicações</button></nav>');
function showScreen(view){
    const searching=view==='busca';
    $('catalogPanel').classList.toggle('hidden',searching);searchScreen.classList.toggle('hidden',!searching);
    for(const [id,active] of [['menuCatalog',!searching],['menuSearch',searching]]){const button=$(id);button.classList.toggle('primary',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')}
    document.querySelector('h1').textContent=searching?'Buscar publicações.':'Meus extratos.';
    document.querySelector('p.sub').textContent=searching?'Confira os dados, pesquise nos meios escolhidos e baixe as publicações.':'Importe os documentos, organize os extratos e acompanhe as páginas localizadas.';
    if(location.hash!=='#'+view)history.replaceState(null,'','#'+view);
}
$('menuCatalog').onclick=()=>showScreen('extratos');$('menuSearch').onclick=()=>showScreen('busca');
window.addEventListener('hashchange',()=>showScreen(location.hash==='#busca'?'busca':'extratos'));
showScreen(location.hash==='#busca'?'busca':'extratos');

for(const id of ['act_type','actFilter','catalogType'])$(id).innerHTML=options({all:'Todos os tipos',...window.actNames},'all');
try{const prior=JSON.parse(localStorage.getItem('diario-fields')||'{}');if(prior.act_type in window.actNames)$('act_type').value=prior.act_type}catch{}
function fieldForm(f,prefix){return `<div class="preview-grid"><label class="wide">Tipo de extrato<select data-field="act_type" id="${prefix}act_type">${options(window.actNames,f.act_type||'outro')}</select></label>
<label class="wide">Título do ato<input data-field="title" id="${prefix}title" value="${esc(f.title||'')}" maxlength="250"></label>
<label>Processo<input data-field="process" id="${prefix}process" value="${esc(f.process||'')}"></label>
<label>Modalidade<select data-field="modality" id="${prefix}modality">${options(modalityNames,f.modality||'outro')}</select></label>
<label>Número da licitação<input data-field="tender" id="${prefix}tender" value="${esc(f.tender||'')}"></label>
<label>Data do extrato · opcional<input type="date" data-field="date" id="${prefix}date" value="${esc(f.date||'')}"></label>
<label style="grid-column:span 2">Código e-Sfinge<input data-field="esfinge" id="${prefix}esfinge" value="${esc(f.esfinge||'')}"></label>
<label class="wide">Objeto<textarea data-field="object" id="${prefix}object" maxlength="2000">${esc(f.object||'')}</textarea></label></div>`}
function readFields(container){return Object.fromEntries([...container.querySelectorAll('[data-field]')].map(el=>[el.dataset.field,el.value]))}
function processKey(r){return r.fields.process||'sem-processo-'+r.id}
function processGroups(rows){const groups=new Map();for(const r of rows){const key=processKey(r);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}return [...groups.values()]}
function drawCatalog(){
const query=searchText($('catalogSearch').value),type=$('catalogType').value;
const groups=processGroups(catalogRows),list=groups.filter(group=>group.some(r=>searchText(Object.values(r.fields).join(' ')).includes(query)&&(type==='all'||r.fields.act_type===type)));
$('catalogCount').textContent=groups.length+' processos · '+catalogRows.length+' extratos';
$('catalogBody').innerHTML=list.map(group=>{const r=group[0],sources=[...new Set(group.flatMap(r=>r.sources))],links=new Set(group.flatMap(r=>r.links.map(l=>l.source+'|'+l.url+'|'+l.page))),tenders=[...new Set(group.map(r=>(modalityNames[r.fields.modality]||'')+': '+(r.fields.tender||'—')))];return `<tr><td><b>${esc(r.fields.process||'Processo não informado')}</b><br>${tenders.map(esc).join('<br>')}<p class="hint">${group.length} extrato(s) anexado(s)</p></td><td>${[...new Set(group.map(r=>r.fields.object).filter(Boolean))].map(o=>`<p class="hint">${esc(o.slice(0,220))}</p>`).join('')||'Objeto não informado'}</td><td>${sources.map(k=>esc(mediumNames[k])).join('<br>')}</td><td>${links.size?links.size+' página(s) vinculada(s)':'A localizar'}</td><td><button data-process="${esc(r.id)}">Revisar</button></td></tr>`}).join('')||'<tr><td colspan="5">Nenhum processo encontrado neste filtro.</td></tr>';
}
document.body.insertAdjacentHTML('beforeend',`<dialog id="processExtracts" style="width:min(900px,90vw);max-width:900px"><h2 id="processTitle"></h2><p class="hint">Escolha o extrato que deseja revisar, localizar ou baixar. Cada ato mantém seus documentos e páginas vinculadas.</p><form id="processSearchForm"><label for="processActSearch">Buscar extratos deste processo</label><div class="process-search-row"><input type="text" id="processActSearch" placeholder="Digite qualquer informação do texto do extrato…"><button class="primary" type="submit">Pesquisar</button><button id="clearProcessSearch" type="button">Limpar</button></div></form><p id="processActCount" class="hint" role="status"></p><div id="processActs"></div><div class="dialog-actions"><button id="deleteProcess" class="danger">Excluir processo</button><button id="closeProcess">Fechar</button></div></dialog>`);
let reviewingProcessKey="";
function openProcess(row){reviewingProcessKey=processKey(row);$('processTitle').textContent='Processo '+(row.fields.process||'não informado');$('processActSearch').value='';drawProcessActs();if(!$('processExtracts').open)$('processExtracts').showModal()}
function drawProcessActs(){
const group=catalogRows.filter(r=>processKey(r)===reviewingProcessKey);
const terms=searchText($('processActSearch').value).trim().split(/\s+/).filter(Boolean);
const filtered=group.filter(r=>{const haystack=searchText([...Object.values(r.fields),window.actNames[r.fields.act_type],(r.fields.date||'').split('-').reverse().join('/'),...r.sources.map(k=>mediumNames[k]),...r.documents.flatMap(d=>[d.document,d.text||''])].join(' '));return terms.every(term=>haystack.includes(term))});
$('processActCount').textContent=filtered.length+' de '+group.length+' extrato(s)';
$('processActs').innerHTML=filtered.map(r=>`<article class="preview-card"><b>${esc(r.fields.title||window.actNames[r.fields.act_type])}</b><p class="hint">${esc(window.actNames[r.fields.act_type]||'Outro')} · ${esc(r.fields.date?r.fields.date.split('-').reverse().join('/'):'Data não informada')} · ${r.sources.map(k=>esc(mediumNames[k])).join(', ')}</p><p class="hint">${r.documents.length} documento(s) anexado(s) · ${r.links.length} página(s) vinculada(s)</p><button class="danger" data-action="delete" data-record="${esc(r.id)}">Excluir extrato</button> <button data-action="edit" data-record="${esc(r.id)}">Revisar extrato</button> <button data-action="locate" data-record="${esc(r.id)}">Localizar</button> <button data-action="download" data-record="${esc(r.id)}" ${r.links.length?'':'disabled'}>Baixar PDFs</button></article>`).join('')||'<p class="hint">Nenhum extrato encontrado. Tente outro termo.</p>';
}
$('processActSearch').oninput=drawProcessActs;
$('processSearchForm').onsubmit=e=>{e.preventDefault();drawProcessActs()};
$('clearProcessSearch').onclick=()=>{$('processActSearch').value='';drawProcessActs();$('processActSearch').focus()};
$('closeProcess').onclick=()=>$('processExtracts').close();
$('catalogBody').onclick=e=>{const button=e.target.closest('button[data-process]');if(button&&!busy){const row=catalogRows.find(r=>r.id===button.dataset.process);if(row)openProcess(row)}};
window.refreshCatalog=async()=>{const data=await api('/api/catalog');catalogRows=data.records;drawCatalog()};
$('refreshCatalog').onclick=()=>refreshCatalog().catch(e=>$('catalogMessage').textContent=e.message);
$('catalogSearch').oninput=drawCatalog;$('catalogType').onchange=drawCatalog;
$('importFiles').onchange=()=>{$('fileMedia').innerHTML=[...$('importFiles').files].map((f,i)=>{const n=searchText(f.name);const medium=n.includes('dou')?'uniao':n.includes('estado')?'estado':n.includes('jornal')?'jornal':'corumba';return `<div class="file-row"><span>${esc(f.name)}</span><select id="fileMedium${i}" aria-label="Meio de ${esc(f.name)}">${options(mediumNames,medium)}</select></div>`}).join('')};
const fileBase64=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Não foi possível ler '+file.name));reader.readAsDataURL(file)});
$('readExtracts').onclick=async()=>{if(busy)return;const files=[...$('importFiles').files];if(!files.length){$('catalogMessage').textContent='Selecione os documentos.';return}if(files.length>20||files.some(f=>f.size>10*1024*1024)){$('catalogMessage').textContent='Selecione até 20 documentos de no máximo 10 MB cada.';return}setBusy(true);$('readExtracts').disabled=true;$('saveExtracts').classList.add('hidden');importRows=[];$('importPreview').innerHTML='';const failed=[];try{for(let i=0;i<files.length;i++){const f=files[i];$('catalogMessage').textContent=`Lendo ${i+1}/${files.length}: ${f.name}…`;try{const job=await api('/api/catalog/import',{name:f.name,content:await fileBase64(f)});const done=await poll(job.id);done.entries.forEach((row,index)=>importRows.push({...row,job_id:job.id,index,source:$('fileMedium'+i).value}))}catch(e){failed.push(f.name+': '+e.message)}}
drawPreview();$('catalogMessage').textContent=`${importRows.length} extratos identificados. Revise os campos. Textos idênticos serão reunidos automaticamente, preservando seus meios e documentos.`+(failed.length?'\nFalhas:\n'+failed.join('\n'):'')
}finally{setBusy(false);$('readExtracts').disabled=false}};
function drawPreview(){$('importPreview').innerHTML=importRows.map((r,i)=>`<article class="preview-card" id="preview${i}"><label><input type="checkbox" class="include" checked> Importar extrato ${i+1} · ${esc(r.document)}</label>${r.warnings.map(w=>'<p class="notice">'+esc(w)+'</p>').join('')}${fieldForm(r,'preview'+i+'_')}<label>Meio informado<select class="medium">${options(mediumNames,r.source)}</select></label><label>Reunir com um extrato já salvo<select class="target"><option value="">Automático: somente textos idênticos</option>${catalogRows.filter(c=>c.fields.process&&c.fields.process===r.process).map(c=>`<option value="${c.id}">${esc(c.fields.title)} · ${esc(c.fields.date||'sem data')}</option>`).join('')}</select></label><p class="hint">Só escolha um registro existente se for o mesmo ato. Mesmo processo não significa mesma publicação.</p><details><summary>Conferir texto extraído</summary><pre>${esc(r.text)}</pre></details></article>`).join('');$('saveExtracts').classList.toggle('hidden',!importRows.length)}
$('saveExtracts').onclick=async()=>{if(busy)return;const items=importRows.flatMap((r,i)=>{const card=$('preview'+i);return card.querySelector('.include').checked?[{job_id:r.job_id,index:r.index,fields:readFields(card),source:card.querySelector('.medium').value,target_id:card.querySelector('.target').value}]:[]});if(!items.length){$('catalogMessage').textContent='Selecione pelo menos um extrato.';return}setBusy(true);$('saveExtracts').disabled=true;try{const saved=await api('/api/catalog/save',{items});await refreshCatalog();$('catalogMessage').textContent=`Importação salva em ${saved.saved.length} registro(s). Os documentos originais foram preservados no acervo online.`;$('importPreview').innerHTML='';$('saveExtracts').classList.add('hidden');importRows=[];$('importArea').open=false}catch(e){$('catalogMessage').textContent=e.message}finally{setBusy(false);$('saveExtracts').disabled=false}};
let editingId='';
$('processActs').onclick=async e=>{const button=e.target.closest('button[data-action]');if(!button||busy)return;const row=catalogRows.find(r=>r.id===button.dataset.record);if(!row)return;try{
if(button.dataset.action==='delete'){await deleteCatalogRows([row]);return}
if(button.dataset.action==='edit'){editingId=row.id;$('editFields').innerHTML=fieldForm(row.fields,'edit_');$('editOriginals').innerHTML=row.documents.map(d=>`<p><b>${esc(d.document)} · ${esc(mediumNames[d.source])}</b></p><pre style="white-space:pre-wrap;max-height:220px;overflow:auto">${esc(d.text)}</pre>`).join('');$('editError').textContent='';$('editExtract').showModal();return}
$('processExtracts').close();
if(button.dataset.action==='download'){window.catalogDownload=row.id;showScreen('busca');$('welcome').classList.add('hidden');$('resultsArea').classList.remove('hidden');$('downloadDialog').showModal();return}
if(!row.fields.date){const chosen=await askExtractDate();if(!chosen)return;await api('/api/catalog/edit',{id:row.id,fields:{...row.fields,date:chosen}});await refreshCatalog()}
const loaded=await api('/api/catalog/load',{id:row.id});if(loaded.needs_date)throw Error('Informe a data do extrato em Revisar.');const p=loaded.params;window.catalogContext={id:row.id,sources:p.sources,date:loaded.record.fields.date};for(const field of fields){if(field==='sources')$('sources').value=p.sources.length===1?p.sources[0]:'all';else $(field).value=p[field]||''}
showScreen('busca');periodHint();if(window.setJournalDate)window.setJournalDate(loaded.record.fields.date);
$('activeExtract').classList.remove('hidden');$('activeExtract').textContent=`Localizando: ${row.fields.title} · ${row.fields.process}. Confira quais páginas correspondem a este ato; ao baixar, a seleção ficará vinculada à tabela. ${row.fields.date?'':'Extrato sem data: confira o período antes de pesquisar. '}Meios cadastrados no extrato: ${p.sources.map(k=>mediumNames[k]).join(', ')}.`;$('form').requestSubmit();$('activeExtract').scrollIntoView({behavior:'smooth',block:'start'});
}catch(e){$('catalogMessage').textContent=e.message}};
$('cancelEdit').onclick=()=>$('editExtract').close();
$('saveEdit').onclick=async()=>{try{await api('/api/catalog/edit',{id:editingId,fields:readFields($('editFields'))});$('editExtract').close();await refreshCatalog();const updated=catalogRows.find(r=>r.id===editingId);if(updated)openProcess(updated)}catch(e){$('editError').textContent=e.message}};
function clearCatalogContext(){window.catalogContext=null;$('activeExtract').classList.add('hidden')}
for(const key of ['act_type','process','tender','modality','esfinge','object'])$(key).addEventListener('input',clearCatalogContext);
$('example').addEventListener('click',clearCatalogContext);
$('exportBtn').addEventListener('click',()=>{window.catalogDownload=''});
refreshCatalog().catch(e=>$('catalogMessage').textContent=e.message);

document.head.insertAdjacentHTML('beforeend','<style>button.danger{color:#a32828;border-color:#d8aaaa}button.danger:hover{background:#fff0f0}</style>');
async function deleteCatalogRows(rows,wholeProcess=false){
if(busy||!rows.length)return;
const description=wholeProcess?'o processo '+(rows[0].fields.process||'não informado')+' e seus '+rows.length+' extrato(s)':'o extrato “'+rows[0].fields.title+'”';
if(!confirm('Excluir '+description+' do acervo? Os vínculos de publicação serão removidos. Os arquivos originais e PDFs já baixados serão mantidos.'))return;
setBusy(true);
try{const ids=rows.map(r=>r.id);await api('/api/catalog/delete',{ids});
if(window.catalogContext&&ids.includes(window.catalogContext.id))clearCatalogContext();
if(ids.includes(window.catalogDownload))window.catalogDownload='';
$('editExtract').close();$('processExtracts').close();await refreshCatalog();
const remaining=catalogRows.find(r=>processKey(r)===reviewingProcessKey);if(remaining)openProcess(remaining);
$('catalogMessage').textContent=ids.length+' extrato(s) excluído(s).';
}catch(e){alert('Não foi possível excluir: '+e.message)}finally{setBusy(false)}
}
$('deleteExtract').onclick=()=>deleteCatalogRows(catalogRows.filter(r=>r.id===editingId));
$('deleteProcess').onclick=()=>deleteCatalogRows(catalogRows.filter(r=>processKey(r)===reviewingProcessKey),true);

document.head.insertAdjacentHTML('beforeend',`<style>#processSearchForm label{display:block;border:0;padding:0;margin:16px 0 8px;cursor:default}#processSearchForm .process-search-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}#processSearchForm #processActSearch{flex:1 1 250px;width:100%;min-width:0;height:46px;margin:0;padding:10px 12px;box-sizing:border-box;font:inherit;border:1px solid var(--border);border-radius:8px}#processSearchForm button{height:46px;margin:0}</style>`);

function periodHint(){const days=(new Date($('end').value)-new Date($('start').value))/86400000;$('periodHelp').textContent=days>31&&($('sources').value==='all'||$('sources').value==='jornal'||window.catalogContext?.sources.includes('jornal'))?'Período amplo: a pesquisa no jornal pode ser parcial e demorada. Prefira o mês do extrato.':''}
$('start').addEventListener('change',periodHint);$('end').addEventListener('change',periodHint);periodHint();
try{const p=JSON.parse(localStorage.getItem('diario-fields')||'{}');if(typeof p.includePncp==='boolean')$('includePncp').checked=p.includePncp}catch{}

$('sources').addEventListener('change',periodHint);

document.body.insertAdjacentHTML('beforeend',`<dialog id="extractDateDialog"><h2>Qual é a data do extrato?</h2><p>Este extrato não tem data cadastrada. Informe a data para pesquisar de 5 dias antes até 5 dias depois. A data ficará salva no cadastro.</p><form id="extractDateForm"><label for="extractSearchDate">Data do extrato</label><input type="date" id="extractSearchDate" required><div class="dialog-actions"><button id="cancelExtractDate" type="button">Cancelar</button><button type="submit" class="primary">Salvar data e pesquisar</button></div></form></dialog>`);
function askExtractDate(){return new Promise(resolve=>{const dialog=$('extractDateDialog');$('extractSearchDate').value='';let chosen='';$('extractDateForm').onsubmit=e=>{e.preventDefault();if(!$('extractDateForm').reportValidity())return;chosen=$('extractSearchDate').value;dialog.close()};$('cancelExtractDate').onclick=()=>dialog.close();dialog.onclose=()=>resolve(chosen);dialog.showModal();$('extractSearchDate').focus()})}

