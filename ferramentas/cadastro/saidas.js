'use strict';
(() => {
  let options=[];
  const list=document.createElement('datalist');list.id='exitAccounts';
  const hint=document.createElement('small');hint.id='exitAccountName';hint.setAttribute('role','status');
  $('exit').after(list,hint);
  const special=()=>item()?.entrada.trim()==='115610100';
  function refreshExit(){
    if(!item())return;
    const enabled=special();$('same').disabled=enabled;$('exit').readOnly=enabled?false:!!item().mesmaSaida;
    if(enabled){$('same').checked=false;$('exit').setAttribute('list','exitAccounts');$('exit').placeholder='Escolha a natureza de saída';}
    else{$('exit').removeAttribute('list');$('exit').placeholder='Código de saída';}
    hint.textContent=enabled?(options.find(x=>x[0]===item().saida)?.[1]||'Material de consumo exige saída específica. Escolha conforme o item e a destinação; não repita 115610100.') : '';
  }
  const prevRender=render;render=function(){prevRender();refreshExit()};
  // Executa antes do manipulador original para que uma mudança na entrada não copie o código.
  $('entry').addEventListener('input',()=>{if(!item())return;if($('entry').value.trim()==='115610100'){item().mesmaSaida=false;$('same').checked=false;}},true);
  ['entry','exit','definition'].forEach(id=>$(id).addEventListener('input',()=>{if(special())item().mesmaSaida=false;refreshExit()}));
  const prevWarnings=warnings;warnings=function(it){const result=prevWarnings(it);if(it.entrada?.trim()==='115610100'&&(!it.saida||it.saida==='115610100'||it.mesmaSaida))result.push('Revisar saída: Material de consumo exige natureza específica, sem repetir a entrada.');return result};
  const prevReviewed=$('reviewed').onchange;$('reviewed').onchange=()=>{if($('reviewed').checked&&special()&&(!options.some(x=>x[0]===item().saida)||item().mesmaSaida)){$('reviewed').checked=false;toast('Selecione uma saída válida para Material de consumo.');return}prevReviewed()};
  $('exit').addEventListener('input',()=>{if(special())item().mesmaSaida=false},true);
  fetch('saidas-consumo.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{options=data.opcoes;for(const [code,label] of options){const o=document.createElement('option');o.value=code;o.label=label;list.append(o)}refreshExit()}).catch(()=>{hint.textContent='Não foi possível carregar as saídas. Recarregue a página.'});
})();
