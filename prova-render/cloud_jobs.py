"""Controle isolado de tarefas temporárias para a API online.

Nenhum trabalho é recuperado por identificador sem também conferir o dono.
Resultados expiram para evitar consumo indefinido de memória.
"""
import threading
import time
import uuid


class JobUnavailable(Exception):
    pass


class JobLimitReached(Exception):
    pass


class JobStore:
    def __init__(self, limit=3, ttl=3600, clock=time.monotonic):
        self._limit = limit
        self._ttl = ttl
        self._clock = clock
        self._lock = threading.RLock()
        self._jobs = {}

    def _prune(self):
        now = self._clock()
        expired = [key for key, job in self._jobs.items()
                   if job['status'] != 'running' and now - job['_updated'] > self._ttl]
        for key in expired:
            del self._jobs[key]

    def create(self, owner, **values):
        if not owner:
            raise ValueError('O usuário é obrigatório.')
        with self._lock:
            self._prune()
            if sum(job['status'] == 'running' for job in self._jobs.values()) >= self._limit:
                raise JobLimitReached('Aguarde as tarefas em andamento.')
            job_id = uuid.uuid4().hex
            self._jobs[job_id] = {**values, 'status': 'running', '_owner': owner,
                                  '_updated': self._clock()}
            return job_id

    def get(self, owner, job_id):
        with self._lock:
            self._prune()
            job = self._jobs.get(job_id)
            if not job or job['_owner'] != owner:
                raise JobUnavailable('Pesquisa não encontrada.')
            return {key: value for key, value in job.items() if not key.startswith('_')}

    def update(self, owner, job_id, **values):
        if any(key.startswith('_') for key in values):
            raise ValueError('Campo reservado.')
        with self._lock:
            job = self._jobs.get(job_id)
            if not job or job['_owner'] != owner:
                raise JobUnavailable('Pesquisa não encontrada.')
            job.update(values)
            job['_updated'] = self._clock()

