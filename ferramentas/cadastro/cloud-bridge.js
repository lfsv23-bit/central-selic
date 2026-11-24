(function(){
 const base='https://qjyppukemulithkkqzvy.supabase.co',key='sb_publishable_Gw4hZX0VpqtWEOlMZ_yZRg__tXj0FSt';
 const original=window.fetch.bind(window);
 let worker=null,nextRequest=0;const pending=new Map();
 function localSearch(query,offset){return new Promise((resolve,reject)=>{if(!worker){worker=new Worker('catmat-worker.js');worker.onmessage=e=>{const task=pending.get(e.data.id);if(!task)return;if(e.data.progress){const status=document.getElementById('manualStatus');if(status)status.textContent=e.data.progress;return}pending.delete(e.data.id);e.data.error?task.reject(Error(e.data.error)):task.resolve(e.data.result)};worker.onerror=()=>{for(const task of pending.values())task.reject(Error('Não foi possível processar a base CATMAT.'));pending.clear();worker.terminate();worker=null}}const id=++nextRequest;pending.set(id,{resolve,reject});worker.postMessage({id,q:query,offset})})}
 const clientPromise=import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm').then(m=>m.createClient(base,key));
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 async function session(){const client=await clientPromise;const {data,error}=await client.auth.getSession();if(error||!data.session?.access_token)throw Error('Entre na Central SELIC para acessar o Cadastro Assistido.');return {client,user:data.session.user,token:data.session.access_token}}
 async function readState(client,user){
  let {data,error}=await client.from('central_cadastro_workspace').select('revision,batches').eq('user_id',user.id).maybeSingle();
  if(error)throw Error('Não foi possível carregar os lotes online.');
  if(!data){const result=await client.from('central_cadastro_workspace').insert({user_id:user.id,revision:0,batches:[]}).select('revision,batches').maybeSingle();
   if(result.error){const again=await client.from('central_cadastro_workspace').select('revision,batches').eq('user_id',user.id).maybeSingle();if(again.error||!again.data)throw Error('Não foi possível iniciar os lotes online.');data=again.data}else data=result.data;}
  return {...data,csrf:'online'};
 }
 async function adapt(path,options={}){
  try{const {client,user,token}=await session();const method=(options.method||'GET').toUpperCase();
   if(path==='/api/state'&&method==='GET')return reply(await readState(client,user));
   if(path==='/api/state'&&method==='POST'){
    const body=JSON.parse(options.body);if(!Array.isArray(body.batches)||!Number.isSafeInteger(body.revision)||body.revision<0)return reply({error:'Dados inválidos.'},400);
    const next=body.revision+1;const {data,error}=await client.from('central_cadastro_workspace').update({batches:body.batches,revision:next,updated_at:new Date().toISOString()}).eq('user_id',user.id).eq('revision',body.revision).select('revision').maybeSingle();
    if(error)return reply({error:'Não foi possível salvar os lotes online.'},503);if(!data)return reply({error:'Outra janela atualizou o lote. Baixe o backup e recarregue antes de continuar.'},409);return reply({revision:data.revision});
   }
   if(path==='/api/upload'&&method==='POST'){
    const body=JSON.parse(options.body),match=typeof body.name==='string'&&body.name.match(/\.(docx?|txt)$/i);if(!match||typeof body.content!=='string')return reply({error:'Documento inválido.'},400);
    const binary=atob(body.content);if(binary.length>10485760)return reply({error:'Arquivo maior que 10 MB.'},413);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const name=user.id+'/'+digest+'.'+match[1].toLowerCase();const {error}=await client.storage.from('central-cadastro').upload(name,bytes,{contentType:'application/octet-stream',upsert:false});
    if(error&&String(error.statusCode)!=='409'&&error.status!==409)return reply({error:'Não foi possível salvar o documento no armazenamento privado.'},503);
    return reply({path:'storage://central-cadastro/'+name,hash:digest});
   }
   if(path.startsWith('/api/materials?')){const params=new URLSearchParams(path.split('?')[1]);return reply(await localSearch(params.get('q')||'',Number(params.get('offset')||0)))}
   return reply({error:'Operação não encontrada.'},404);
  }catch(error){return reply({error:error.message||'Não foi possível acessar o Cadastro Assistido.'},503)}
 }
 window.baixarDocumentoCadastro=async(path,name)=>{const {client,user}=await session();const prefix='storage://central-cadastro/';if(typeof path!=='string'||!path.startsWith(prefix+user.id+'/'))throw Error('Documento indisponível.');const {data,error}=await client.storage.from('central-cadastro').download(path.slice(prefix.length));if(error||!data)throw Error('Não foi possível baixar o documento.');const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=name||'documento';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)};
 window.fetch=(input,options)=>typeof input==='string'&&(input==='/api/state'||input==='/api/upload'||input.startsWith('/api/materials?'))?adapt(input,options):original(input,options);
})();
