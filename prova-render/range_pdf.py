"""Leitura limitada de PDFs públicos por trechos, para prévias de poucas páginas."""
import io
import re
import urllib.request
import https_client


class RangeUnavailable(OSError):
    pass


class RangePDF(io.RawIOBase):
    BLOCK = 1024 * 1024
    MAX_BYTES = 80 * 1024 * 1024

    def __init__(self, url):
        super().__init__()
        self.url = url
        self.position = 0
        self.blocks = {}
        self.size = None
        self.error = None
        self._fetch(0)

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.position

    def seek(self, offset, whence=io.SEEK_SET):
        if whence == io.SEEK_CUR: offset += self.position
        elif whence == io.SEEK_END: offset += self.size
        elif whence != io.SEEK_SET: raise ValueError('Posição inválida.')
        if offset < 0: raise ValueError('Posição inválida.')
        self.position = offset
        return offset

    def _fetch(self, index):
        start = index * self.BLOCK
        end = start + self.BLOCK - 1
        if self.size is not None: end = min(end, self.size - 1)
        req = urllib.request.Request(self.url, headers={'Range': f'bytes={start}-{end}',
                                     'Accept-Encoding': 'identity', 'User-Agent': 'Mozilla/5.0'})
        with https_client.urlopen(req, timeout=30) as response:
            match = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', response.headers.get('Content-Range', ''))
            if response.status != 206 or not match:
                raise RangeUnavailable('O jornal não permite leitura por partes.')
            first, last, total = map(int, match.groups())
            if first != start or last != min(end, total - 1) or total > self.MAX_BYTES or (self.size is not None and self.size != total):
                raise RangeUnavailable('Resposta incompleta do jornal.')
            data = response.read(last - first + 2)
        if len(data) != last - first + 1:
            raise RangeUnavailable('Trecho incompleto do jornal.')
        self.size = total
        self.blocks[index] = data

    def read(self, size=-1):
        if size is None or size < 0: size = self.size - self.position
        remaining = min(size, max(0, self.size - self.position))
        result = bytearray()
        while remaining:
            index, offset = divmod(self.position, self.BLOCK)
            if index not in self.blocks: self._fetch(index)
            chunk = self.blocks[index][offset:offset + remaining]
            if not chunk: raise RangeUnavailable('Trecho vazio do jornal.')
            result.extend(chunk)
            self.position += len(chunk)
            remaining -= len(chunk)
        return bytes(result)

    def readinto(self, buffer):
        try:
            if self.error is not None: raise self.error
            data = self.read(len(buffer))
            buffer[:len(data)] = data
            return len(data)
        except Exception as exc:
            # O PDFium chama este método por ctypes; exceções não atravessam
            # esse limite. Preserve a falha para reportá-la fora do callback.
            self.error = exc
            buffer[:] = bytes(len(buffer))
            return 0
