"""HTTPS com validação nativa de certificados, sem modificar o SSL global."""
import ssl
import sys
import urllib.request
import urllib.error
from urllib.parse import urlparse
from pathlib import Path
from functools import lru_cache

sys.path.insert(0,str(Path(__file__).resolve().parent/'vendor'))
import truststore

ALLOWED_HOSTS = frozenset({
    'do.corumba.ms.gov.br', 'www.diariooficial.ms.gov.br',
    'assets.imprensaoficial.ms.gov.br', 'edicaodigital.oestadoonline.com.br',
    'oestadoms.websiteseguro.com', 'www.in.gov.br', 'pesquisa.in.gov.br',
    'pncp.gov.br',
})

def validate_url(url):
    try:
        parsed = urlparse(url)
        allowed = (parsed.scheme == 'https' and parsed.hostname in ALLOWED_HOSTS
                   and not parsed.username and not parsed.password
                   and parsed.port in (None, 443))
    except ValueError:
        allowed = False
    if not allowed:
        raise ValueError('Endereço externo não permitido.')

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

@lru_cache(maxsize=1)
def context():
    return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)

def urlopen(request,timeout=45):
    validate_url(request.full_url if hasattr(request, 'full_url') else request)
    try:
        opener = urllib.request.build_opener(SafeRedirect(), urllib.request.HTTPSHandler(context=context()))
        return opener.open(request,timeout=timeout)
    except urllib.error.URLError as exc:
        if isinstance(exc.reason,ssl.SSLCertVerificationError):
            raise ValueError('Não foi possível validar o certificado HTTPS desta fonte com os certificados do servidor.') from exc
        raise

