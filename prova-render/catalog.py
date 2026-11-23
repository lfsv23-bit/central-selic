"""Acervo local de extratos. Importação não comprova publicação."""
from pathlib import Path
from datetime import date, datetime, timedelta
import base64, hashlib, json, os, re, shutil, sqlite3, subprocess, unicodedata, uuid, zipfile
import xml.etree.ElementTree as ET
import tempfile
from contextlib import contextmanager
from calendar import monthrange
import acts

ROOT=Path(__file__).resolve().parent
DATA=ROOT/'data'
DB=DATA/'extratos.sqlite3'
MODALITIES={'pregao':'Pregão Eletrônico','concorrencia':'Concorrência Eletrônica','dispensa':'Dispensa Eletrônica','chamada':'Chamada Pública','credenciamento':'Credenciamento','outro':'Outra modalidade'}
SOURCES={'corumba':'Município','estado':'Estado','jornal':'Jornal','uniao':'União'}

def norm(text):
    return ''.join(c for c in unicodedata.normalize('NFKD',text.lower()) if not unicodedata.combining(c))

def canonical_number(value):
    m=re.fullmatch(r'\s*([\d.]+)\s*/\s*(\d{4}|\d{2})\s*',str(value))
    if not m:raise ValueError('Use número/ano, por exemplo 1234/2026.')
    return str(int(m[1].replace('.','')))+'/'+('20'+m[2] if len(m[2])==2 else m[2])

def extract_text(path):
    suffix=path.suffix.lower()
    if suffix=='.txt':
        raw=path.read_bytes()
        try:return raw.decode('utf-8-sig')
        except UnicodeError:return raw.decode('cp1252')
    if suffix=='.docx':
        with zipfile.ZipFile(path) as archive:
            if sum(i.file_size for i in archive.infolist())>30*1024*1024:raise ValueError('DOCX descompactado excede 30 MB.')
            root=ET.fromstring(archive.read('word/document.xml'))
        ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        return '\n'.join(''.join(p.itertext()) for p in root.findall('.//w:p',ns))
    if suffix not in ('.doc','.rtf'):raise ValueError('Use DOC, DOCX, RTF ou TXT.')
    candidates=[r'C:\Program Files\LibreOffice\program\soffice.com',r'C:\Program Files (x86)\LibreOffice\program\soffice.com',shutil.which('soffice.com'),shutil.which('soffice'),r'C:\Program Files\LibreOffice\program\soffice.exe',r'C:\Program Files (x86)\LibreOffice\program\soffice.exe']
    converter=next((str(p) for p in candidates if p and Path(p).is_file()),None)
    if not converter:raise ValueError('Para DOC/RTF, instale LibreOffice ou salve o documento como DOCX e importe novamente.')
    work=Path(tempfile.mkdtemp(prefix='selic-conversao-'))
    try:
        proc=subprocess.run([converter,'-env:UserInstallation='+(work/'profile').resolve().as_uri(),'--headless','--convert-to','txt:Text (encoded):UTF8','--outdir',str(work),str(path.resolve())],capture_output=True,timeout=60)
        output=work/(path.stem+'.txt')
        if proc.returncode or not output.exists():raise ValueError('Não foi possível ler o documento. Verifique se está protegido ou salve como DOCX.')
        return output.read_text(encoding='utf-8-sig')
    except subprocess.TimeoutExpired:raise ValueError('A conversão excedeu 60 segundos. Tente salvar como DOCX.')
    finally:
        if work.resolve().parent==Path(tempfile.gettempdir()).resolve() and work.name.startswith('selic-conversao-'):
            shutil.rmtree(work,ignore_errors=True)

HEAD=re.compile(r'^(?:##ATO\s*)?(?:TERMO DE (?:RETIFICA[ÇC][ÃA]O|HOMOLOGA[ÇC][ÃA]O|ADJUDICA[ÇC][ÃA]O)|RESULTADO DE JULGAMENTO|HOMOLOGA[ÇC][ÃA]O|ADJUDICA[ÇC][ÃA]O|AVISO\s+DE\s+(?:RESULTADO|CONTRATA[ÇC][ÃA]O|ADJUDICA[ÇC][ÃA]O|HOMOLOGA[ÇC][ÃA]O|LICITA[ÇC][ÃA]O|RETIFICA[ÇC][ÃA]O|PRORROGA[ÇC][ÃA]O|SUSPENS[ÃA]O|REABERTURA)|EXTRATO\s+(?:DO|DE|DA)\s+)',re.I)
NUM=r'([\d.]+\s*/\s*(?:\d{4}|\d{2}))(?!\d)'
PREFIX=r'\s*(?:n[º°o.]?\s*[º°.]?\s*)?[:\-]?\s*'
MONTHS={name:i+1 for i,name in enumerate('janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro'.split())}

def parse_block(text):
    plain=norm(text);warnings=[]
    title=next((l.strip().removeprefix('##ATO').strip() for l in text.splitlines() if l.strip()),'Extrato sem título')
    correction=re.search(r'leia-se\s*:\s*processo(?:\s+administrativo)?'+PREFIX+NUM,plain)
    found=re.findall(r'processo(?:\s+administrativo)?'+PREFIX+NUM,plain)
    process=canonical_number(correction[1]) if correction else (canonical_number(found[0]) if found else '')
    if correction:warnings.append('Retificação: adotado o processo do trecho “Leia-se”. Confira o número anterior no original.')
    elif len(set(canonical_number(n) for n in found))>1:warnings.append('Há mais de um processo no extrato. Confira qual deve ser pesquisado.')
    modality='outro';tender=''
    for key,label in MODALITIES.items():
        if key=='outro':continue
        m=re.search(re.escape(norm(label))+PREFIX+NUM,plain)
        if m:modality=key;tender=canonical_number(m[1]);break
    code=re.search(r'e[\s-]*sfinge\s*:\s*[“"{\s]*([a-f0-9]{40})',plain)
    esfinge=code[1].upper() if code else ''
    obj=re.search(r'(?:\bobjeto\s*:|\bobjeto\s+[eé]\s+(?:a\s+|o\s+)?)',plain)
    object_text=''
    if obj:
        tail=text[obj.end():]
        stop=re.search(r'\n\s*(?:VALOR|DATA|DURA[ÇC][ÃA]O|DOTA[ÇC][ÃA]O|O MUNIC[IÍ]PIO|CRIT[EÉ]RIO|RECEBIMENTO|ASSINAM)\b|,?\s*(?:Tendo como empresas|declarando a Empresa)',tail,re.I)
        object_text=re.sub(r'\s+',' ',tail[:stop.start()] if stop else tail).strip(' .')[:2000]
    dates=re.findall(r'corumba\s*[-/]?\s*ms\s*,?\s*(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})',plain)
    when=''
    if dates:
        day,month,year=dates[-1]
        if month in MONTHS:
            try:when=date(int(year),MONTHS[month],int(day)).isoformat()
            except ValueError:pass
    if not when:warnings.append('Data do extrato não identificada. Não foi usada a data da sessão ou de publicação citada.')
    if not process:warnings.append('Processo não identificado; complete antes de pesquisar.')
    if not object_text:warnings.append('Objeto não identificado automaticamente.')
    return dict(title=title[:250],act_type=acts.title_type(title),process=process,tender=tender,modality=modality,esfinge=esfinge,object=object_text,date=when,text=text.strip(),warnings=warnings)

def split_extracts(text):
    text=text.replace('\r\n','\n').replace('\r','\n').replace('\x0c','\n').strip('\ufeff \n')
    lines=text.splitlines();starts=[i for i,line in enumerate(lines) if HEAD.match(line.strip())]
    if not starts:return [dict(parse_block(text),warnings=['Separação automática não reconhecida. Confira se há vários extratos neste texto.'])] if text else []
    chunks=[]
    for n,start in enumerate(starts):
        end=starts[n+1] if n+1<len(starts) else len(lines)
        chunks.append(parse_block('\n'.join(lines[start:end])))
    if starts[0] and any(line.strip() for line in lines[:starts[0]]):
        chunks[0]['warnings'].append('Há texto antes do primeiro título; confira o documento original.')
    return chunks

def fingerprint(text):
    return hashlib.sha256(re.sub(r'\W+','',norm(text)).encode()).hexdigest()

def prepare(filename, encoded):
    name=Path(str(filename).replace('\\','/')).name
    suffix=Path(name).suffix.lower()
    if suffix not in ('.doc','.docx','.rtf','.txt'):raise ValueError('Formato não suportado: '+suffix)
    try:raw=base64.b64decode(encoded,validate=True)
    except Exception:raise ValueError('Arquivo enviado inválido.')
    if not raw or len(raw)>10*1024*1024:raise ValueError('Envie arquivos de até 10 MB.')
    folder=DATA/'imports';folder.mkdir(parents=True,exist_ok=True)
    digest=hashlib.sha256(raw).hexdigest();path=folder/(digest+suffix)
    path.write_bytes(raw)
    text=extract_text(path)
    if len(text)>1_000_000:raise ValueError('Texto muito grande; divida o documento.')
    rows=split_extracts(text)
    if not rows:raise ValueError('Não foi encontrado texto no documento.')
    guessed='uniao' if 'dou' in norm(name) else 'estado' if 'estado' in norm(name) else 'jornal' if 'jornal' in norm(name) else 'corumba'
    for row in rows:row.update(document=name,file=digest+suffix,fingerprint=fingerprint(row['text']),source=guessed)
    return rows

@contextmanager
def connect():
    DB.parent.mkdir(parents=True,exist_ok=True)
    con=sqlite3.connect(DB,timeout=20)
    con.execute('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, body TEXT NOT NULL)')
    con.execute('CREATE TABLE IF NOT EXISTS fingerprints (hash TEXT PRIMARY KEY, record_id TEXT NOT NULL)')
    for record_id,body in con.execute('SELECT id,body FROM records').fetchall():
        row=json.loads(body)
        if 'act_type' not in row['fields']:
            row['fields']['act_type']=acts.title_type(row['fields'].get('title',''))
            con.execute('UPDATE records SET body=? WHERE id=?',(json.dumps(row,ensure_ascii=False),record_id))
    con.commit()
    try:
        with con:yield con
    finally:con.close()

def records():
    with connect() as con:return [json.loads(row[0]) for row in con.execute('SELECT body FROM records ORDER BY rowid DESC')]

def get(record_id):
    with connect() as con:r=con.execute('SELECT body FROM records WHERE id=?',(record_id,)).fetchone()
    if not r:raise ValueError('Extrato não encontrado.')
    return json.loads(r[0])

def clean_fields(fields):
    out={key:str(fields.get(key,'')).strip() for key in ('title','process','tender','modality','esfinge','object','date')}
    if not out['title'] or len(out['title'])>250:raise ValueError('Título obrigatório, até 250 caracteres.')
    out['act_type']=fields.get('act_type') or acts.title_type(out['title'])
    if out['act_type'] not in acts.TYPES:raise ValueError('Tipo de extrato inválido.')
    for key in ('process','tender'):
        if out[key]:out[key]=canonical_number(out[key])
    if out['modality'] not in MODALITIES:raise ValueError('Modalidade inválida.')
    if out['date']:date.fromisoformat(out['date'])
    out['esfinge']=out['esfinge'].upper()
    if out['esfinge'] and not re.fullmatch('[A-Z0-9-]{6,100}',out['esfinge']):raise ValueError('Código e-Sfinge inválido.')
    if len(out['object'])>2000:raise ValueError('Objeto: máximo de 2.000 caracteres.')
    return out

def save(items):
    saved=[]
    with connect() as con:
        con.execute('BEGIN IMMEDIATE')
        for raw,fields,source,target in items:
            if source not in SOURCES:raise ValueError('Meio inválido.')
            fields=clean_fields(fields)
            matched=con.execute('SELECT record_id FROM fingerprints WHERE hash=?',(raw['fingerprint'],)).fetchone()
            record_id=target or (matched[0] if matched else uuid.uuid4().hex)
            existing=con.execute('SELECT body FROM records WHERE id=?',(record_id,)).fetchone()
            if target and not existing:raise ValueError('Registro para reunir não encontrado.')
            if matched and matched[0]!=record_id:raise ValueError('Este texto já pertence a outro registro; edite o registro existente.')
            row=json.loads(existing[0]) if existing else dict(id=record_id,fields=fields,documents=[],sources=[],links=[],created=datetime.now().isoformat())
            if existing:
                # Campos revisados existentes não são substituídos por outra importação.
                for key,value in fields.items():
                    if not row['fields'].get(key):row['fields'][key]=value
            doc={k:raw[k] for k in ('document','file','text','fingerprint')};doc['source']=source
            if not any(d['fingerprint']==doc['fingerprint'] and d['source']==source and d['file']==doc['file'] for d in row['documents']):row['documents'].append(doc)
            row['sources']=sorted(set(row['sources']+[source]));row['updated']=datetime.now().isoformat()
            con.execute('INSERT OR REPLACE INTO records VALUES (?,?)',(record_id,json.dumps(row,ensure_ascii=False)))
            con.execute('INSERT OR IGNORE INTO fingerprints VALUES (?,?)',(raw['fingerprint'],record_id));saved.append(record_id)
    return list(dict.fromkeys(saved))

def delete(record_ids):
    if not isinstance(record_ids,list) or not record_ids or any(not isinstance(i,str) for i in record_ids):
        raise ValueError('Selecione os extratos para excluir.')
    ids=list(dict.fromkeys(record_ids))
    with connect() as con:
        con.execute('BEGIN IMMEDIATE')
        for rid in ids:
            if not con.execute('SELECT 1 FROM records WHERE id=?',(rid,)).fetchone():
                raise ValueError('Extrato não encontrado. Atualize a tabela.')
        for rid in ids:
            con.execute('DELETE FROM fingerprints WHERE record_id=?',(rid,))
            con.execute('DELETE FROM records WHERE id=?',(rid,))
    return ids

def edit(record_id,fields):
    fields=clean_fields(fields)
    with connect() as con:
        con.execute('BEGIN IMMEDIATE')
        r=con.execute('SELECT body FROM records WHERE id=?',(record_id,)).fetchone()
        if not r:raise ValueError('Extrato não encontrado.')
        row=json.loads(r[0]);row['fields']=fields;row['updated']=datetime.now().isoformat()
        con.execute('UPDATE records SET body=? WHERE id=?',(json.dumps(row,ensure_ascii=False),record_id))
    return row

def link(record_id,rows):
    with connect() as con:
        con.execute('BEGIN IMMEDIATE')
        r=con.execute('SELECT body FROM records WHERE id=?',(record_id,)).fetchone()
        if not r:raise ValueError('Extrato não encontrado.')
        record=json.loads(r[0]);existing={row['id']:row for row in record['links']};existing.update({row['id']:row for row in rows})
        record['links']=list(existing.values());record['updated']=datetime.now().isoformat()
        con.execute('UPDATE records SET body=? WHERE id=?',(json.dumps(record,ensure_ascii=False),record_id))
    return record

def search_params(row):
    fields=row['fields']
    if not fields.get('date'):raise ValueError('Informe a data do extrato antes de pesquisar.')
    reference=date.fromisoformat(fields['date'])
    start=reference-timedelta(days=5)
    end=reference+timedelta(days=5)
    return dict(extract_date=fields['date'],process=fields['process'],tender=fields['tender'],modality=fields['modality'],esfinge=fields['esfinge'],object=fields['object'],act_type=fields.get('act_type','outro'),start=start.isoformat(),end=end.isoformat(),sources=row['sources'])

