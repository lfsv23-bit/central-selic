let inicializada=false;
export function iniciarFerramentas(){
 if(inicializada)return;inicializada=true;
 const nav=document.querySelector('aside nav');
 const ferramentas=[
  {nome:'Conferidor de Processos',url:'ferramentas/conferidor/index.html',descricao:'Cruze planilha JSON e relatórios TXT e exporte as tabelas.'},
  {nome:'Pendências do setor',url:'ferramentas/pendencias/index.html#consultas',descricao:'Consulte e compare os relatórios importados.'},
  {nome:'Busca de Diários',url:'ferramentas/diarios/index.html',descricao:'Pesquise publicações e mantenha seu acervo online.'},
  {nome:'Patrimônio',url:'https://patrimonio-setor-lfv.lfsv23.chatgpt.site/',descricao:'Abrir o sistema de Patrimônio em outra aba.'}
 ];
 const section=[...document.querySelectorAll('main .panel')].find(el=>el.querySelector('h2')?.textContent==='Ferramentas da Central');
 if(!section)return;
 section.innerHTML='<h2>Ferramentas de trabalho</h2><p>Conferidor e Pendências funcionam no navegador: os arquivos importados não são sincronizados entre computadores. Abra essas ferramentas somente em computadores confiáveis.</p><div id="ferramentas-links" class="task-actions"></div><p>Cadastro Assistido e Atualizações de Processos ainda precisam ser adaptados para a versão online.</p>';
 const links=document.getElementById('ferramentas-links');
 for(const ferramenta of ferramentas){
  const a=document.createElement('a');a.href=ferramenta.url;a.target='_blank';a.rel='noopener';a.textContent=ferramenta.nome;a.title=ferramenta.descricao;a.style.cssText='display:inline-block;padding:.7rem 1rem;border:1px solid #bfd0d6;border-radius:8px;text-decoration:none;color:#153044';
  links.append(a);
  const menu=a.cloneNode(true);menu.removeAttribute('style');nav.append(menu);
 }
}

