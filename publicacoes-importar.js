const categorias=new Set(['extratoWord','domPdf','doePdf','jornalPdf','douPdf']);
function dataValida(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return false;const d=new Date(v+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v}
async function idEstavel(texto){const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(texto)));hash[6]=(hash[6]&15)|80;hash[8]=(hash[8]&63)|128;const h=Array.from(hash.slice(0,16),n=>n.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)}
export async function importarBackup({file,client,user,status}){
 if(file.size>100*1024*1024)throw Error('O backup ultrapassa o limite de 100 MB para importação.');
 status('Lendo e conferindo o backup…');
 const {default:JSZip}=await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
 let zip,publicacoes,arquivos,texto,assinatura;
 try{
  zip=await JSZip.loadAsync(file);
  if(!zip.file('publicacoes.json')||!zip.file('arquivos.json'))throw Error('incompleto');
  const conteudos=await Promise.all([zip.file('publicacoes.json').async('string'),zip.file('arquivos.json').async('string')]);
  if(conteudos[0].length+conteudos[1].length>150*1024*1024)throw Error('grande');
  [texto]=conteudos;publicacoes=JSON.parse(texto);arquivos=JSON.parse(conteudos[1]);assinatura=await idEstavel(user.id+'\n'+conteudos[0]+'\n'+conteudos[1]);
 }catch{throw Error('Backup inválido ou incompleto. Use o ZIP exportado pelo módulo antigo de Publicações.')}
 if(!Array.isArray(publicacoes)||!Array.isArray(arquivos))throw Error('O formato do backup não é reconhecido.');
 const arquivoPorId=new Map();for(const a of arquivos){if(a&&a.id!=null){const key=String(a.id);if(arquivoPorId.has(key))throw Error('O backup contém identificadores de arquivo duplicados.');arquivoPorId.set(key,a)}}
 const preparados=[];
 for(let i=0;i<publicacoes.length;i++){
  const p=publicacoes[i];
  if(!p||typeof p.titulo!=='string'||!p.titulo.trim()||p.titulo.trim().length>300||!dataValida(p.dataEnvio)||!Array.isArray(p.targets||[])||!p.files||typeof p.files!=='object'||Array.isArray(p.files))throw Error('A publicação '+(i+1)+' está incompleta ou tem data inválida; nada foi importado.');
  const destinos=p.targets||[];if(destinos.some(k=>!categorias.has(k)||k==='extratoWord'))throw Error('Há um destino desconhecido no backup; nada foi importado.');
  const anexos=[];
  for(const [kind,ref] of Object.entries(p.files)){if(!categorias.has(kind)||!ref?.id)continue;if(kind!=='extratoWord'&&!destinos.includes(kind))continue;const a=arquivoPorId.get(String(ref.id));if(!a||typeof a.base64!=='string')throw Error('Falta um anexo da publicação '+(i+1)+' no backup; nada foi importado.');if(a.base64.length>13981020)throw Error('Um anexo da publicação '+(i+1)+' ultrapassa 10 MB; nada foi importado.');try{const bin=atob(a.base64);const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));if(bytes.length>10485760)throw Error();anexos.push({kind,blob:new Blob([bytes],{type:a.mime||ref.type||'application/octet-stream'}),name:String(a.nome||ref.name||'arquivo'),type:String(a.mime||ref.type||'')})}catch{throw Error('Um anexo da publicação '+(i+1)+' é inválido ou excede 10 MB; nada foi importado.')}}
  preparados.push({id:await idEstavel(assinatura+'\n'+i),titulo:p.titulo.trim(),data_envio:p.dataEnvio,enviado_por:String(p.obs||''),descricao:String(p.descricao||''),destinos:[...new Set(destinos)],anexos});
 }
 if(!preparados.length){status('O backup não contém publicações.');return}
 if(!confirm('Importar '+preparados.length+' publicação(ões) e seus anexos? Os registros existentes serão mantidos.')){status('Importação cancelada.');return}
 let importados=0,ignorados=0;const bucket=client.storage.from('central-publicacoes');
 for(let i=0;i<preparados.length;i++){
  const p=preparados[i];status('Importando publicação '+(i+1)+' de '+preparados.length+'…');
  const exists=await client.from('central_publicacoes').select('id').eq('id',p.id).maybeSingle();
  if(exists.error)throw Error('Não foi possível verificar os registros. Já importados: '+importados+'. Tente novamente com o mesmo ZIP.');
  if(exists.data){ignorados++;continue}
  const files={};
  for(const a of p.anexos){const path=user.id+'/'+p.id+'/'+crypto.randomUUID();const upload=await bucket.upload(path,a.blob,{contentType:a.type||'application/octet-stream',upsert:false});if(upload.error)throw Error('Falha ao enviar anexos. Já importados: '+importados+'. Tente novamente com o mesmo ZIP.');files[a.kind]={path,name:a.name,type:a.type}}
  const row={id:p.id,titulo:p.titulo,data_envio:p.data_envio,enviado_por:p.enviado_por,descricao:p.descricao,destinos:p.destinos,arquivos:files};
  const result=await client.from('central_publicacoes').insert(row).select('id');
  if(result.error||!result.data?.length)throw Error('Falha ao salvar uma publicação. Já importados: '+importados+'. Tente novamente com o mesmo ZIP.');
  importados++;
 }
 status('Importação concluída: '+importados+' publicação(ões) adicionada(s), '+ignorados+' já existente(s).');
 return {importados,ignorados};
}

