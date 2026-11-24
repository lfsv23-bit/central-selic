FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer tesseract-ocr tesseract-ocr-por fonts-liberation && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && python -m playwright install --with-deps chromium
COPY . /app
RUN useradd -m -u 10001 central && mkdir -p /app/data /app/downloads /app/cache && chown -R central:central /app
USER central
CMD ["python", "/app/cloud_entry.py"]
