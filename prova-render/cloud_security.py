"""Validação de credenciais Supabase para a futura API da Central.

Este módulo não concede acesso por si só: todas as rotas e trabalhos
assíncronos precisarão chamar a validação e isolar recursos por usuário.
"""
import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from uuid import UUID

SUPABASE_URL = 'https://qjyppukemulithkkqzvy.supabase.co'
SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Gw4hZX0VpqtWEOlMZ_yZRg__tXj0FSt'


class AuthenticationRequired(Exception):
    pass


class AuthenticationUnavailable(Exception):
    pass


@dataclass(frozen=True)
class Identity:
    user_id: str


def authenticate(authorization, opener=urllib.request.urlopen):
    """Valida o token no Supabase Auth; nunca confia em JWT apenas decodificado."""
    if not isinstance(authorization, str) or not authorization.startswith('Bearer '):
        raise AuthenticationRequired('Entre na Central para continuar.')
    token = authorization[7:].strip()
    if not token or len(token) > 8192 or any(ch.isspace() for ch in token):
        raise AuthenticationRequired('Sessão inválida. Entre novamente.')
    req = urllib.request.Request(
        SUPABASE_URL + '/auth/v1/user',
        headers={'apikey': SUPABASE_PUBLISHABLE_KEY, 'Authorization': 'Bearer ' + token,
                 'Accept': 'application/json'},
    )
    try:
        with opener(req, timeout=10) as response:
            raw = response.read(65537)
        if len(raw) > 65536:
            raise AuthenticationUnavailable('Resposta de autenticação inválida.')
        data = json.loads(raw)
        user_id = str(UUID(data['id']))
        if data.get('is_anonymous') is True:
            raise AuthenticationRequired('Sessão não autorizada.')
        return Identity(user_id=user_id)
    except urllib.error.HTTPError as exc:
        if exc.code in (400, 401, 403):
            raise AuthenticationRequired('Sessão inválida ou expirada. Entre novamente.') from exc
        raise AuthenticationUnavailable('Não foi possível validar o acesso agora.') from exc
    except AuthenticationRequired:
        raise
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        raise AuthenticationUnavailable('Não foi possível validar o acesso agora.') from exc
