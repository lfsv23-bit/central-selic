globalThis.ReportRequest={build(mode,start,end,selected="10265"){
 const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(new Date(s+'T12:00:00Z').valueOf())&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
 if(!valid(start)||!valid(end)||start>end)throw Error('Informe datas válidas, com a data inicial anterior ou igual à final.');
 if(!['pending','sector','both'].includes(mode))throw Error('Escolha o relatório desejado.');
 const sectors=SectorCatalog.ids(selected).map(id=>SectorCatalog.find(id));
 if(!sectors.length)throw Error('Marque pelo menos um setor para preparar o pedido.');
 if(sectors.some(s=>!s))throw Error('Selecione um setor disponível.');
 const scope=sectors.map(s=>s.name+' ('+s.id+')').join('\n');
 const date=s=>s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4);
 let text=`Consulte o Protocolo WEB em http://172.16.0.25:8078/sse_protocolo/, usando minha sessão autenticada.\n\nSetores solicitados:\n${scope}\nExcluir sempre 10262 - GERAL - ARQUIVO DE FINALIZADOS.\nPeríodo: ${date(start)} a ${date(end)}, incluindo as duas datas, pela data da tramitação e considerando todos os exercícios.\n\n`;
 if(mode!=='sector')text+='Gere um TXT de pendências: processos tramitados para o setor que ainda não foram recebidos, consultando Meus Protocolos e filtrando pela data da tramitação.\n';
 if(mode!=='pending')text+='Gere um TXT de processos no setor: consulte Trâmites com Setor atual e Último Trâmite, no período informado. Use o formato Lista de Protocolos / Processos Encontrados compatível com nosso painel.\n';
 text+='\nConsulte cada setor listado separadamente e reúna os resultados em TXT consolidados, mantendo um bloco por setor com cabeçalho, período e total próprios. Faça uma consulta atualizada, leia todos os registros e páginas, confira os totais e disponibilize '+(mode==='both'?'os dois arquivos TXT separados':'o arquivo TXT')+' para baixar e importar no nosso painel. Use os formatos já utilizados nesta conversa. Não registre recebimentos, devoluções ou tramitações.';
 return text;
}};

