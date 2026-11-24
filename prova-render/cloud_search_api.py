"""API experimental de busca autenticada; não inicia servidor público."""
import json
import io
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import app
import catalog
import cloud_catalog
import cloud_security
import sources
from cloud_store import CloudStore, StorageError
from cloud_jobs import JobStore, JobUnavailable, JobLimitReached

ALLOWED_ORIGIN = 'https://lfsv23-bit.github.io'
jobs = JobStore(limit=1, ttl=3600)


def _run(job_id, owner, operation, *args):
    try:
        with app.LOCK:
            app.JOBS[job_id] = {'status': 'running'}
        operation(job_id, *args)
        with app.LOCK:
            result = app.JOBS.pop(job_id, {})
        if not result:
            jobs.update(owner, job_id, status='error', message='Consulta interrompida.')
        else:
            jobs.update(owner, job_id, **result)
    except Exception:
        with app.LOCK:
            app.JOBS.pop(job_id, None)
        jobs.update(owner, job_id, status='error', message='Não foi possível concluir a pesquisa.')

def _run_import(job_id, owner, token, data):
    try:
        rows = cloud_catalog.prepare(CloudStore(token), owner, data.get('name', ''), data.get('content', ''))
        jobs.update(owner, job_id, status='done', progress=100, message='Documento lido.', entries=rows)
    except (ValueError, StorageError, OSError) as exc:
        jobs.update(owner, job_id, status='error', message=str(exc))
    except Exception:
        jobs.update(owner, job_id, status='error', message='Não foi possível ler o documento.')

def _start(owner, operation, *args, **values):
    job_id = jobs.create(owner, **values)
    thread = threading.Thread(target=_run, args=(job_id, owner, operation, *args), daemon=True)
    thread.start()
    return job_id


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if self.headers.get('Origin') == ALLOWED_ORIGIN:
            self.send_header('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
            self.send_header('Vary', 'Origin')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if self.headers.get('Origin') != ALLOWED_ORIGIN:
            return self.reply(403, {'error': 'Origem não permitida.'})
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.end_headers()

    def identity(self):
        origin = self.headers.get('Origin')
        if origin and origin != ALLOWED_ORIGIN:
            self.reply(403, {'error': 'Origem não permitida.'})
            return None
        try:
            return cloud_security.authenticate(self.headers.get('Authorization'))
        except cloud_security.AuthenticationRequired:
            self.reply(401, {'error': 'Entre na Central para continuar.'})
        except cloud_security.AuthenticationUnavailable:
            self.reply(503, {'error': 'Não foi possível validar o acesso agora.'})
        return None

    def do_GET(self):
        if self.path in ('/', '/health'):
            return self.reply(200, {'status':'ok'})
        identity = self.identity()
        if not identity:
            return
        path=urllib.parse.urlparse(self.path).path
        if path == '/api/cadastro/materials':
            try:
                import cadastro_materials
                query=urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                return self.reply(200,cadastro_materials.search(query.get('q',[''])[0].strip(),int(query.get('offset',['0'])[0])))
            except (ValueError,TypeError):
                return self.reply(400,{'error':'Consulta inválida.'})
            except Exception:
                return self.reply(503,{'error':'Base CATMAT temporariamente indisponível.'})
        if path.startswith('/api/journal/pdf/') or path.startswith('/api/journal/page/'):
            key=path.rsplit('/',1)[-1]
            with app.LOCK: edition=app.JOURNAL_EDITIONS.get(key)
            if not edition:return self.reply(404,{'error':'Edição não encontrada.'})
            try:
                content_type='application/pdf'
                if '/page/' in path:
                    page=int(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('page',['1'])[0])
                    with sources.journal_preview_pdf(edition['url'],app.fetch) as doc:
                        if page<1 or page>len(doc):raise ValueError('Página inválida.')
                        pdfpage=doc[page-1]
                        try: image=pdfpage.render(scale=1.5).to_pil()
                        finally: pdfpage.close()
                    output=io.BytesIO();image.save(output,format='PNG');data=output.getvalue();content_type='image/png'
                else:
                    data=sources.cached_pdf(edition['url'],app.fetch)
                self.send_response(200);self.send_header('Content-Type',content_type)
                self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store')
                if self.headers.get('Origin')==ALLOWED_ORIGIN:
                    self.send_header('Access-Control-Allow-Origin',ALLOWED_ORIGIN);self.send_header('Vary','Origin')
                self.end_headers();self.wfile.write(data);return
            except Exception:
                return self.reply(502,{'error':'Não foi possível abrir a edição.'})
        if path == '/api/version':
            return self.reply(200, {'version':'catalog-1'})
        if path == '/api/catalog':
            try: return self.reply(200, {'records': cloud_catalog.records(CloudStore(self.headers['Authorization'][7:].strip()))})
            except StorageError: return self.reply(503, {'error':'Não foi possível carregar o acervo.'})
        if path.startswith('/download/'):
            try:
                job=jobs.get(identity.user_id,path.rsplit('/',1)[-1])
                name=Path(urllib.parse.urlparse(job.get('download','')).path).name
                file=(app.OUT/name).resolve()
                if not name or file.parent!=app.OUT.resolve() or file.suffix not in ('.pdf','.zip') or not file.is_file():
                    raise JobUnavailable()
                data=file.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type','application/pdf' if file.suffix=='.pdf' else 'application/zip')
                self.send_header('Content-Disposition','attachment; filename="'+file.name+'"')
                self.send_header('Content-Length',str(len(data)))
                self.send_header('Cache-Control','no-store')
                if self.headers.get('Origin')==ALLOWED_ORIGIN:
                    self.send_header('Access-Control-Allow-Origin',ALLOWED_ORIGIN)
                    self.send_header('Vary','Origin')
                self.end_headers();self.wfile.write(data);return
            except JobUnavailable:
                return self.reply(404,{'error':'Arquivo não encontrado.'})
        if not path.startswith('/api/jobs/'):
            return self.reply(404, {'error': 'Não encontrado.'})
        try:
            job_id = path.rsplit('/', 1)[-1]
            job = jobs.get(identity.user_id, job_id)
            # A pesquisa original publica etapas e resultados antes do fim.
            # Somente consulte esse estado depois de validar o dono da tarefa.
            if job.get('status') == 'running':
                with app.LOCK:
                    partial = app.JOBS.get(job_id, {}).copy()
                for key in ('message', 'progress', 'results', 'sources', 'warnings', 'queries'):
                    if key in partial:
                        job[key] = partial[key]
            if job.get('download'):
                job['download']='/download/'+job_id
            job.pop('folder',None)
            return self.reply(200, job)
        except JobUnavailable:
            return self.reply(404, {'error': 'Pesquisa não encontrada.'})

    def do_HEAD(self):
        if self.path not in ('/', '/health'):
            self.send_response(404);self.end_headers();return
        self.send_response(200)
        self.send_header('Cache-Control','no-store')
        self.end_headers()

    def do_POST(self):
        identity = self.identity()
        if not identity:
            return
        if self.path not in ('/api/search','/api/catalog/import','/api/catalog/save','/api/catalog/edit','/api/catalog/delete','/api/catalog/load','/api/catalog/export','/api/export','/api/journal/editions','/api/journal/preview','/api/journal/add','/api/dou'):
            return self.reply(404, {'error': 'Não encontrado.'})
        if self.headers.get('Content-Type', '').split(';', 1)[0].strip().lower() != 'application/json':
            return self.reply(415, {'error': 'Envie JSON.'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > (15*1024*1024 if self.path=='/api/catalog/import' else 1000000):
                raise ValueError('Pedido inválido.')
            data=json.loads(self.rfile.read(size));store=CloudStore(self.headers['Authorization'][7:].strip())
            if self.path=='/api/catalog/import':
                job_id=jobs.create(identity.user_id,message='Lendo documento…')
                threading.Thread(target=_run_import,args=(job_id,identity.user_id,store._token,data),daemon=True).start()
            elif self.path=='/api/catalog/save':
                items=[]
                for item in data.get('items',[]):
                    job=jobs.get(identity.user_id,item.get('job_id',''));index=int(item.get('index',-1))
                    if job.get('status')!='done' or index<0 or index>=len(job.get('entries',[])):raise ValueError('Prévia inválida.')
                    items.append((job['entries'][index],item['fields'],item['source'],item.get('target_id','')))
                if not items:raise ValueError('Selecione pelo menos um extrato.')
                return self.reply(200,{'saved':cloud_catalog.save(store,items)})
            elif self.path=='/api/catalog/edit':
                return self.reply(200,{'record':cloud_catalog.edit(store,data['id'],data['fields'])})
            elif self.path=='/api/catalog/delete':
                return self.reply(200,{'deleted':cloud_catalog.delete(store,data.get('ids'))})
            elif self.path=='/api/catalog/load':
                record=cloud_catalog.get(store,data['id'])
                if not record['fields'].get('date'):return self.reply(200,{'record':record,'needs_date':True})
                return self.reply(200,{'record':record,'params':catalog.search_params(record)})
            elif self.path=='/api/journal/editions':
                editions=sources.journal_editions(data['date'],app.fetch)
                with app.LOCK:
                    for edition in editions:app.JOURNAL_EDITIONS[edition['id']]=edition
                return self.reply(200,{'editions':editions})
            elif self.path=='/api/journal/preview':
                with app.LOCK:edition=app.JOURNAL_EDITIONS.get(data.get('edition_id'))
                if not edition:raise ValueError('Edição não encontrada.')
                with sources.journal_preview_pdf(edition['url'],app.fetch) as doc:
                    pages=len(doc)
                return self.reply(200,{'pages':pages})
            elif self.path=='/api/dou':
                source=jobs.get(identity.user_id,data.get('search_id',''))
                if source.get('status')!='done' or 'results' not in source:raise ValueError('Conclua a pesquisa.')
                row=sources.import_dou(data['date'],data['page'],data['section'],source['params'],app.fetch,app.classify)
                source['results']=[r for r in source['results'] if r['id']!=row['id']]+[row]
                for item in source.get('sources',[]):
                    if item['source']=='uniao':item['count']=sum(r.get('source')=='uniao' for r in source['results'])
                jobs.update(identity.user_id,data['search_id'],results=source['results'],sources=source.get('sources',[]))
                return self.reply(200,{'row':row})
            elif self.path=='/api/journal/add':
                with app.LOCK:edition=app.JOURNAL_EDITIONS.get(data.get('edition_id'))
                if not edition:raise ValueError('Edição não encontrada.')
                search_id=data.get('search_id')
                source=jobs.get(identity.user_id,search_id) if search_id else None
                if source and source.get('status')!='done':raise ValueError('Aguarde a pesquisa terminar.')
                params=source.get('params') if source else app.validate(data.get('params',{}))
                rows=sources.manual_journal_rows(edition,data.get('pages'),params,app.fetch,app.classify)
                if not source:
                    catalog_id=data.get('catalog_id','')
                    if catalog_id:cloud_catalog.get(store,catalog_id)
                    source={'results':[],'sources':[]}
                existing={r['id']:r for r in source.get('results',[])};existing.update({r['id']:r for r in rows})
                states=[s for s in source.get('sources',[]) if s.get('source')!='jornal']
                states.append(dict(source='jornal',name=sources.NAMES['jornal'],count=sum(r['source']=='jornal' for r in existing.values()),status='inclui seleção manual'))
                if search_id:
                    jobs.update(identity.user_id,search_id,status='done',params=params,results=list(existing.values()),sources=states)
                else:
                    search_id=jobs.create_completed(identity.user_id,params=params,catalog_id=catalog_id,message='Páginas adicionadas.',results=list(existing.values()),sources=states)
                return self.reply(200,{'rows':rows,'search_id':search_id})
            elif self.path=='/api/catalog/export':
                record=cloud_catalog.get(store,data['id']);mode=data.get('mode','pages')
                if not record['links'] or mode not in ('pages','complete'):raise ValueError('Confira as páginas e o formato.')
                job_id=_start(identity.user_id,app.run_export,record['links'],dict(record['fields']),mode,message='Preparando PDFs…')
            elif self.path=='/api/export':
                source=jobs.get(identity.user_id,data.get('search_id',''))
                if source.get('status')!='done' or 'results' not in source:raise ValueError('Conclua a pesquisa.')
                mode=data.get('mode','complete')
                if mode not in ('pages','complete'):raise ValueError('Formato inválido.')
                selected=set(data.get('ids',[]));rows=[r for r in source['results'] if r['id'] in selected]
                if not rows:raise ValueError('Selecione pelo menos uma página.')
                if source.get('catalog_id'):cloud_catalog.link(store,source['catalog_id'],rows)
                job_id=_start(identity.user_id,app.run_export,rows,source['params'],mode,message='Preparando PDFs…')
            else:
                params=app.validate(data);catalog_id=data.get('catalog_id','')
                if catalog_id:cloud_catalog.get(store,catalog_id)
                job_id=_start(identity.user_id,app.run_search,params,message='Iniciando consulta…',params=params,catalog_id=catalog_id)
        except JobUnavailable:
            return self.reply(404, {'error':'Pesquisa não encontrada.'})
        except StorageError:
            return self.reply(503, {'error':'Não foi possível acessar o acervo online.'})
        except (ValueError, TypeError, KeyError, json.JSONDecodeError):
            return self.reply(400, {'error': 'Confira os dados da pesquisa.'})
        except JobLimitReached:
            return self.reply(429, {'error': 'Aguarde as tarefas em andamento.'})
        except OSError:
            return self.reply(502, {'error':'Não foi possível consultar a fonte.'})
        self.reply(202, {'id': job_id})


def create_server(host='127.0.0.1', port=0):
    return ThreadingHTTPServer((host, port), Handler)
