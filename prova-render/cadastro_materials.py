"""Busca indexada na extração pública CATMAT de 30/09/2026."""
import json, re, sqlite3, threading, unicodedata
from contextlib import closing
from pathlib import Path
BASE=Path(__file__).resolve().parent / 'catmat.sqlite'
_lock=threading.Lock()
_cache={'key':None,'ids':[],'cursor':0,'rows':[]}
MAX_RESULTS=10000

def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFD',value.lower()) if not unicodedata.combining(c))

def search(query,offset=0):
    if not isinstance(query,str) or len(query)<3 or len(query)>200 or offset<0 or offset>=MAX_RESULTS: raise ValueError('Informe pelo menos três caracteres.')
    words=[w for w in normalize(query).split() if w not in {'de','da','do','das','dos','em','com','para'}]
    parts=[part for word in words for part in re.findall(r'[a-z0-9]{3,}',word)]
    grams=list(dict.fromkeys(part[i:i+3] for part in parts for i in range(len(part)-2)))[:32]
    if not words or not grams:raise ValueError('Informe um termo de pelo menos três caracteres.')
    key=' '.join(words)
    with _lock, closing(sqlite3.connect('file:'+str(BASE.resolve()).replace('\\','/')+'?mode=ro',uri=True,timeout=10)) as db:
        if key!=_cache['key']:
            match=' AND '.join('"'+g+'"' for g in grams)
            ids=[row[0] for row in db.execute('select rowid from words where words match ? order by rowid',(match,))]
            _cache.update(key=key,ids=ids,cursor=0,rows=[])
        ids=_cache['ids'];rows=_cache['rows']
        while len(rows)<offset+21 and _cache['cursor']<len(ids) and len(rows)<MAX_RESULTS:
            batch=ids[_cache['cursor']:_cache['cursor']+50];_cache['cursor']+=len(batch)
            placeholders=','.join('?' for _ in batch)
            for (body,) in db.execute('select body from items where id in ('+placeholders+') order by id',batch):
                row=json.loads(body);text=normalize(row['descricaoItem']+' '+row['nomePdm']+' '+row['codigoItem'])
                if all(w in text for w in words) and len(rows)<MAX_RESULTS:rows.append(row)
        exhausted=_cache['cursor']>=len(ids) or len(rows)>=MAX_RESULTS
        total=len(rows) if exhausted else min(MAX_RESULTS,len(rows)+len(ids)-_cache['cursor'])
        return {'items':rows[offset:offset+20],'total':total,'total_aproximado':not exhausted,'offset':offset,'base':'30/09/2026','limite':MAX_RESULTS}
