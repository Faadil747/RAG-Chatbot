"""
PDF text extraction. PyMuPDF (fitz) is the primary engine (fast, handles
most layouts well); pdfplumber is used as a fallback for table-heavy or
otherwise awkward documents where PyMuPDF returns little/garbled text.

Both are imported lazily (inside the functions that use them, not at module
level) so a process that never handles a PDF upload -- e.g. one only serving
/ai/health or /ai/search traffic -- never pays for loading them into memory.
This matters on memory-constrained deployments (a 512MB container) where
every eagerly-imported heavy library at startup competes with the embedding
model for the same budget.
"""
from __future__ import annotations

import logging

logger = logging.getLogger("ai-service.parsing.pdf")


def extract_text_pymupdf(file_bytes: bytes) -> str:
    import fitz  # PyMuPDF

    text_chunks: list[str] = []
    try:
        with fitz.open(stream=file_bytes, filetype="pdf") as doc:
            for page in doc:
                text_chunks.append(page.get_text("text"))
    except Exception:
        logger.exception("PyMuPDF extraction failed")
        return ""
    return "\n".join(text_chunks).strip()


def extract_text_pdfplumber(file_bytes: bytes) -> str:
    import io

    import pdfplumber

    text_chunks: list[str] = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                text_chunks.append(page_text)
                # Also pull table contents, which extract_text() often misses.
                for table in page.extract_tables() or []:
                    for row in table:
                        cells = [c for c in row if c]
                        if cells:
                            text_chunks.append(" | ".join(cells))
    except Exception:
        logger.exception("pdfplumber extraction failed")
        return ""
    return "\n".join(text_chunks).strip()


def extract_pdf_text(file_bytes: bytes) -> str:
    """Primary + fallback PDF extraction. Returns "" if both engines fail."""
    text = extract_text_pymupdf(file_bytes)
    if len(text.strip()) >= 50:
        return text

    logger.info("PyMuPDF yielded near-empty text; trying pdfplumber fallback.")
    fallback_text = extract_text_pdfplumber(file_bytes)
    if len(fallback_text.strip()) > len(text.strip()):
        return fallback_text
    return text
