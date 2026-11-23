"""Tipos sugeridos por títulos, associados ao trecho do identificador."""
import re, unicodedata

TYPES={'licitacao':'Aviso de licitação','resultado':'Aviso de resultado','contratacao_direta':'Aviso de contratação direta','homologacao':'Homologação / Adjudicação','retificacao':'Retificação','prorrogacao':'Prorrogação','suspensao':'Suspensão','reabertura':'Reabertura','contrato':'Extrato de contrato / adesão','aditivo':'Termo aditivo','outro':'Outro / não identificado'}

def norm(text):
    return ''.join(c for c in unicodedata.normalize('NFKD',text.lower()) if not unicodedata.combining(c))

def title_type(title):
    text=norm(title)
    for key,pattern in [('retificacao',r'retifica|errata'),('aditivo',r'aditivo|apostilamento'),('homologacao',r'homologa|adjudica'),('contratacao_direta',r'contratacao direta|dispensa'),('suspensao',r'suspensao'),('prorrogacao',r'prorrogacao'),('reabertura',r'reabertura'),('resultado',r'resultado|julgamento'),('licitacao',r'licitacao|abertura'),('contrato',r'extrato|contrato|adesao')]:
        if re.search(pattern,text):return key
    return 'outro'

HEAD=re.compile(r'\b(?:aviso\s+de\s+(?:licitacao|resultado|contratacao\s+direta|adjudicacao(?:\s*/\s*homologacao)?|homologacao(?:\s*/\s*adjudicacao)?|retificacao|prorrogacao|suspensao|reabertura)|termo\s+de\s+(?:retificacao|homologacao|adjudicacao)|resultado\s+de\s+julgamento|extrato\s+(?:do|de|da)\s+(?:termo\s+(?:de\s+)?(?:adesao|aditivo)|contrato)|(?:primeiro|segundo|terceiro|\d+[ºo]?)\s+termo\s+aditivo)\b')

def matched_types(text,patterns):
    """Não atribui o título de outro ato da mesma página ao processo buscado."""
    text=norm(text)
    heads=[]
    for match in HEAD.finditer(text):
        before=text[max(0,match.start()-100):match.start()]
        # Títulos citados em retificações não são novos atos.
        if re.search(r'(?:publicacao\s+(?:do|de)|publicado\s+(?:no|o)|referente\s+ao)\s*$',before):continue
        heads.append(match)
    positions=sorted({m.start() for pattern in patterns for m in re.finditer(pattern,text)})
    types=set()
    for position in positions:
        preceding=[h for h in heads if h.start()<=position]
        if not preceding:continue
        heading=preceding[-1]
        if position-heading.end()>2500:continue
        types.add(title_type(heading.group()))
    return sorted(types) or ['outro']
