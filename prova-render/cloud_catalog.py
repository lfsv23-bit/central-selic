"""Acervo por usuário no Supabase, sem depender do disco do servidor."""
import base64
import hashlib
import json
import mimetypes
import tempfile
import threading
import uuid
from datetime import datetime
from pathlib import Path

import catalog
from cloud_store import CloudStore, StorageError

LOCK = threading.RLock()


def records(store):
    return [item['corpo'] for item in store.listar()]


def get(store, record_id):
    try:
        return store.obter(record_id)['corpo']
    except (StorageError, ValueError):
        raise ValueError('Extrato não encontrado.')


def prepare(store, user_id, filename, encoded):
    name = Path(str(filename).replace('\\', '/')).name
    suffix = Path(name).suffix.lower()
    if suffix not in ('.doc', '.docx', '.rtf', '.txt'):
        raise ValueError('Formato não suportado: ' + suffix)
    try:
        raw = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise ValueError('Arquivo enviado inválido.') from exc
    if not raw or len(raw) > 10 * 1024 * 1024:
        raise ValueError('Envie arquivos de até 10 MB.')
    with tempfile.TemporaryDirectory(prefix='central-importacao-') as directory:
        path = Path(directory) / ('documento' + suffix)
        path.write_bytes(raw)
        text = catalog.extract_text(path)
    if len(text) > 1000000:
        raise ValueError('Texto muito grande; divida o documento.')
    rows = catalog.split_extracts(text)
    if not rows:
        raise ValueError('Não foi encontrado texto no documento.')
    record_id = str(uuid.uuid4())
    stored = store.anexar(user_id, record_id, name, raw, mimetypes.guess_type(name)[0])
    guessed = 'uniao' if 'dou' in catalog.norm(name) else 'estado' if 'estado' in catalog.norm(name) else 'jornal' if 'jornal' in catalog.norm(name) else 'corumba'
    for row in rows:
        row.update(document=name, file=stored['path'], fingerprint=catalog.fingerprint(row['text']), source=guessed)
    return rows


def save(store, items):
    """Salva cada extrato sem substituir campos existentes já revisados.

    A exclusão de arquivos não é feita aqui: os originais são preservados.
    """
    saved = []
    with LOCK:
        current = records(store)
        fingerprints = {doc['fingerprint']: row['id'] for row in current
                        for doc in row.get('documents', []) if doc.get('fingerprint')}
        for raw, fields, source, target in items:
            if source not in catalog.SOURCES:
                raise ValueError('Meio inválido.')
            fields = catalog.clean_fields(fields)
            matched = fingerprints.get(raw['fingerprint'])
            record_id = str(uuid.UUID(target)) if target else (matched or str(uuid.uuid4()))
            existing = next((row for row in current if row['id'] == record_id), None)
            if target and not existing:
                raise ValueError('Registro para reunir não encontrado.')
            if matched and matched != record_id:
                raise ValueError('Este texto já pertence a outro registro; edite o registro existente.')
            row = json.loads(json.dumps(existing)) if existing else dict(id=record_id, fields=fields, documents=[], sources=[], links=[], created=datetime.now().isoformat())
            if existing:
                for key, value in fields.items():
                    if not row['fields'].get(key):
                        row['fields'][key] = value
            doc = {key: raw[key] for key in ('document', 'file', 'text', 'fingerprint')}
            doc['source'] = source
            if not any(d['fingerprint'] == doc['fingerprint'] and d['source'] == source and d['file'] == doc['file'] for d in row['documents']):
                row['documents'].append(doc)
            row['sources'] = sorted(set(row['sources'] + [source]))
            row['updated'] = datetime.now().isoformat()
            if existing:
                store.atualizar(record_id, row)
                current[current.index(existing)] = row
            else:
                store.inserir(record_id, row)
                current.append(row)
            fingerprints[raw['fingerprint']] = record_id
            saved.append(record_id)
    return list(dict.fromkeys(saved))


def edit(store, record_id, fields):
    with LOCK:
        row = get(store, record_id)
        row['fields'] = catalog.clean_fields(fields)
        row['updated'] = datetime.now().isoformat()
        store.atualizar(row['id'], row)
        return row


def delete(store, record_ids):
    if not isinstance(record_ids, list) or not record_ids or any(not isinstance(i, str) for i in record_ids):
        raise ValueError('Selecione os extratos para excluir.')
    ids = list(dict.fromkeys(record_ids))
    with LOCK:
        for rid in ids:
            get(store, rid)
        for rid in ids:
            store.excluir(rid)
    return ids


def link(store, record_id, rows):
    with LOCK:
        row = get(store, record_id)
        existing = {item['id']: item for item in row.get('links', [])}
        existing.update({item['id']: item for item in rows})
        row['links'] = list(existing.values())
        row['updated'] = datetime.now().isoformat()
        store.atualizar(row['id'], row)
        return row
