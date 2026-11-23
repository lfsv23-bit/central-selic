const tableDefinitions = [
  {id:'activeTable', tab:'ativos', name:'Processos da Planilha', rows:aoaFromActive},
  {id:'systemTable', tab:'sistema', name:'Somente Sistema', rows:aoaSystem},
  {id:'linksTable', tab:'vinculos', name:'Vínculos Indiretos', rows:aoaLinks},
  {id:'divTable', tab:'divergencias', name:'Divergências', rows:aoaDiv},
  {id:'dupTable', tab:'duplicados', name:'Duplicidades JSON', rows:aoaDup},
  {id:'reportsTable', tab:'relatorios', name:'Relatórios SCPI', rows:aoaReports}
];
const improvementsStyle=document.createElement('style');
improvementsStyle.textContent=`
  .metric-go{display:block;width:100%;text-align:left;background:transparent;padding:0;color:inherit;font:inherit;border-radius:4px}
  .metric-go:hover .label{text-decoration:underline;color:var(--primary2)}
  .metric .metric-tip{pointer-events:none}
  .metric-go small::after{content:' · Ver tabela';color:var(--primary2)}
  .table-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}
  .table-count{margin-right:auto;font-size:13px;font-weight:600;color:var(--primary)}
  .tab-count{font-size:11px;opacity:.85;margin-left:5px}
`;
document.head.append(improvementsStyle);
const reportsTab=document.createElement('button');
reportsTab.className='tab'; reportsTab.dataset.tab='relatorios'; reportsTab.textContent='Relatórios SCPI-PROTOCOLO';
document.querySelector('#tablesScreen .tabs').append(reportsTab);
const reportsPanel=document.createElement('section');
reportsPanel.id='relatorios'; reportsPanel.className='panel';
reportsPanel.innerHTML='<div class="card"><h2>Todos os protocolos dos relatórios SCPI-PROTOCOLO</h2><p id="reportsFilesCount" class="muted"></p><div id="reportsTable" class="table-wrap"></div></div>';
document.getElementById('tablesScreen').append(reportsPanel);
reportsTab.addEventListener('click',()=>selectTable('relatorios'));

function selectTable(tab){
  document.querySelector('.navbtn[data-screen="tablesScreen"]').click();
  document.querySelectorAll('#tablesScreen .tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.querySelectorAll('#tablesScreen .panel').forEach(p=>p.classList.toggle('active',p.id===tab));
}
document.getElementById('summary').addEventListener('click',e=>{
  const button=e.target.closest('[data-metric]'); if(!button)return;
  const targets=['ativos','relatorios','ativos','ativos','vinculos','divergencias','sistema','duplicados'];
  const index=Number(button.dataset.metric),tab=targets[index];
  if(tab==='ativos'){
    document.getElementById('activeSearch').value='';
    document.getElementById('activeFilter').value=index===2?'localizados':index===3?'Não localizado':'';
    filterActive();
  }
  if(tab==='sistema'){document.getElementById('systemSearch').value='';filterSystem();}
  selectTable(tab);
  document.getElementById(tab).scrollIntoView({behavior:'smooth',block:'start'});
});

function aoaReports(){
  return [['Protocolo','Relatório SCPI-PROTOCOLO / Setor','Arquivo','Data','Descrição','Processos citados'],
    ...state.analysis.txt.map(r=>[displayProcess(r.key),r.source,r.filename,r.date,r.description,r.refs.map(displayProcess).join(', ')])];
}
function renderReports(){
  const rows=state.analysis.txt.map(r=>`<tr><td>${escapeHtml(displayProcess(r.key))}</td><td>${escapeHtml(r.source)}</td><td>${escapeHtml(r.filename)}</td><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.description.slice(0,900))}</td><td>${escapeHtml(r.refs.map(displayProcess).join(', '))}</td></tr>`);
  document.getElementById('reportsTable').innerHTML=tableHtml(aoaReports()[0],rows);
  document.getElementById('reportsFilesCount').textContent=`${state.txtFiles.length} relatório(s) importado(s) · ${rows.length} protocolo(s) lido(s)`;
}

tableDefinitions.forEach(def=>{
  const actions=document.createElement('div'); actions.className='table-actions';
  actions.innerHTML=`<span class="table-count" id="${def.id}Count" role="status" aria-live="polite">0 itens</span><button class="secondary" data-export-table="${def.id}" data-format="xls" disabled>Exportar tabela — XLS</button><button class="secondary" data-export-table="${def.id}" data-format="xlsx" disabled>Exportar tabela — XLSX</button>`;
  document.getElementById(def.id).before(actions);
  const tab=document.querySelector(`[data-tab="${def.tab}"]`);
  const badge=document.createElement('span');badge.className='tab-count';badge.id=`${def.id}TabCount`;badge.textContent='(0)';tab.append(badge);
});
function updateTableCounts(){
  tableDefinitions.forEach(def=>{
    const rows=[...document.querySelectorAll(`#${def.id} tbody tr`)];
    const visible=rows.filter(r=>r.style.display!=='none').length,total=rows.length;
    const filtered=def.id==='activeTable'&&(document.getElementById('activeSearch').value.trim()||document.getElementById('activeFilter').value)||def.id==='systemTable'&&document.getElementById('systemSearch').value.trim();
    let label=filtered?`${visible} de ${total} itens (filtro aplicado)`:`${total} ${total===1?'item':'itens'}`;
    if(def.id==='dupTable'&&state.analysis)label+=` · ${state.analysis.duplicates.length} número(s) duplicado(s)`;
    document.getElementById(`${def.id}Count`).textContent=label;
    document.getElementById(`${def.id}TabCount`).textContent=`(${total})`;
    document.querySelectorAll(`[data-export-table="${def.id}"]`).forEach(b=>b.disabled=!state.analysis);
  });
  document.getElementById('exportXlsBtn').disabled=!state.analysis;
}
const previousRenderAll=renderAll;
renderAll=function(){previousRenderAll();renderReports();updateTableCounts();};
const previousFilterActive=filterActive;
filterActive=function(){previousFilterActive();updateTableCounts();};
const previousFilterSystem=filterSystem;
filterSystem=function(){previousFilterSystem();updateTableCounts();};
// Existing input listeners hold the original functions; update counts after them.
document.getElementById('activeSearch').addEventListener('input',updateTableCounts);
document.getElementById('activeFilter').addEventListener('change',updateTableCounts);
document.getElementById('systemSearch').addEventListener('input',updateTableCounts);
document.getElementById('clearBtn').addEventListener('click',()=>{
  document.getElementById('reportsTable').innerHTML='';document.getElementById('reportsFilesCount').textContent='';updateTableCounts();
});

function writeWorkbook(wb,name,format){
  if(format==='xls'&&wb.SheetNames.some(n=>{
    const sheet=wb.Sheets[n];return sheet['!ref']&&XLSX.utils.decode_range(sheet['!ref']).e.r>=65536;
  })) {alert('O formato XLS aceita até 65.536 linhas por aba. Use XLSX para exportar esta tabela inteira.');return;}
  try {XLSX.writeFile(wb,`${name}.${format}`,{bookType:format==='xls'?'biff8':'xlsx'});}
  catch(error){alert('Não foi possível exportar: '+error.message);}
}
document.getElementById('exportXlsBtn').addEventListener('click',()=>exportAll('xls'));
document.getElementById('tablesScreen').addEventListener('click',e=>{
  const button=e.target.closest('[data-export-table]');if(!button||!state.analysis)return;
  if(typeof XLSX==='undefined'){alert('A biblioteca de exportação não foi carregada. Verifique a conexão com a internet e reabra o sistema.');return;}
  const def=tableDefinitions.find(d=>d.id===button.dataset.exportTable),data=def.rows();
  const rows=[...document.querySelectorAll(`#${def.id} tbody tr`)];
  const filtered=[data[0],...data.slice(1).filter((_,i)=>rows[i]?.style.display!=='none')];
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(filtered);
  setWidths(ws,filtered[0].map((_,i)=>i===0?20:35));ws['!autofilter']={ref:ws['!ref']};
  XLSX.utils.book_append_sheet(wb,ws,def.name);
  const date=new Date(),stamp=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  writeWorkbook(wb,`Conferencia_${def.tab}_${stamp}`,button.dataset.format);
});
updateTableCounts();

