import https_client
"""Consulta pública do PNCP; resultados são páginas de contratação, não PDFs."""
import json,re,unicodedata,urllib.request,urllib.parse,urllib.error,time,threading
REQUEST_LOCK=threading.Lock()
LAST_REQUEST=0.0
from datetime import date,timedelta

def norm(value):
    return ''.join(c for c in unicodedata.normalize('NFKD',str(value or '').lower()) if not unicodedata.combining(c))

def number(value):
    m=re.fullmatch(r'\s*([\d.]+)\s*/\s*(\d{4}|\d{2})\s*',str(value or ''))
    return str(int(m[1].replace('.','')))+'/'+('20'+m[2] if len(m[2])==2 else m[2]) if m else ''

def fetch(url):
    global LAST_REQUEST
    with REQUEST_LOCK:
        time.sleep(max(0,1.0-(time.monotonic()-LAST_REQUEST)))
        try:
            with https_client.urlopen(urllib.request.Request(url,headers={'User-Agent':'BuscaDiario/1.0'}),timeout=25) as response:
                raw=response.read()
        finally:LAST_REQUEST=time.monotonic()
    return json.loads(raw) if raw else {'data':[],'totalPaginas':0}

def match(item,params):
    if params.get('esfinge'):
        text=norm(str(item.get('objetoCompra') or '')+' '+str(item.get('informacaoComplementar') or ''))
        return 'Código e-Sfinge' if re.search(r'(?<![a-z0-9])'+re.escape(norm(params['esfinge']))+r'(?![a-z0-9])',text) else ''
    process=number(item.get('processo'))
    if params.get('process'):
        return 'Número do processo' if process==number(params['process']) else ''
    tender=str(item.get('numeroCompra') or '')
    if '/' not in tender:tender+='/'+str(item.get('anoCompra') or '')
    modes={'pregao':6,'concorrencia':4,'dispensa':8,'credenciamento':12}
    if params.get('tender') and number(tender)==number(params['tender']) and (params.get('modality') not in modes or item.get('modalidadeId')==modes[params['modality']]):return 'Número e modalidade da licitação'
    text=norm(str(item.get('objetoCompra') or '')+' '+str(item.get('informacaoComplementar') or ''))
    if params.get('esfinge') and norm(params['esfinge']) in text:return 'Código e-Sfinge'
    if params.get('object') and norm(params['object']) in text:return 'Descrição do objeto · conferir'
    return ''

def search(params,progress,request=fetch):
    start=date.fromisoformat(params['start']);end=date.fromisoformat(params['end']);rows={};notes=[];calls=0;deadline=time.monotonic()+60
    modes={'pregao':[6],'concorrencia':[4],'dispensa':[8],'credenciamento':[12]}
    codes=list(range(1,15)) if params.get('process') else modes.get(params.get('modality'),list(range(1,15)))
    preferred=modes.get(params.get('modality'),[])
    codes=list(dict.fromkeys(preferred+codes))
    while start<=end:
        stop=min(start+timedelta(days=364),end)
        for mode in codes:
            page=1
            while True:
                if time.monotonic()>deadline:return list(rows.values()),notes+['PNCP: consulta parcial após 60 segundos; reduza o período para continuar.']
                calls+=1
                if calls>80:return list(rows.values()),notes+['PNCP: limite de 80 consultas atingido; reduza o período. Consulta parcial.']
                progress('Consultando PNCP · Corumbá…')
                query=urllib.parse.urlencode(dict(dataInicial=start.strftime('%Y%m%d'),dataFinal=stop.strftime('%Y%m%d'),codigoModalidadeContratacao=mode,uf='MS',codigoMunicipioIbge='5003207',pagina=page,tamanhoPagina=50))
                try:data=request('https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?'+query)
                except urllib.error.HTTPError as exc:
                    if exc.code==429:return list(rows.values()),notes+['PNCP limitou as consultas. Resultado parcial; aguarde e tente novamente.']
                    notes.append('PNCP: consulta parcial, falha na modalidade '+str(mode)+': '+str(exc));break
                except Exception as exc:
                    notes.append('PNCP: consulta parcial, falha na modalidade '+str(mode)+': '+str(exc));break
                for item in data.get('data',[]):
                    unit=item.get('unidadeOrgao') or {};org=item.get('orgaoEntidade') or {}
                    if str(unit.get('codigoIbge'))!='5003207' or org.get('esferaId')!='M':continue
                    reason=match(item,params)
                    if not reason:continue
                    cnpj=str(org.get('cnpj',''));year=str(item.get('anoCompra',''));seq=str(item.get('sequencialCompra',''))
                    if not (re.fullmatch(r'\d{14}',cnpj) and year.isdigit() and seq.isdigit()):continue
                    url=f'https://pncp.gov.br/app/editais/{cnpj}/{year}/{int(seq)}'
                    rows[url]=dict(url=url,control=item.get('numeroControlePNCP',''),process=item.get('processo',''),title=str(item.get('modalidadeNome',''))+' '+str(item.get('numeroCompra','')),object=item.get('objetoCompra',''),date=str(item.get('dataPublicacaoPncp',''))[:10],reason=reason,organization=org.get('razaoSocial',''),situation=item.get('situacaoCompraNome',''))
                if page>=int(data.get('totalPaginas') or 0):break
                page+=1
            if rows and params.get('process'):break
        start=stop+timedelta(days=1)
    if params.get('esfinge') and not rows:notes.append('PNCP: nenhum cadastro com o e-Sfinge informado no objeto ou informações complementares. O portal pode não informar esse código; para buscar pelos demais dados, limpe o campo e-Sfinge.')
    return list(rows.values()),notes
