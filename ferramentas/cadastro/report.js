// Read-only report over the current in-memory batch, including unsaved edits.
(()=>{
 const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
 const open=make('button','','Visualizar relatório');open.id='viewReport';
 const actions=make('div','report-launch');$('export').before(actions);actions.append(open,$('export'));
 const dialog=make('dialog','report-dialog');dialog.id='batchReport';dialog.setAttribute('aria-labelledby','reportTitle');
 const head=make('div','report-head');const heading=make('div');heading.append(make('p','eyebrow','RELATÓRIO DO LOTE'));const title=make('h2','','');title.id='reportTitle';heading.append(title);
 const close=make('button','secondary','Fechar relatório');close.onclick=()=>dialog.close();head.append(heading,close);
 const stats=make('p','report-stats');const controls=make('div','report-controls');const search=make('input');search.type='search';search.placeholder='Buscar item, descrição ou código';search.setAttribute('aria-label','Buscar no relatório');
 const all=make('button','','Copiar relatório completo');const live=make('p','report-live');live.setAttribute('role','status');
 const print=make('button','secondary','Imprimir relatório');print.type='button';print.id='printReport';
 controls.append(search,all,print);const cards=make('div','report-cards');const intro=make('p','muted','Sugestões para conferência. Pendências não resolvidas acompanham as fichas copiadas. Base CATMAT: extração de 30/09/2026. A impressão inclui os itens exibidos; limpe a busca para imprimir o lote completo.');
 dialog.append(head,stats,controls,live,intro,cards);document.body.append(dialog);
 let rows=[],loteName='';
 async function copyReport(text){try{await navigator.clipboard.writeText(text);live.textContent='Copiado para a área de transferência.'}catch{live.textContent='Cópia automática indisponível. Selecione o texto abaixo e use Ctrl+C.';const fallback=make('textarea');fallback.value=text;fallback.setAttribute('aria-label','Texto para copiar manualmente');live.append(fallback);fallback.focus();fallback.select()}}
 function button(label,text){const b=make('button','secondary',label);b.onclick=()=>copyReport(text);return b}
 function field(label,value,wide=false){const box=make('div','report-field'+(wide?' wide':''));const top=make('div','report-field-head');top.append(make('span','',label));if(value)top.append(button('Copiar '+label.toLowerCase(),String(value)));box.append(top,make('div','report-value',value||'Não informado'));return box}
 function draw(){cards.replaceChildren();let shown=0;const q=norm(search.value);rows.forEach((it,i)=>{if(q&&!norm(ficha(it)).includes(q))return;shown++;const card=make('article','report-card');const top=make('div','report-card-head');const names=make('div');names.append(make('p','eyebrow','ITEM '+String(i+1).padStart(2,'0')),make('h3','',it.nome||'Item sem nome'),make('p','muted',it.documento||'Cadastro manual'));top.append(names,make('span','badge'+(it.revisado?' done':''),it.revisado?'Conferido por você':'Revisão pendente'));card.append(top);
 const grid=make('div','report-grid');grid.append(field('Nome',it.nome,true),field('Unidade',it.unidade),field('Tipo',it.tipo),field('Definição',it.definicao),field('Grupo interno',it.classificacao?.grupoInterno),field('Subgrupo interno',it.classificacao?.subgrupoInterno),field('Entrada',it.entrada),field('Saída',it.saida),field('Detalhamento',it.descricao,true),field('Justificativa',it.justificativa,true));card.append(grid);
 if(it.classificacao)card.append(make('p','muted',`CATMAT: ${it.classificacao.nome} · Grupo ${it.classificacao.grupo} · Classe ${it.classificacao.classe} — ${it.classificacao.nomeClasse}`));
 if(it.motivo){const analysis=make('details');analysis.append(make('summary','','Motivo da classificação'),make('p','report-value',it.motivo));card.append(analysis)}
 const pend=warnings(it);if(pend.length){const warning=make('div','notice');warning.append(make('strong','','Pendências para conferência'),make('p','report-value',pend.join('\n')));card.append(warning)}
 if(it.pendenciasResolvidas&&it.pendencias)card.append(make('p','muted','Pendências específicas marcadas como resolvidas por você.'));
 const bottom=make('div','report-card-actions');bottom.append(button('Copiar ficha completa',ficha(it)));card.append(bottom);cards.append(card)});
 stats.textContent=`${rows.length} itens no lote · ${rows.filter(it=>it.revisado).length} conferidos · ${rows.filter(it=>!it.revisado).length} aguardando revisão${q?' · '+shown+' encontrados':''}`;
 if(!shown)cards.append(make('p','report-empty',rows.length?'Nenhum item corresponde à busca.':'Este lote ainda não tem fichas. Importe os documentos e solicite a análise.'));
 }
 open.onclick=()=>{loteName=batch()?.name||'Lote atual';rows=structuredClone(state.items);title.textContent=loteName;search.value='';live.textContent='';draw();dialog.showModal();close.focus()};
 search.oninput=draw;all.onclick=()=>{if(!rows.length){live.textContent='Não há fichas para copiar.';return}copyReport(loteName+'\n\n'+rows.map((it,i)=>'ITEM '+(i+1)+'\n'+ficha(it)).join('\n\n--------------------\n\n'))};
 function clearPrint(){document.getElementById('reportPrintArea')?.remove();document.body.classList.remove('printing-report')}
 window.addEventListener('afterprint',clearPrint);
 print.onclick=()=>{
   if(!cards.querySelector('.report-card')){live.textContent='Não há itens exibidos para imprimir.';return}
   clearPrint();
   const paper=make('section');paper.id='reportPrintArea';
   paper.append(make('h1','',loteName),make('p','',stats.textContent),make('p','','CATMAT: extração de 30/09/2026. Sugestões sujeitas à conferência.'));
   if(search.value.trim())paper.append(make('p','','Filtro aplicado: '+search.value.trim()));
   const content=cards.cloneNode(true);
   content.querySelectorAll('button').forEach(b=>b.remove());
   content.querySelectorAll('details').forEach(d=>{d.open=true});
   paper.append(content);document.body.append(paper);document.body.classList.add('printing-report');
   try{window.print()}catch{clearPrint();live.textContent='Não foi possível abrir a impressão. Tente novamente.'}
 };
 dialog.addEventListener('close',()=>open.focus());
})();
