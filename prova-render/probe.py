"""Teste sintético: não contém dados, senhas ou serviços da Central."""
import json
import os
import subprocess
import tempfile
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

def memory():
    for filename in ('/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory/memory.usage_in_bytes'):
        try:
            return round(int(Path(filename).read_text()) / 1048576, 1)
        except (OSError, ValueError):
            pass
    return None

def run_probe():
    result = {'antes_mb': memory()}
    with tempfile.TemporaryDirectory(prefix='central-prova-') as folder:
        path = Path(folder)
        sample = path / 'amostra.rtf'
        sample.write_text(r'{\rtf1\ansi Teste ficticio\par Processo 1234/2026}', encoding='ascii')
        start = time.monotonic()
        conv = subprocess.run(['soffice', '-env:UserInstallation=' + (path/'profile').as_uri(), '--headless', '--convert-to', 'txt:Text', '--outdir', str(path), str(sample)], capture_output=True, timeout=60)
        result['libreoffice_ok'] = conv.returncode == 0 and (path/'amostra.txt').exists()
        result['libreoffice_segundos'] = round(time.monotonic()-start, 2)
        result['apos_libreoffice_mb'] = memory()
        start = time.monotonic()
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                page.set_content('<title>Teste fictício</title><h1>Central SELIC</h1>')
                result['playwright_ok'] = page.title() == 'Teste fictício'
                result['chromium_ativo_mb'] = memory()
                page.set_content('<style>body{font:36px sans-serif}</style><p>PROCESSO 1234/2026</p>')
                image = path/'ocr.png'
                page.screenshot(path=str(image))
            finally:
                browser.close()
        result['playwright_segundos'] = round(time.monotonic()-start, 2)
        ocr = subprocess.run(['tesseract', str(image), 'stdout', '-l', 'por'], capture_output=True, timeout=45)
        result['ocr_ok'] = ocr.returncode == 0 and '1234/2026' in ocr.stdout.decode('utf-8', errors='replace')
        result['apos_ocr_mb'] = memory()
    result['depois_mb'] = memory()
    return result

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            body = json.dumps({'status': 'pronto', 'dados': 'ficticios'}).encode()
        elif self.path == '/testar':
            try:
                body = json.dumps(run_probe()).encode()
            except Exception as exc:
                body = json.dumps({'erro': type(exc).__name__, 'detalhe': str(exc)[:300], 'memoria_mb': memory()}).encode()
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

HTTPServer(('0.0.0.0', int(os.environ.get('PORT', '10000'))), Handler).serve_forever()

