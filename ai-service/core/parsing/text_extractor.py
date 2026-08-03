"""
Orchestrates raw-text extraction from an uploaded resume file, dispatching
by extension and falling back to OCR when direct extraction yields
near-empty text (i.e. the document is a scanned image).
"""
from __future__ import annotations

import logging

from core.parsing.docx_parser import extract_docx_text
from core.parsing.ocr_parser import extract_text_via_ocr
from core.parsing.pdf_parser import extract_pdf_text

logger = logging.getLogger("ai-service.parsing.text_extractor")

MIN_TEXT_LENGTH = 50  # below this, treat direct extraction as "failed" -> try OCR


class UnsupportedFileTypeError(Exception):
    pass


def extract_raw_text(filename: str, file_bytes: bytes) -> str:
    """Extract raw text from a resume file. Raises UnsupportedFileTypeError
    for extensions we don't handle. Never raises for OCR-only failures --
    those degrade to an empty string, which the caller should surface as a
    clear 4xx to the backend rather than a crash."""
    lower = (filename or "").lower()

    if lower.endswith(".pdf"):
        text = extract_pdf_text(file_bytes)
        if len(text.strip()) < MIN_TEXT_LENGTH:
            logger.info(
                "Direct PDF extraction yielded <%d chars; falling back to OCR.",
                MIN_TEXT_LENGTH,
            )
            ocr_text = extract_text_via_ocr(file_bytes)
            if len(ocr_text.strip()) > len(text.strip()):
                return ocr_text
        return text

    if lower.endswith(".docx") or lower.endswith(".doc"):
        text = extract_docx_text(file_bytes)
        return text

    raise UnsupportedFileTypeError(
        f"Unsupported file type for '{filename}'. Supported: .pdf, .docx, .doc"
    )
