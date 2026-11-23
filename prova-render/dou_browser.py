"""Consulta pública do DOU em uma sessão isolada do navegador, sem contornar desafios."""
from datetime import datetime
import re
import threading
from urllib.parse import urlparse, parse_qs
import sources

LOCK = threading.Lock()


def certified_url(url):
    parsed = urlparse((url or '').strip())
    if (parsed.scheme not in ('http', 'https') or parsed.hostname != 'pesquisa.in.gov.br'
            or parsed.username or parsed.password or parsed.port not in (None, 80, 443)
            or parsed.path != '/imprensa/jsp/visualiza/index.jsp'):
        raise ValueError('Link certificado fora do portal oficial.')
    # O artigo ainda fornece HTTP; somente os metadados são lidos dele.
    # O PDF e o link armazenado sempre usam HTTPS.
    return parsed._replace(scheme='https', netloc='pesquisa.in.gov.br').geturl()


def certified_metadata(url):
    parsed = urlparse(certified_url(url))
    query = parse_qs(parsed.query)
    when = datetime.strptime(query['data'][0], '%d/%m/%Y').date().isoformat()
    section = {'515': '1', '529': '2', '530': '3'}[query['jornal'][0]]
    page = int(query['pagina'][0])
    if not 1 <= page <= 10000:
        raise ValueError('Página certificada inválida.')
    return when, page, section


def search(params, fetch, classify, progress):
    rows = {}; notes = []
    if not LOCK.acquire(timeout=5):
        return [], ['União: outra consulta está em andamento. Tente novamente ou use a consulta manual.']
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                context = browser.new_context()
                page = context.new_page()
                page.set_default_timeout(20000)
                progress('União: pesquisando no portal oficial…')
                page.goto(sources.dou_link(params), wait_until='domcontentloaded', timeout=45000)
                page.wait_for_function("() => /\\d+\\s+resultados?\\s+para|Nenhum resultado/i.test(document.body.innerText)")
                text = page.locator('body').inner_text()
                count = re.search(r'(\d+)\s+resultados?\s+para', text, re.I)
                links = page.locator('a[href*="/web/dou/-/"]').evaluate_all('(els) => els.map(e => e.href)')
                links = list(dict.fromkeys(url for url in links if urlparse(url).hostname == 'www.in.gov.br'))
                if count and int(count[1]) > len(links):
                    notes.append('União: consulta parcial; há outras páginas no portal. Use a pesquisa oficial para conferir os demais resultados.')
                for url in links[:20]:
                    try:
                        page.goto(url, wait_until='domcontentloaded', timeout=30000)
                        article = page.locator('#materia').inner_text()
                        code = params.get('esfinge', '')
                        if code and not re.search(r'(?<![A-Z0-9])'+re.escape(code)+r'(?![A-Z0-9])', article.upper()):
                            continue
                        certified = certified_url(page.locator('#versao-certificada').get_attribute('href'))
                        when, printed_page, section = certified_metadata(certified)
                        if not params['start'] <= when <= params['end']:
                            continue
                        candidate = sources.result('uniao', 'DOU', when, printed_page, article, url, params, classify)
                        if not code and candidate['reasons'] == ['Resultado aproximado do Diário']:
                            continue
                        progress('União: obtendo página certificada…')
                        row = sources.import_dou(when, printed_page, section, params, fetch, classify)
                        if code and 'Código e-Sfinge' not in row['reasons']:
                            notes.append('União: o código foi encontrado no artigo, mas não pôde ser confirmado no PDF. Confira pela consulta manual.')
                            continue
                        row.update(article_url=url, certified_url=certified)
                        rows[row['id']] = row
                    except Exception as exc:
                        notes.append('União: não foi possível importar uma publicação: '+str(exc)[:250])
                if len(links) > 20:
                    notes.append('União: limite de 20 artigos por consulta atingido.')
            finally:
                browser.close()
    except PermissionError:
        notes.append('União: consulta automática indisponível porque não foi possível iniciar o navegador no servidor. A consulta manual continua disponível.')
    except Exception as exc:
        notes.append('União: consulta automática indisponível. Use a pesquisa oficial e adicione a página certificada manualmente. Detalhe: '+str(exc)[:250])
    finally:
        LOCK.release()
    return list(rows.values()), notes


