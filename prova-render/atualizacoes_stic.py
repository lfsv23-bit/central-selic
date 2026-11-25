"""Consulta de leitura do STIC; a senha existe apenas durante a requisição."""
import http.cookiejar
import json
import re
import urllib.parse
import urllib.request

URL = 'https://stic.corumba.ms.gov.br/processos/'

def fetch(password):
    if not isinstance(password,str) or not password or len(password)>1024:
        raise ValueError('Informe a senha do sistema.')
    opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    with opener.open(URL,urllib.parse.urlencode({'action':'login','password':password}).encode(),timeout=30) as response:
        page=response.read(2*1024*1024+1)
    if len(page)>2*1024*1024:raise ValueError('Resposta de autenticação inesperada.')
    token=re.search(r'const csrfToken\s*=\s*("[^"\n]+")',page.decode('utf-8'))
    if not token:raise ValueError('Não foi possível entrar. Confira a senha ou se o sistema mudou.')
    request=urllib.request.Request(URL+'?api=1',data=b'{"action":"load"}',headers={'Content-Type':'application/json','X-CSRF-Token':json.loads(token.group(1))})
    with opener.open(request,timeout=30) as response: raw=response.read(10*1024*1024+1)
    if len(raw)>10*1024*1024:raise ValueError('Resposta de processos excedeu o limite.')
    result=json.loads(raw);rows=result.get('processes')
    if not isinstance(rows,list) or any(not isinstance(p,dict) or 'id' not in p for p in rows):raise ValueError('O sistema retornou dados em formato inesperado. A referência foi preservada.')
    ids=[str(p['id']) for p in rows]
    if len(ids)!=len(set(ids)):raise ValueError('O sistema retornou identificadores duplicados. A referência foi preservada.')
    return rows
