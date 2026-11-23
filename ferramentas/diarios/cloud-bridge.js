(function(){
 const host='https://central-selic-teste.onrender.com';
 const base='https://qjyppukemulithkkqzvy.supabase.co';
 const key='sb_publishable_Gw4hZX0VpqtWEOlMZ_yZRg__tXj0FSt';
 const original=window.fetch.bind(window);
 const auth=import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm').then(m=>m.createClient(base,key));
 async function token(){const client=await auth;const {data,error}=await client.auth.getSession();if(error||!data.session?.access_token)throw Error('Entre na Central para acessar esta ferramenta.');return data.session.access_token}
 async function secure(path,options={}){
  if(typeof path!=='string'||(!path.startsWith('/api/')&&!path.startsWith('/download/')))throw Error('Endereço não permitido.');
  const headers=new Headers(options.headers||{});headers.set('Authorization','Bearer '+await token());
  return original(host+path,{...options,headers});
 }
 window.fetch=function(input,options){return typeof input==='string'&&(input.startsWith('/api/')||input.startsWith('/download/'))?secure(input,options):original(input,options)};
 window.centralSecureFetch=secure;
 document.addEventListener('click',async event=>{
  const link=event.target.closest?.('a[href]');if(!link)return;
  const path=link.getAttribute('href');if(!path||(!path.startsWith('/download/')&&!path.startsWith('/api/journal/pdf/')))return;
  event.preventDefault();
  const popup=link.target==='_blank'?window.open('','_blank'):null;
  try{const response=await secure(path);if(!response.ok)throw Error('Arquivo indisponível.');const blob=await response.blob();const url=URL.createObjectURL(blob);
   if(popup){popup.opener=null;popup.location.href=url}else{const a=document.createElement('a');a.href=url;a.download=blob.type==='application/pdf'?'documento.pdf':'documentos.zip';a.click()}
   setTimeout(()=>URL.revokeObjectURL(url),120000);
  }catch(err){if(popup)popup.close();alert(err.message||'Não foi possível abrir o arquivo.')}
 },true);
 token().catch(()=>{document.body.innerHTML='<main style="font:16px system-ui;padding:2rem"><h1>Entre na Central</h1><p>Para acessar a Busca de Diários, entre na sua conta.</p><a href="../../">Abrir Central SELIC</a></main>'});
})();
