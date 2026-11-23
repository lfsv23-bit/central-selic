import https_client
"""Aplicativo local de pesquisa no Diário Oficial de Corumbá. Python 3.10+."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import hashlib, html, io, json, re, threading, unicodedata, urllib.parse, urllib.request, uuid, zipfile, socket, gzip
import sources
import dou_browser
import pncp
import catalog
import acts

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'downloads'
BASE = 'https://do.corumba.ms.gov.br'
JOBS = {}
JOURNAL_EDITIONS = {}
LOCK = threading.Lock()
POOL = ThreadPoolExecutor(max_workers=1)
PNCP_POOL = ThreadPoolExecutor(max_workers=2)
MAX_PAGES = 50  # Limite por termo, explicitado quando atingido.

def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text.lower()) if not unicodedata.combining(c))

def number(value, field):
    value = str(value or '').strip()
    if not value: return ''
    if not re.fullmatch(r'[\d.]+\s*/\s*\d{4}', value):
        raise ValueError(f'{field}: use número/ano, por exemplo 37828/2023.')
    n, year = value.replace('.', '').replace(' ', '').split('/')
    return f'{int(n)}/{year}'

def validate(data):
    process = number(data.get('process'), 'Processo')
    tender = number(data.get('tender'), 'Pregão')
    esfinge = str(data.get('esfinge', '')).strip().strip('{}').upper()
    if esfinge and not re.fullmatch(r'[A-Z0-9-]{6,100}', esfinge):
        raise ValueError('O código e-Sfinge deve conter de 6 a 100 letras, números ou hífens.')
    obj = str(data.get('object', '')).strip()
    if len(obj) > 2000: raise ValueError('Resuma o objeto em até 2.000 caracteres.')
    if not any([process, tender, esfinge, obj]): raise ValueError('Preencha pelo menos um campo de busca.')
    start = str(data.get('start') or '2023-01-01')
    end = str(data.get('end') or date.today().isoformat())
    if date.fromisoformat(start) > date.fromisoformat(end): raise ValueError('A data inicial deve ser anterior à final.')
    modality=data.get('modality','pregao')
    if modality not in catalog.MODALITIES:raise ValueError('Modalidade inválida.')
    selected=data.get('sources',['corumba'])
    if not isinstance(selected,list) or not selected or any(s not in sources.NAMES for s in selected):raise ValueError('Selecione fontes válidas.')
    act_type=data.get('act_type','all')
    if act_type!='all' and act_type not in acts.TYPES:raise ValueError('Tipo de extrato inválido.')
    extract_date=str(data.get('extract_date') or '')
    if extract_date:extract_date=date.fromisoformat(extract_date).isoformat()
    return dict(extract_date=extract_date, process=process, tender=tender, esfinge=esfinge, object=obj, start=start, end=end, modality=modality, sources=selected,act_type=act_type)

def make_queries(params):
    if params['esfinge']:return ['"'+params['esfinge']+'"']
    queries = []
    if params['process']:
        n, year = params['process'].split('/')
        queries += [n, '"'+format(int(n), ',').replace(',', '.')+'"']
    if params['tender']:
        n, year = params['tender'].split('/')
        for num in dict.fromkeys([n, n.zfill(2), n.zfill(3)]):
            label=catalog.MODALITIES.get(params.get('modality','pregao'),'Licitação')
            abbr={'pregao':'PE','concorrencia':'CE'}.get(params.get('modality','pregao'),label)
            queries += [f'"{label} nº {num}/{year}"', f'"{abbr} {num}/{year}"']
    if params['esfinge']: queries.append('"'+params['esfinge']+'"')
    if params['object']: queries.append('"'+params['object'].replace('"', '')+'"')
    return list(dict.fromkeys(queries))

def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    for attempt in range(2):
        with https_client.urlopen(req, timeout=45) as response:
            expected=response.headers.get('Content-Length')
            data = response.read(80*1024*1024+1)
        if expected and len(data)<int(expected):
            if attempt==0:continue
            raise ValueError('Download interrompido pela fonte. Tente novamente.')
        break
    if len(data) > 80*1024*1024: raise ValueError('Arquivo excede o limite de 80 MB por edição.')
    if data.startswith(b'\x1f\x8b'):data=gzip.decompress(data)
    return data if binary else json.loads(data)

def pdf_data(row):
    if row.get('source') in ('jornal','uniao'):return sources.cached_pdf(row['url'],fetch)
    return fetch(row['url'],binary=True)

def query_diary(q, params):
    found, warnings = {}, []
    for page in range(MAX_PAGES):
        url = f'{BASE}/busca/busca/buscar/query/{page}/di:{params["start"]}/df:{params["end"]}/?q='+urllib.parse.quote(q)
        data = fetch(url).get('hits', {})
        total = data.get('total', 0)
        if isinstance(total, dict): total = total.get('value', 0)
        hits = data.get('hits', [])
        for hit in hits: found[hit['_id']] = hit
        if not hits or (page+1)*10 >= total: break
    else:
        warnings.append(f'Termo {q}: limite de {MAX_PAGES*10} resultados atingido. Reduza o período para completar a pesquisa.')
    return found, warnings

def pattern_number(value):
    n, year = value.split('/')
    # Aceita pontuação de milhar, espaços e zeros à esquerda; exige o ano.
    digits = r'[.\s]*'.join(re.escape(c) for c in n)
    year_pattern='(?:'+year+'|'+year[-2:]+')' if year.startswith('20') else year
    return r'(?<!\d)0*'+digits+r'\s*/\s*'+year_pattern+r'(?!\d)'

def classify(hit, params):
    source = hit['_source']
    text = re.sub(r'\s+', ' ', source.get('conteudo', '')).strip()
    norm = normalized(text)
    reasons, matches = [], []
    if params['process']:
        m = re.search(pattern_number(params['process']), norm)
        if m: reasons.append('Número do processo'); matches.append(m)
    if params['esfinge']:
        m = re.search(r'(?<![a-z0-9])'+r'\s*'.join(re.escape(c) for c in params['esfinge'].lower())+r'(?![a-z0-9])', norm)
        if m: reasons.append('Código e-Sfinge'); matches.append(m)
    if params['tender']:
        modal={'concorrencia':r'(?:concorrencia\s+eletronica|\bce)','pregao':r'(?:pregao(?:\s+publico)?\s+eletronico|\bpe)'}.get(params.get('modality'),re.escape(normalized(catalog.MODALITIES.get(params.get('modality','pregao'),'Pregão Eletrônico'))))
        m = re.search(modal+r'\s*(?:n[ºo°.]?\s*)?'+pattern_number(params['tender']), norm)
        if m: reasons.append({'concorrencia':'Número da concorrência','pregao':'Número do pregão'}.get(params.get('modality','pregao'),'Número da licitação')); matches.append(m)
    if params['object'] and normalized(params['object']) in norm: reasons.append('Descrição do objeto')
    strong = any(r in reasons for r in ['Número do processo', 'Código e-Sfinge', 'Número do pregão','Número da concorrência','Número da licitação'])
    if not reasons: reasons = ['Resultado aproximado do Diário']
    pos = matches[0].start() if matches else max(0, norm.find(normalized(params['object'])))
    snippet = text[max(0,pos-140):pos+650]
    if pos > 140: snippet = '…'+snippet
    if pos+650 < len(text): snippet += '…'
    patterns=[]
    if params['process']:patterns.append(pattern_number(params['process']))
    if params['esfinge']:patterns.append(r'\s*'.join(re.escape(c) for c in params['esfinge'].lower()))
    if not patterns and params['tender']:patterns.append(modal+r'\s*(?:n[ºo°.]?\s*)?'+pattern_number(params['tender']))
    if not patterns and params['object']:patterns.append(re.escape(normalized(params['object'])))
    act_types=acts.matched_types(text,patterns)
    return dict(id=hit['_id'], edition_id=int(source['diario_id']), source='corumba', source_name=sources.NAMES['corumba'], date=source['data'], page=int(source['pagina']),
                verification=('e-Sfinge localizado. Dados também encontrados: '+', '.join(r for r in reasons if r!='Código e-Sfinge') if len(reasons)>1 else 'e-Sfinge localizado; demais dados não confirmados no texto disponível. Confira o extrato.') if 'Código e-Sfinge' in reasons else '',
                act_types=act_types,
                edition=hit.get('suplemento', f"Diário {source['diario_id']}"), reasons=reasons,
                status='identificador' if strong else 'revisar', snippet=snippet, text=text,
                url=f"{BASE}/portal/edicoes/download/{int(source['diario_id'])}")

def update(job_id, **values):
    with LOCK: JOBS[job_id].update(values)

def run_search(job_id, params):
    try:
        pncp_future=PNCP_POOL.submit(pncp.search,params,lambda msg:None) if 'pncp' in params['sources'] else None
        all_hits, warnings = {}, []
        queries = make_queries(params) if 'corumba' in params['sources'] else []
        with ThreadPoolExecutor(max_workers=1) as executor:
            futures = {executor.submit(query_diary,q,params):q for q in queries}
            for done, future in enumerate(as_completed(futures),1):
                q = futures[future]
                try:
                    hits, notes = future.result(); all_hits.update(hits); warnings.extend(notes)
                except Exception as exc:
                    warnings.append(f'Não foi possível consultar {q}: {exc}. A pesquisa está incompleta.')
                update(job_id, message=f'Consultados {done} de {len(queries)} termos.', progress=round(done/len(queries)*100))
        results = []
        for hit in all_hits.values():
            try:
                row=classify(hit,params)
                if not params['esfinge'] or 'Código e-Sfinge' in row['reasons']:results.append(row)
            except (ValueError, KeyError, TypeError): warnings.append('Um resultado do Diário veio incompleto e não pôde ser incluído.')
        states=[]
        if 'corumba' in params['sources']:states.append(dict(source='corumba',name=sources.NAMES['corumba'],count=len(results),status='parcial' if warnings else 'consultado'))
        def publish():
            update(job_id,results=list(results),sources=list(states),warnings=list(dict.fromkeys(warnings)),queries=queries)
        publish()
        for src,search in [('estado',sources.search_state),('jornal',sources.search_journal)]:
            if src not in params['sources']:continue
            progress=lambda msg:update(job_id,message=msg,progress=50)
            try:
                rows,notes=search(params,results,fetch,classify,progress) if src=='jornal' else search(params,fetch,classify,progress)
                results.extend(rows);warnings.extend(notes)
                states.append(dict(source=src,name=sources.NAMES[src],count=len(rows),status='parcial' if notes else 'consultado'))
            except Exception as exc:
                warnings.append(f'{sources.NAMES[src]}: consulta indisponível: {exc}')
                states.append(dict(source=src,name=sources.NAMES[src],count=0,status='indisponível'))
            publish()
        if 'uniao' in params['sources']:
            rows,notes=dou_browser.search(params,fetch,classify,lambda msg:update(job_id,message=msg,progress=80))
            results.extend(rows);warnings.extend(notes)
            states.append(dict(source='uniao',name=sources.NAMES['uniao'],count=len(rows),status='parcial / consulta manual disponível' if notes else 'consultado',url=sources.dou_link(params)))
        pncp_rows=[]
        publish()
        if pncp_future:
            update(job_id,message='Diários disponíveis. Finalizando consulta ao PNCP…',progress=90)
            try:
                pncp_rows,notes=pncp_future.result()
                warnings.extend(notes)
                states.append(dict(source='pncp',name='PNCP',count=len(pncp_rows),status='parcial' if notes else 'consultado'))
            except Exception as exc:
                warnings.append('PNCP indisponível: '+str(exc)+'. Os resultados dos diários foram preservados.')
                states.append(dict(source='pncp',name='PNCP',count=0,status='indisponível'))
        results.sort(key=lambda r:(r['status']!='identificador',r['date'],str(r['edition_id']),r['page']))
        update(job_id, status='done', results=results, pncp_results=pncp_rows, sources=states, warnings=list(dict.fromkeys(warnings)), progress=100, message=f'{len(results)} páginas encontradas.', queries=queries)
    except Exception as exc: update(job_id, status='error', message=str(exc))

def slug(value):
    return re.sub(r'[^a-zA-Z0-9_-]+','_', normalized(value)).strip('_')[:90] or 'pesquisa'

def export_files(job_id, rows, params, mode='complete'):
    if mode not in ('complete', 'pages'): raise ValueError('Formato de download inválido.')
    if mode == 'pages':
        return export_pages(job_id, rows, params)
    folder = OUT / (slug(params['process'] or params['esfinge'] or params['object'] or params['tender'])+'_'+job_id[:8])
    folder.mkdir(parents=True, exist_ok=True)
    errors, files, exported = [], {}, []
    if any(r.get('page_only') for r in rows):errors.append('União: o pacote inclui somente as páginas certificadas adicionadas, não a edição completa.')
    ids = sorted({r['edition_id'] for r in rows},key=str)
    for done, edition in enumerate(ids,1):
        row = next(r for r in rows if r['edition_id']==edition)
        try:
            data = pdf_data(row)
            if not data.startswith(b'%PDF-'): raise ValueError('A resposta recebida não é um PDF.')
            from pypdf import PdfReader, PdfWriter
            reader = PdfReader(io.BytesIO(data))
            if not reader.pages: raise ValueError('PDF sem páginas.')
            original_hash = hashlib.sha256(data).hexdigest()
            original_count = len(reader.pages)
            selected_pages = sorted({r.get('pdf_page',r['page']) for r in rows if r['edition_id']==edition})
            if any(p < 1 or p > original_count for p in selected_pages):
                raise ValueError('A página indicada pelo Diário não existe neste PDF. Confira a edição original.')
            page_map = {p:p for p in selected_pages}
            suffix = ''
            if mode == 'pages':
                writer = PdfWriter()
                for page in selected_pages: writer.add_page(reader.pages[page-1])
                writer.add_metadata({'/Title':f"Páginas selecionadas de {row['edition']}", '/Subject':'Cópia parcial; consulte a edição oficial para verificar a assinatura digital.'})
                stream = io.BytesIO(); writer.write(stream); data = stream.getvalue()
                assert len(PdfReader(io.BytesIO(data)).pages)==len(selected_pages)
                page_map = {page:i+1 for i,page in enumerate(selected_pages)}
                suffix = '_paginas_selecionadas'
            name = f"{row['date']}_{slug(row.get('source','corumba'))}_{slug(row['edition'])}_{edition}{'_pagina_'+str(row['page']) if row.get('page_only') else suffix}.pdf"
            (folder/name).write_bytes(data)
            files[edition] = dict(file=name, sha256=hashlib.sha256(data).hexdigest(), pages=len(selected_pages) if mode=='pages' else original_count,
                                 original_sha256=original_hash, original_pages=original_count, selected_pages=selected_pages, page_map=page_map)
        except Exception as exc: errors.append(f"Edição {edition}: {exc}")
        update(job_id, progress=round(done/len(ids)*100), message=f'Baixadas/verificadas {done} de {len(ids)} edições.')
    for row in rows:
        if row['edition_id'] in files:
            info=files[row['edition_id']]
            exported.append(dict(row, **info, saved_page=info['page_map'][row.get('pdf_page',row['page'])]))
    intro = 'Resultados selecionados na pesquisa automática. A presença de identificadores não confirma, por si só, o vínculo: confira o ato, especialmente retificações e referências a outros processos. '
    intro += ('Cópias parciais com somente as páginas selecionadas, na ordem original. A numeração impressa é preservada; o link PDF salvo abre a posição correspondente no arquivo extraído. A extração não preserva a assinatura digital do documento completo. Consulte o original para verificá-la. ' if mode=='pages' else 'PDFs completos e preservados. ')
    intro += 'SHA-256 registra a integridade dos arquivos, não valida a assinatura digital.'
    content = ['<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Índice da pesquisa</title><style>body{font:16px/1.5 system-ui;max-width:1100px;margin:40px auto;padding:20px}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}a{color:#087d78}</style><h1>Publicações por fonte — índice</h1><p>'+intro+'</p><p>'+html.escape(json.dumps(params,ensure_ascii=False))+'</p><table><tr><th>Data / edição</th><th>Página</th><th>Correspondência e trecho</th></tr>']
    for r in exported:
        content.append(f"<tr><td>{r['date']}<br>{html.escape(r.get('source_name',''))} · {html.escape(r['edition'])}<br><a href='{r['file']}#page={r['saved_page']}'>PDF salvo</a> · <a href='{r['url']}#page={r['page']}'>Original</a></td><td>{r['page']} (original)</td><td>{html.escape(', '.join(r['reasons']))}<br>{html.escape(r['snippet'])}</td></tr>")
    content.append('</table><h2>Falhas de download</h2><p>'+html.escape('; '.join(errors) or 'Nenhuma.')+'</p></html>')
    (folder/'INDICE.html').write_text(''.join(content),encoding='utf8')
    (folder/'MANIFESTO.json').write_text(json.dumps(dict(params=params,mode=mode,results=exported,errors=errors),ensure_ascii=False,indent=2),encoding='utf8')
    archive = folder.with_suffix('.zip')
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for f in folder.iterdir(): z.write(f, folder.name+'/'+f.name)
    with zipfile.ZipFile(archive) as z:
        if z.testzip(): raise ValueError('Falha ao verificar o ZIP.')
    update(job_id,status='done',message=f'{len(files)} PDFs organizados.',warnings=errors,download='/download/'+archive.name,folder=str(folder),count=len(files))

def run_export(job_id, rows, params, mode='complete'):
    try: export_files(job_id, rows, params, mode)
    except Exception as exc: update(job_id,status='error',message=str(exc))

def run_import(job_id, data):
    try:
        rows=catalog.prepare(data.get('name',''),data.get('content',''))
        update(job_id,status='done',progress=100,message=f'{len(rows)} extrato(s) para revisar.',entries=rows)
    except Exception as exc:update(job_id,status='error',message=str(exc))

def export_pages(job_id, rows, params):
    """Um único PDF com as páginas selecionadas; nenhum arquivo auxiliar."""
    from pypdf import PdfReader, PdfWriter
    if len(rows)==1 and rows[0].get('source')=='uniao' and rows[0].get('page_only'):
        data=pdf_data(rows[0])
        if len(PdfReader(io.BytesIO(data)).pages)!=1:raise ValueError('PDF certificado inválido.')
        OUT.mkdir(parents=True,exist_ok=True)
        name='DOU_'+rows[0]['date']+'_pagina_'+str(rows[0]['page'])+'_'+job_id[:8]+'.pdf'
        (OUT/name).write_bytes(data)
        update(job_id,status='done',progress=100,message='Página certificada original pronta.',warnings=[],download='/download/'+name,count=1,page_count=1,mode='pages')
        return
    writer=PdfWriter(); expected=0
    editions=sorted({r['edition_id'] for r in rows},key=lambda eid:(next(r['date'] for r in rows if r['edition_id']==eid),str(eid)))
    for i,eid in enumerate(editions,1):
        group=[r for r in rows if r['edition_id']==eid]
        data=pdf_data(group[0])
        if not data.startswith(b'%PDF-'): raise ValueError('O Diário não retornou um PDF válido.')
        reader=PdfReader(io.BytesIO(data))
        pages=sorted({r.get('pdf_page',r['page']) for r in group})
        for page in pages:
            if page<1 or page>len(reader.pages): raise ValueError(f'Página {page} não encontrada na edição {eid}.')
            writer.add_page(reader.pages[page-1]);expected+=1
        update(job_id,progress=round(i/len(editions)*100),message=f'Extraindo páginas: {i} de {len(editions)} edições.')
    if not expected: raise ValueError('Selecione pelo menos uma página.')
    writer.add_metadata({'/Title':'Páginas selecionadas de publicações','/Subject':'Cópia parcial. Consulte a edição oficial para verificar a assinatura digital.'})
    stream=io.BytesIO();writer.write(stream);data=stream.getvalue()
    if len(PdfReader(io.BytesIO(data)).pages)!=expected:raise ValueError('Não foi possível validar a extração.')
    OUT.mkdir(parents=True,exist_ok=True)
    name=slug(params['process'] or params['esfinge'] or params['object'] or params['tender'])+'_paginas_selecionadas_'+job_id[:8]+'.pdf'
    (OUT/name).write_bytes(data)
    update(job_id,status='done',progress=100,message=f'PDF pronto: {expected} página(s) selecionada(s).',warnings=[],download='/download/'+name,count=1,page_count=expected,mode='pages')

class Handler(BaseHTTPRequestHandler):
    def reply(self, data, status=200, content_type='application/json; charset=utf-8'):
        if not isinstance(data,bytes): data=json.dumps(data,ensure_ascii=False).encode('utf8')
        self.send_response(status);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data)

    def do_GET(self):
        path=urllib.parse.urlparse(self.path).path
        if path=='/': return self.reply((ROOT/'index.html').read_bytes(),content_type='text/html; charset=utf-8')
        if path=='/journal.js':return self.reply((ROOT/'journal.js').read_bytes(),content_type='text/javascript; charset=utf-8')
        if path=='/catalog.js':return self.reply((ROOT/'catalog.js').read_bytes(),content_type='text/javascript; charset=utf-8')
        if path.startswith('/api/journal/page/'):
            key=path.rsplit('/',1)[-1]
            with LOCK:edition=JOURNAL_EDITIONS.get(key)
            if not edition:return self.reply({'error':'Consulte a edição novamente.'},404)
            try:
                page=int(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('page',['1'])[0])
                import pypdfium2 as pdfium
                data=sources.cached_pdf(edition['url'],fetch)
                with sources.PDF_LOCK:
                    doc=pdfium.PdfDocument(data)
                    try:
                        if page<1 or page>len(doc):raise ValueError('Página inválida.')
                        pdfpage=doc[page-1]
                        try:im=pdfpage.render(scale=1.5).to_pil()
                        finally:pdfpage.close()
                    finally:doc.close()
                output=io.BytesIO();im.save(output,format='PNG')
                return self.reply(output.getvalue(),content_type='image/png')
            except Exception as exc:return self.reply({'error':str(exc)},400)
        if path.startswith('/api/journal/pdf/'):
            key=path.rsplit('/',1)[-1]
            with LOCK:edition=JOURNAL_EDITIONS.get(key)
            if not edition:return self.reply({'error':'Edição não encontrada; consulte a data novamente.'},404)
            try:return self.reply(sources.cached_pdf(edition['url'],fetch),content_type='application/pdf')
            except Exception as exc:return self.reply({'error':str(exc)},400)
        if path=='/api/catalog':return self.reply({'records':catalog.records()})
        if path=='/api/version': return self.reply({'version':'catalog-1'})
        if path.startswith('/api/jobs/'):
            with LOCK: job=dict(JOBS.get(path.rsplit('/',1)[1],{}))
            return self.reply(job or {'error':'Pesquisa não encontrada.'},200 if job else 404)
        if path.startswith('/download/'):
            name=urllib.parse.unquote(path.rsplit('/',1)[1]); f=(OUT/name).resolve()
            if f.parent==OUT.resolve() and f.suffix in ('.zip','.pdf') and f.exists():
                data=f.read_bytes()
                self.send_response(200);self.send_header('Content-Type','application/pdf' if f.suffix=='.pdf' else 'application/zip');self.send_header('Content-Disposition',f'attachment; filename="{f.name}"');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
        self.reply({'error':'Não encontrado.'},404)

    def do_POST(self):
        try:
            origin=self.headers.get('Origin')
            if origin and origin!=f'http://{self.headers.get("Host")}': return self.reply({'error':'Origem não permitida.'},403)
            if 'application/json' not in self.headers.get('Content-Type',''): return self.reply({'error':'Envie JSON.'},415)
            length=int(self.headers.get('Content-Length',0))
            if length>(15*1024*1024 if self.path=='/api/catalog/import' else 1000000): raise ValueError('Pedido muito grande.')
            data=json.loads(self.rfile.read(length));jid=uuid.uuid4().hex
            if self.path=='/api/catalog/import':
                with LOCK:
                    if sum(j['status']=='running' for j in JOBS.values())>=3:return self.reply({'error':'Aguarde as tarefas em andamento.'},429)
                    JOBS[jid]=dict(status='running',progress=0,message='Lendo documento e separando extratos…')
                POOL.submit(run_import,jid,data)
            elif self.path=='/api/catalog/save':
                items=[]
                for item in data.get('items',[]):
                    with LOCK:job=JOBS.get(item.get('job_id'),{})
                    index=int(item.get('index',-1))
                    if job.get('status')!='done' or index<0 or index>=len(job.get('entries',[])):raise ValueError('Prévia inválida; importe o arquivo novamente.')
                    items.append((job['entries'][index],item['fields'],item['source'],item.get('target_id','')))
                if not items:raise ValueError('Selecione pelo menos um extrato.')
                return self.reply({'saved':catalog.save(items)})
            elif self.path=='/api/catalog/edit':
                return self.reply({'record':catalog.edit(data['id'],data['fields'])})
            elif self.path=='/api/catalog/delete':
                return self.reply({'deleted':catalog.delete(data.get('ids'))})
            elif self.path=='/api/catalog/load':
                record=catalog.get(data['id'])
                if not record['fields'].get('date'):
                    return self.reply({'record':record,'needs_date':True})
                return self.reply({'record':record,'params':catalog.search_params(record)})
            elif self.path=='/api/catalog/export':
                record=catalog.get(data['id']);mode=data.get('mode','pages')
                if not record['links']:raise ValueError('Localize e confira as páginas antes de baixar este extrato.')
                if mode not in ('pages','complete'):raise ValueError('Modo inválido.')
                with LOCK:
                    if sum(j['status']=='running' for j in JOBS.values())>=3:return self.reply({'error':'Aguarde as tarefas em andamento.'},429)
                    JOBS[jid]=dict(status='running',progress=0,message='Preparando PDFs vinculados ao extrato…')
                POOL.submit(run_export,jid,record['links'],dict(record['fields']),mode)
            elif self.path=='/api/search':
                params=validate(data)
                catalog_id=data.get('catalog_id','')
                if catalog_id:catalog.get(catalog_id)
                with LOCK:
                    if sum(j['status']=='running' for j in JOBS.values())>=3: return self.reply({'error':'Aguarde as tarefas em andamento.'},429)
                    JOBS[jid]=dict(status='running',progress=0,message='Iniciando consulta ao Diário…',params=params,catalog_id=catalog_id)
                POOL.submit(run_search,jid,params)
            elif self.path=='/api/journal/preview':
                with LOCK:edition=JOURNAL_EDITIONS.get(data.get('edition_id'))
                if not edition:raise ValueError('Consulte a edição novamente.')
                from pypdf import PdfReader
                count=len(PdfReader(io.BytesIO(sources.cached_pdf(edition['url'],fetch))).pages)
                return self.reply({'pages':count})
            elif self.path=='/api/journal/editions':
                editions=sources.journal_editions(data['date'],fetch)
                with LOCK:
                    for edition in editions:JOURNAL_EDITIONS[edition['id']]=edition
                return self.reply({'editions':editions})
            elif self.path=='/api/journal/add':
                with LOCK:
                    edition=JOURNAL_EDITIONS.get(data.get('edition_id'))
                    source=JOBS.get(data.get('search_id'),{})
                if not edition:raise ValueError('Consulte a edição novamente.')
                if source and source.get('status')!='done':raise ValueError('Aguarde a pesquisa terminar antes de juntar as páginas.')
                params=source.get('params') or validate(data.get('params',{}))
                rows=sources.manual_journal_rows(edition,data.get('pages'),params,fetch,classify)
                search_id=data.get('search_id') if source else jid
                with LOCK:
                    if not source:
                        catalog_id=data.get('catalog_id','')
                        if catalog_id:catalog.get(catalog_id)
                        source=dict(status='done',params=params,catalog_id=catalog_id,results=[],sources=[],warnings=[],queries=[])
                        JOBS[search_id]=source
                    existing={r['id']:r for r in source['results']}
                    existing.update({r['id']:r for r in rows});source['results']=list(existing.values())
                    source['sources']=[s for s in source.get('sources',[]) if s['source']!='jornal']+[dict(source='jornal',name=sources.NAMES['jornal'],count=sum(r['source']=='jornal' for r in source['results']),status='inclui seleção manual')]
                return self.reply({'rows':rows,'search_id':search_id})
            elif self.path=='/api/dou':
                with LOCK: source=JOBS.get(data.get('search_id'),{})
                if source.get('status')!='done' or 'results' not in source:raise ValueError('Conclua uma pesquisa antes de adicionar a página.')
                row=sources.import_dou(data['date'],data['page'],data['section'],source['params'],fetch,classify)
                with LOCK:
                    source['results']=[r for r in source['results'] if r['id']!=row['id']]+[row]
                    for state in source.get('sources',[]):
                        if state['source']=='uniao':state['count']=sum(r.get('source')=='uniao' for r in source['results'])
                return self.reply({'row':row})
            elif self.path=='/api/export':
                mode=data.get('mode','complete')
                if mode not in ('complete','pages'): raise ValueError('Escolha diário completo ou páginas selecionadas.')
                with LOCK: source=JOBS.get(data.get('search_id'),{})
                if source.get('status')!='done' or 'results' not in source: raise ValueError('Conclua uma pesquisa antes de baixar.')
                selected=set(data.get('ids',[]));rows=[r for r in source['results'] if r['id'] in selected]
                if not rows: raise ValueError('Selecione pelo menos uma página.')
                with LOCK:
                    if sum(j['status']=='running' for j in JOBS.values())>=3: return self.reply({'error':'Aguarde as tarefas em andamento.'},429)
                    JOBS[jid]=dict(status='running',progress=0,message='Preparando os PDFs…')
                if source.get('catalog_id'):catalog.link(source['catalog_id'],rows)
                POOL.submit(run_export,jid,rows,source['params'],mode)
            else: return self.reply({'error':'Não encontrado.'},404)
            self.reply({'id':jid},202)
        except (ValueError,TypeError,KeyError,OSError) as exc:self.reply({'error':str(exc)},400)

class LocalServer(ThreadingHTTPServer):
    allow_reuse_address = False
    def server_bind(self):
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

def main():
    import argparse, webbrowser
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8081);parser.add_argument('--open',action='store_true');args=parser.parse_args()
    server=LocalServer(('127.0.0.1',args.port),Handler)
    print(f'Pesquisa de Diários em http://127.0.0.1:{args.port}',flush=True)
    if args.open:webbrowser.open(f'http://127.0.0.1:{args.port}')
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=='__main__':main()
