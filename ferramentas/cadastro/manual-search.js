'use strict';
(() => {
  const panel=document.createElement('section');panel.className='panel';
  panel.innerHTML=`<h2>Pesquisar item pelo nome</h2><p>Consulte os itens CATMAT sem importar um documento. Abra um resultado para ver e copiar os dados.</p><form id="manualSearchForm" class="search-row"><input id="manualQuery" aria-label="Nome ou código CATMAT do item" placeholder="Ex.: polpa de fruta congelada acerola" maxlength="200" required minlength="2"><button id="manualSubmit">Pesquisar item</button></form><p id="manualStatus" role="status"></p><div id="manualResults"></div><div id="manualPages" class="actions"></div>`;
  document.querySelector('.heading').after(panel);
  let currentQuery='',busy=false;
  function line(parent,label,value){const p=document.createElement('p');const b=document.createElement('strong');b.textContent=label+': ';p.append(b,document.createTextNode(value||'Não informado na base'));parent.append(p)}
  function asItem(r){return blank({nome:r.nomePdm,descricao:r.descricaoItem,unidade:'',documento:'Consulta manual CATMAT '+r.codigoItem,fonte:r.descricaoItem,classificacao:{grupo:r.codigoGrupo,classe:r.codigoClasse,pdm:r.codigoPdm,nome:r.nomePdm,nomeGrupo:r.nomeGrupo,nomeClasse:r.nomeClasse,grupoInterno:'2'+r.codigoGrupo,subgrupoInterno:'0'+r.codigoClasse.slice(2)},motivo:'Item CATMAT '+r.codigoItem+' consultado na extração de 30/09/2026. Conferir se a especificação corresponde ao produto desejado.',pendencias:'Informar unidade de fornecimento e finalidade de uso. Confirmar Consumo ou Bem Patrimonial e selecionar PCASP de entrada e saída. Esses campos não são definidos apenas pelo nome do produto.',pendenciasResolvidas:false,id:crypto.randomUUID()})}
  async function run(offset=0){
    if(busy)return;busy=true;$('manualSubmit').disabled=true;$('manualStatus').textContent='Consultando a base CATMAT…';$('manualResults').replaceChildren();$('manualPages').replaceChildren();
    try{
      const response=await fetch('/api/materials?q='+encodeURIComponent(currentQuery)+'&offset='+offset);if(!response.ok)throw Error('Não foi possível consultar a base. Tente novamente.');const data=await response.json();
      $('manualStatus').textContent=data.total?`${data.total_real>data.total?"Mais de ":""}${data.total} resultados · exibindo ${offset+1} a ${offset+data.items.length} · base de ${data.base}. Abra a descrição para escolher a variante correta.`:'Nenhum resultado. Tente palavras mais gerais, como “polpa acerola”.';
      for(const r of data.items){
        const detail=document.createElement('details');detail.style.cssText='margin:12px 0;padding:16px;border:1px solid #d9e2e5;border-radius:10px';
        const summary=document.createElement('summary');summary.textContent=`${r.nomePdm} · CATMAT ${r.codigoItem}`;detail.append(summary);
        line(detail,'Descrição completa',r.descricaoItem);line(detail,'Grupo interno','2'+r.codigoGrupo);line(detail,'Subgrupo interno','0'+r.codigoClasse.slice(2));line(detail,'Grupo CATMAT',r.codigoGrupo+' — '+r.nomeGrupo);line(detail,'Classe CATMAT',r.codigoClasse+' — '+r.nomeClasse);line(detail,'PDM',r.codigoPdm+' — '+r.nomePdm);line(detail,'Atualização do item',r.dataHoraAtualizacao);line(detail,'NCM',r.codigo_ncm?r.codigo_ncm+' — '+r.descricao_ncm:'');line(detail,'Item sustentável',r.itemSustentavel==='True'?'Sim':'Não');line(detail,'Unidade de fornecimento','Não consta nesta extração; confirmar');line(detail,'Definição e PCASP','Dependem da finalidade e do enquadramento. A confirmar.');
        const buttons=document.createElement('div');buttons.className='actions';buttons.style.flexWrap='wrap';
        for(const [label,value] of [['Copiar descrição',r.descricaoItem],['Copiar todos os dados',detail.innerText]]){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.onclick=()=>copy(value||detail.textContent);buttons.append(b)}
        const add=document.createElement('button');add.type='button';add.textContent='Adicionar ao lote atual';add.onclick=()=>{if(!batch()||conflict){toast('Carregue um lote sem conflito antes de adicionar.');return}state.items.push(asItem(r));state.index=state.items.length-1;render();save();toast('Ficha adicionada para completar e revisar.');};buttons.append(add);detail.append(buttons);$('manualResults').append(detail);
      }
      for(const [label,next] of [['Anterior',offset-20],['Próxima',offset+20]]){if(next<0||next>=data.total)continue;const b=document.createElement('button');b.className='secondary';b.textContent=label;b.onclick=()=>run(next);$('manualPages').append(b)}
    }catch(e){$('manualStatus').textContent=e.message}finally{busy=false;$('manualSubmit').disabled=false}
  }
  $('manualSearchForm').onsubmit=e=>{e.preventDefault();currentQuery=$('manualQuery').value.trim();run()};
})();
