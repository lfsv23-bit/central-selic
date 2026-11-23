"""Acesso ao acervo pela Data API com a sessão do próprio usuário.

Este adaptador é uma base isolada; ele ainda precisa ser integrado a todas as
operações do catálogo e aos trabalhos em segundo plano antes de publicação.
"""
import json
import urllib.error
import urllib.parse
import urllib.request
from cloud_security import SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
from uuid import UUID, uuid4


class StorageError(Exception):
    pass


class CloudStore:
    def __init__(self, access_token, opener=urllib.request.urlopen):
        if not isinstance(access_token, str) or not access_token or any(c.isspace() for c in access_token):
            raise ValueError('Sessão inválida.')
        self._token = access_token
        self._open = opener

    def _request(self, method, path, data=None, content_type='application/json', extra_headers=None):
        headers = {'apikey': SUPABASE_PUBLISHABLE_KEY, 'Authorization': 'Bearer ' + self._token,
                   'Accept': 'application/json'}
        if data is not None:
            headers['Content-Type'] = content_type
        if extra_headers:
            headers.update(extra_headers)
        req = urllib.request.Request(SUPABASE_URL + path, data=data, headers=headers, method=method)
        try:
            with self._open(req, timeout=30) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise StorageError('Não foi possível acessar o acervo online.') from exc

    def listar(self):
        rows = []
        limit = 500
        while True:
            query = '/rest/v1/central_diario_extratos?select=id,corpo&order=atualizado_em.desc,id.asc&limit=' + str(limit) + '&offset=' + str(len(rows))
            page = json.loads(self._request('GET', query))
            if not isinstance(page, list):
                raise StorageError('Resposta inválida do acervo.')
            rows.extend(page)
            if len(page) < limit:
                return rows

    def inserir(self, record_id, corpo):
        payload = json.dumps({'id': str(record_id), 'corpo': corpo}, ensure_ascii=False).encode('utf-8')
        raw = self._request('POST', '/rest/v1/central_diario_extratos', payload,
                            extra_headers={'Prefer': 'return=representation'})
        rows = json.loads(raw)
        if len(rows) != 1:
            raise StorageError('O acervo não confirmou o salvamento.')
        return rows[0]

    def obter(self, record_id):
        record = str(UUID(str(record_id)))
        raw = self._request('GET', '/rest/v1/central_diario_extratos?id=eq.' + record + '&select=id,corpo')
        rows = json.loads(raw)
        if len(rows) != 1:
            raise StorageError('Extrato não encontrado.')
        return rows[0]

    def atualizar(self, record_id, corpo):
        record = str(UUID(str(record_id)))
        payload = json.dumps({'corpo': corpo}, ensure_ascii=False).encode('utf-8')
        raw = self._request('PATCH', '/rest/v1/central_diario_extratos?id=eq.' + record,
                            payload, extra_headers={'Prefer': 'return=representation'})
        rows = json.loads(raw)
        if len(rows) != 1:
            raise StorageError('Extrato não encontrado ou alteração não confirmada.')
        return rows[0]

    def excluir(self, record_id):
        record = str(UUID(str(record_id)))
        raw = self._request('DELETE', '/rest/v1/central_diario_extratos?id=eq.' + record,
                            extra_headers={'Prefer': 'return=representation'})
        rows = json.loads(raw)
        if len(rows) != 1:
            raise StorageError('Extrato não encontrado ou exclusão não confirmada.')
        return rows[0]

    def anexar(self, user_id, record_id, filename, body, content_type):
        # A política do bucket exige o UUID do usuário no primeiro segmento.
        owner = str(UUID(str(user_id)))
        record = str(UUID(str(record_id)))
        if not isinstance(body, bytes) or len(body) > 10485760:
            raise ValueError('Arquivo inválido ou maior que 10 MB.')
        path = owner + '/' + record + '/' + str(uuid4())
        self._request('POST', '/storage/v1/object/central-diarios/' + urllib.parse.quote(path, safe='/'),
                      body, content_type=content_type or 'application/octet-stream',
                      extra_headers={'x-upsert': 'false'})
        return {'path': path, 'name': str(filename), 'type': str(content_type or '')}
