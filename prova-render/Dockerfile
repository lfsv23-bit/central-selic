FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer fonts-liberation tesseract-ocr tesseract-ocr-por && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir playwright==1.58.0 && python -m playwright install --with-deps chromium
COPY probe.py /app/probe.py
RUN useradd -m -u 10001 tester
USER tester
CMD ["python", "/app/probe.py"]

