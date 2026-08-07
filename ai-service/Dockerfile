FROM python:3.11-slim

# System dependencies:
#   tesseract-ocr  -> required by pytesseract for OCR fallback on scanned resumes
#   poppler-utils  -> required by pdf2image to rasterize PDF pages for OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data

EXPOSE 8000

# Shell form (not exec/JSON-array form) so $PORT is actually substituted at
# container start -- Render (and most PaaS platforms) inject their own PORT
# value and scan for THAT port, regardless of what's in .env or EXPOSE.
# Defaults to 8000 to match local/docker-compose usage when PORT is unset.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
