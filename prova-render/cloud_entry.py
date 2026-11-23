"""Inicialização da API autenticada para serviço de contêiner."""
import os
from cloud_search_api import create_server

if __name__ == '__main__':
    server = create_server('0.0.0.0', int(os.environ.get('PORT', '10000')))
    server.serve_forever()
