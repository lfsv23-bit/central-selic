"""Consultas públicas por fonte; limites e falhas nunca equivalem a zero resultados."""
from datetime import date, timedelta
import hashlib, html, io, json, re, threading, urllib.parse, urllib.error, subprocess, uuid, os
from contextlib import contextmanager
from catalog import MODALITIES
from pathlib import Path

NAMES = {'corumba':'Diário de Corumbá', 'estado':'Diário do Estado · MS', 'jornal':'Jornal O Estado', 'uniao':'Diário da União', 'pncp':'PNCP'}
PDF_LOCK = threading.Lock()  # PDFium não é seguro em threads concorrentes.
CACHE = Path(__file__).parent / 'cache'
_preview_url = None
_preview_stream = None

@contextmanager
def journal_preview_pdf(url, fetch):
    """Abre somente os trechos necessários quando a fonte aceita Range.

    PDF_LOCK protege tanto o PDFium quanto a posição do fluxo compartilhado.
    Apenas uma edição pública é mantida em memória por vez.
    """
    global _preview_url, _preview_stream
    import pypdfium2 as pdfium
    import range_pdf
    with PDF_LOCK:
        cached = CACHE / (hashlib.sha256(url.encode()).hexdigest() + '.pdf')
        if cached.exists():
            source = cached_pdf(url, fetch)
        else:
            if _preview_url != url or _preview_stream is None:
                try:
                    _preview_stream = range_pdf.RangePDF(url)
                    _preview_url = url
                except (OSError, ValueError):
                    _preview_url = _preview_stream = None
                    source = cached_pdf(url, fetch)
                else:
                    source = _preview_stream
            else:
                source = _preview_stream
            if source is _preview_stream and _preview_stream is not None:
                source.seek(0)
        try:
            doc = pdfium.PdfDocument(source)
            try:
                yield doc
            finally:
                doc.close()
            if source is _preview_stream and source.error is not None:
                raise source.error
        except Exception:
            _preview_url = _preview_stream = None
            raise

def ocr_page(data, index):
    import pypdfium2 as pdfium
    with PDF_LOCK:
        doc=pdfium.PdfDocument(data)
        try:
            page=doc[index]
            try:im=page.render(scale=3).to_pil()
            finally:page.close()
        finally:doc.close()
    texts=[]
    CACHE.mkdir(exist_ok=True)
    prefix=uuid.uuid4().hex
    paths=[]
    try:
        w,h=im.size
        for part,(x,y) in enumerate([(0,0),(1,0),(0,1),(1,1)]):
            path=CACHE/f'ocr_{prefix}_{part}.png'
            paths.append(path)
            im.crop((max(0,x*w//2-25),max(0,y*h//2-25),min(w,(x+1)*w//2+25),min(h,(y+1)*h//2+25))).save(path)
            if os.name == 'nt':
                command=['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(Path(__file__).with_name('ocr.ps1')),'-ImagePath',str(path.resolve())]
            else:
                command=['tesseract',str(path.resolve()),'stdout','-l','por']
            proc=subprocess.run(command,capture_output=True,timeout=45,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            if proc.returncode:raise ValueError('OCR indisponível. Confira o PDF original.')
            texts.append(proc.stdout.decode('utf-8-sig',errors='replace'))
    finally:
        for path in paths:
            if path.exists():path.unlink()
    return '\n'.join(texts)

def pdf_text(data):
    import pypdfium2 as pdfium
    with PDF_LOCK:
        doc = pdfium.PdfDocument(data)
        try:
            texts = []
            for i in range(len(doc)):
                page = doc[i]; text = page.get_textpage()
                try: texts.append(text.get_text_range())
                finally: text.close(); page.close()
            return texts
        finally: doc.close()

def cached_pdf(url, fetch):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / (hashlib.sha256(url.encode()).hexdigest()+'.pdf')
    if path.exists():
        data=path.read_bytes()
        if b'%%EOF' in data[-2048:]:return data
    data = fetch(url, binary=True)
    if not data.startswith(b'%PDF-'): raise ValueError('A fonte não forneceu um PDF.')
    if b'%%EOF' not in data[-2048:]:raise ValueError('A fonte interrompeu o PDF antes do fim. Tente novamente.')
    path.write_bytes(data)
    return data

def result(source, edition, when, page, text, url, params, classify):
    key = source+'_'+hashlib.sha256(url.encode()).hexdigest()[:16]
    row = classify(dict(_id=key+'_'+str(page), _source=dict(diario_id=1, data=when, pagina=page, conteudo=text), suplemento=edition), params)
    row.update(source=source, source_name=NAMES[source], edition_id=key, url=url)
    return row

def terms(params):
    if params['esfinge']:return [params['esfinge']]
    values=[]
    if params['process']:
        n,y=params['process'].split('/')
        values += [params['process'],format(int(n),',').replace(',','.')+'/'+y]
        if y.startswith('20'):values += [n+'/'+y[-2:],format(int(n),',').replace(',','.')+'/'+y[-2:]]
    if params['esfinge']: values.append(params['esfinge'])
    if params['tender']:
        n,y=params['tender'].split('/')
        label=MODALITIES.get(params.get('modality','pregao'),'Licitação')
        values.extend(f'{label} nº {v}/{y}' for v in dict.fromkeys([n,n.zfill(2),n.zfill(3)]))
    if params['object']:values.append(params['object'])
    return list(dict.fromkeys(values))

def search_state(params, fetch, classify, progress):
    rows={}; warnings=[]
    for term in terms(params):
        try:
            for page in range(1,21):
                query=urllib.parse.urlencode(dict(tipo=1,texto=term,dataInicial=params['start'],dataFinal=params['end'],pagina=page,registrosPorPagina=50))
                data=fetch('https://www.diariooficial.ms.gov.br/api/diarios/busca-diarios?'+query)
                if 'paginasDiario' not in data:raise ValueError('Formato de resposta desconhecido.')
                for hit in data['paginasDiario']:
                    url=hit['caminhoArquivo']
                    if urllib.parse.urlparse(url).hostname!='assets.imprensaoficial.ms.gov.br':raise ValueError('Endereço PDF inesperado.')
                    text=html.unescape(re.sub('<[^>]+>',' ',' '.join(hit.get('hiHighlight',{}).get('texto',[]))))
                    row=result('estado',hit['descricao'],hit['dataPublicacao'][:10],int(hit['pagina']),text,url,params,classify)
                    if row['id'] in rows:
                        text=rows[row['id']]['text']+' '+text
                        row=result('estado',hit['descricao'],hit['dataPublicacao'][:10],int(hit['pagina']),text,url,params,classify)
                    rows[row['id']]=row
                if page>=data.get('totalDePaginas',1):break
            else:warnings.append('Estado: limite de 1.000 resultados por termo; reduza o período.')
        except urllib.error.HTTPError as exc:
            if not (exc.code==400 and 'Nenhum resultado encontrado' in exc.read().decode('utf8',errors='replace')):
                warnings.append(f'Estado: consulta incompleta para {term}: {exc}')
        except Exception as exc:warnings.append(f'Estado: consulta incompleta para {term}: {exc}')
        progress('Consultando Diário do Estado…')
    return [r for r in rows.values() if not params['esfinge'] or 'Código e-Sfinge' in r['reasons']],warnings

def journal_windows(params, candidates):
    start,end=date.fromisoformat(params['start']),date.fromisoformat(params['end'])
    if (end-start).days<=31:return [(start,end)],[]
    days=set()
    for row in candidates:
        if row['status']!='identificador':continue
        d=date.fromisoformat(row['date'][:10])
        for shift in range(-1,3):
            v=d+timedelta(days=shift)
            if start<=v<=end:days.add(v)
    if not days:return [],['Jornal: para pesquisar sem datas de referência, escolha um período de até 31 dias.']
    ordered=sorted(days)[:45];windows=[]
    for d in ordered:
        if windows and d==windows[-1][1]+timedelta(days=1):windows[-1]=(windows[-1][0],d)
        else:windows.append((d,d))
    return windows,['Jornal: busca parcial nas datas próximas aos identificadores encontrados nos diários (até 45 dias). Para cobrir todo um intervalo, consulte períodos de até 31 dias.']

def journal_is_general(slug):
    """Edição comum identificada pelo endereço composto somente pela data."""
    return bool(re.fullmatch(r'\d{2}(?:-e-\d{2})?-\d{2}-\d{4}',slug.strip('/')))


def search_journal(params, candidates, fetch, classify, progress):
    if params.get('extract_date'):
        return search_journal_extract(params,fetch,classify,progress)
    windows,warnings=journal_windows(params,candidates);posts={};rows={};seen=set()
    for start,end in windows:
        for page in range(1,11):
            query=urllib.parse.urlencode(dict(after=(start-timedelta(days=1)).isoformat()+'T00:00:00',before=(end+timedelta(days=1)).isoformat()+'T23:59:59',per_page=100,page=page))
            try:
                batch=fetch('https://edicaodigital.oestadoonline.com.br/wp-json/wp/v2/posts?'+query)
                if not isinstance(batch,list):raise ValueError('Catálogo indisponível.')
                for item in batch:
                    m=re.match(r'(\d{2})-(\d{2})-(\d{4})(?:-|$)',item['slug'])
                    if not m:
                        m=re.match(r'(\d{2})-e-\d{2}-(\d{2})-(\d{4})(?:-|$)',item['slug'])
                    if not m:
                        warnings.append('Jornal: uma edição sem data reconhecível foi omitida.');continue
                    d=date(int(m[3]),int(m[2]),int(m[1]))
                    if start<=d<=end:posts[item['id']]=(item,d.isoformat())
                if len(batch)<100:break
            except Exception as exc:warnings.append(f'Jornal: catálogo incompleto: {exc}');break
        else:warnings.append('Jornal: limite de catálogo atingido.')
    ocr_count=0
    for done,(item,when) in enumerate(sorted(posts.values(),key=lambda pair:(pair[1],not journal_is_general(pair[0].get('slug','')))),1):
        progress(f'Lendo Jornal O Estado: {done}/{len(posts)} edições…')
        content=html.unescape(item['content']['rendered']).replace('\\/','/')
        urls=set(re.findall(r'https?[^\s<>"\x27]+?\.pdf',content))
        if not urls:warnings.append(f"Jornal: PDF não disponível em {item['link']}")
        for url in urls-seen:
            seen.add(url)
            if urllib.parse.urlparse(url).hostname not in ('oestadoms.websiteseguro.com','edicaodigital.oestadoonline.com.br'):
                warnings.append('Jornal: endereço PDF não reconhecido.');continue
            try:
                data=cached_pdf(url,fetch);texts=pdf_text(data)
                for page,text in enumerate(texts,1):
                    used_ocr=False
                    if len(text.strip())<2500 or 'classificad' in text.lower() or 'publicidade legal' in text.lower():
                        cache=CACHE/(hashlib.sha256(url.encode()).hexdigest()+f'_ocr3_{page}.txt')
                        try:
                            if cache.exists():extra=cache.read_text(encoding='utf8')
                            elif ocr_count<60:
                                progress(f'Jornal {when}: reconhecendo imagem da página {page}…')
                                extra=ocr_page(data,page-1);ocr_count+=1;cache.write_text(extra,encoding='utf8')
                            else:
                                extra=''
                                note='Jornal: limite de 60 páginas com OCR atingido. Consulta parcial; reduza o período.'
                                if note not in warnings:warnings.append(note)
                            text+='\n'+extra;used_ocr=True
                        except Exception as exc:warnings.append(f'Jornal {when}, página {page}: {exc}')
                    row=result('jornal','O Estado · '+html.unescape(item['title']['rendered']),when,page,text,url,params,classify)
                    if used_ocr:row['ocr']=True
                    if (not params['esfinge'] and row['reasons']!=['Resultado aproximado do Diário']) or (params['esfinge'] and 'Código e-Sfinge' in row['reasons']):rows[row['id']]=row
            except Exception as exc:warnings.append(f'Jornal {when}: leitura incompleta: {exc}')
    if posts:warnings.append('Jornal: OCR aplicado a classificados, publicidade legal e páginas com pouco texto. Imagens em outras seções podem não ser localizadas; confira o original, pois OCR pode errar caracteres.')
    return list(rows.values()),list(dict.fromkeys(warnings))

def search_journal_extract(params, fetch, classify, progress):
    when=(date.fromisoformat(params['extract_date'])+timedelta(days=1)).isoformat()
    rows={};notes=[]
    progress(f'Jornal: procurando edição de {when}, páginas 18, 19 e 20…')
    editions=journal_editions(when,fetch)
    if not editions:
        return [],[f'Jornal: nenhuma edição disponível para {when}. Use a visualização manual para escolher outra data.']
    general_urls={e['url'] for e in editions if e.get('general',False)}
    for edition in sorted(editions,key=lambda e:not e.get('general',False)):
        if any(r['url'] in general_urls for r in rows.values()) and not edition.get('general',False):
            break  # A edição geral já trouxe correspondências; especiais ficam disponíveis manualmente.
        try:
            data=cached_pdf(edition['url'],fetch);texts=pdf_text(data)
            for page in (18,19,20):
                if page>len(texts):
                    notes.append(f'Jornal {when}: a edição tem {len(texts)} páginas; página {page} indisponível.')
                    continue
                text=texts[page-1];used_ocr=False
                try:
                    cache=CACHE/(hashlib.sha256(edition['url'].encode()).hexdigest()+f'_ocr3_{page}.txt')
                    progress(f'Jornal {when}: OCR da página {page}…')
                    if cache.exists():extra=cache.read_text(encoding='utf8')
                    else:
                        extra=ocr_page(data,page-1)
                        CACHE.mkdir(exist_ok=True);cache.write_text(extra,encoding='utf8')
                    text+='\n'+extra;used_ocr=True
                except Exception as exc:
                    notes.append(f'Jornal {when}, página {page}: OCR indisponível: {exc}')
                row=result('jornal','O Estado · '+edition['title'],edition['date'],page,text,edition['url'],params,classify)
                row['ocr']=used_ocr
                if ('Código e-Sfinge' in row['reasons'] if params['esfinge'] else row['reasons']!=['Resultado aproximado do Diário']):
                    rows[row['id']]=row
        except Exception as exc:notes.append(f'Jornal {when}: leitura incompleta: {exc}')
    notes.append(f'Jornal: consulta direcionada a {when}, páginas 18, 19 e 20 pela posição no PDF. Para outras datas ou páginas, use Visualizar jornal.')
    return list(rows.values()),list(dict.fromkeys(notes))


def dou_link(params):
    value=params['esfinge'] or params['process'] or params['object'] or params['tender']
    return 'https://www.in.gov.br/consulta/-/buscar/dou?'+urllib.parse.urlencode(dict(q='"'+value+'"',s='todos',exactDate='all',sortType=0))

def import_dou(when, page, section, params, fetch, classify):
    """Obtém a página certificada original do portal oficial."""
    d=date.fromisoformat(when)
    page=int(page);section=str(section)
    if page<1 or page>10000 or section not in ('1','2','3'):raise ValueError('Página ou seção inválida.')
    query=urllib.parse.urlencode(dict(data=d.strftime('%d/%m/%Y'),jornal={'1':515,'2':529,'3':530}[section],pagina=page,captchafield='firstAccess'))
    url='https://pesquisa.in.gov.br/imprensa/servlet/INPDFViewer?'+query
    data=cached_pdf(url,fetch);texts=pdf_text(data)
    if len(texts)!=1:raise ValueError('A União não retornou uma página certificada individual.')
    row=result('uniao',f'DOU · seção {section}',when,page,texts[0],url,params,classify)
    row.update(pdf_page=1,page_only=True)
    return row


def journal_editions(when, fetch):
    """Listar PDFs por data da edição, sem OCR."""
    day=date.fromisoformat(when);found={}
    for page in range(1,6):
        query=urllib.parse.urlencode(dict(after=(day-timedelta(days=3)).isoformat()+'T00:00:00',before=(day+timedelta(days=3)).isoformat()+'T23:59:59',per_page=100,page=page))
        batch=fetch('https://edicaodigital.oestadoonline.com.br/wp-json/wp/v2/posts?'+query)
        if not isinstance(batch,list):raise ValueError('Catálogo do jornal indisponível.')
        for item in batch:
            slug=item.get('slug','')
            m=re.match(r'(\d{2})(?:-e-(\d{2}))?-(\d{2})-(\d{4})(?:-|$)',slug)
            if not m:continue
            first=date(int(m[4]),int(m[3]),int(m[1]));last=date(int(m[4]),int(m[3]),int(m[2] or m[1]))
            if not first<=day<=last:continue
            content=html.unescape(item['content']['rendered']).replace('\\/','/')
            for url in set(re.findall(r'https?[^\s<>"\x27]+?\.pdf',content)):
                parsed=urllib.parse.urlparse(url)
                if parsed.scheme!='https' or parsed.hostname not in ('oestadoms.websiteseguro.com','edicaodigital.oestadoonline.com.br'):continue
                folder=re.search(r'/EdicaoDigital/(\d{4})/(\d{2})/',parsed.path,re.I)
                if folder and (int(folder[1]),int(folder[2])) not in ((first.year,first.month),(last.year,last.month)):continue
                key=hashlib.sha256(url.encode()).hexdigest()
                entry=dict(id=key,url=url,date=first.isoformat(),title=html.unescape(re.sub('<[^>]+>','',item['title']['rendered'])),filename=urllib.parse.unquote(parsed.path.rsplit('/',1)[-1]),general=journal_is_general(slug))
                if key not in found or entry['general']:found[key]=entry
        if len(batch)<100:break
    return sorted(found.values(),key=lambda e:(not e['general'],e['title']))

def manual_journal_rows(edition,pages,params,fetch,classify):
    from pypdf import PdfReader
    data=cached_pdf(edition['url'],fetch);count=len(PdfReader(io.BytesIO(data)).pages)
    if not isinstance(pages,list) or not pages or len(pages)>200 or any(type(p) is not int or p<1 or p>count for p in pages):raise ValueError(f'Informe páginas de 1 a {count}, conforme a posição no PDF.')
    rows=[]
    for page in sorted(set(pages)):
        row=result('jornal','O Estado · '+edition['title'],edition['date'],page,'Página selecionada manualmente pelo usuário após conferência visual.',edition['url'],params,classify)
        row.update(manual=True,status='revisar',reasons=['Seleção manual · conferir publicação'],act_types=[params.get('act_type') if params.get('act_type') not in (None,'all') else 'outro'])
        rows.append(row)
    return rows
