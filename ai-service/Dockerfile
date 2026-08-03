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

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
