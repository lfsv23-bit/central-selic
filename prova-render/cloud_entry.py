"""Inicialização da API autenticada para serviço de contêiner."""
import os
import threading
import urllib.error
import urllib.request
import https_client
from cloud_search_api import create_server

def check_journal_tls():
    try:
        request = urllib.request.Request('https://oestadoms.websiteseguro.com/', method='HEAD')
        with https_client.urlopen(request, timeout=20):
            pass
        print('Conexão HTTPS com o jornal: certificado validado.', flush=True)
    except urllib.error.HTTPError:
        print('Conexão HTTPS com o jornal: certificado validado.', flush=True)
    except Exception as exc:
        print('Conexão HTTPS com o jornal: falhou (' + type(exc).__name__ + ').', flush=True)

if __name__ == '__main__':
    server = create_server('0.0.0.0', int(os.environ.get('PORT', '10000')))
    threading.Thread(target=check_journal_tls, daemon=True).start()
    server.serve_forever()
