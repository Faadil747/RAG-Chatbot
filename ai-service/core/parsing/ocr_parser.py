"""
OCR fallback for scanned resumes (image-only PDFs, or PDFs where direct text
extraction yields near-empty output).

Uses pytesseract + pdf2image, which are lighter-weight dependencies than a
full PaddleOCR install (no native build toolchain required). If a stronger
OCR engine is preferred later, PaddleOCR is a drop-in swap for the
`_ocr_image` function below -- everything else in this module (the
pdf2image page-rasterization + text-length trigger logic in text_extractor)
stays the same.

If the `tesseract` binary is not installed on the host, pytesseract raises
`TesseractNotFoundError`. We catch that (and any other OCR failure), log a
warning, and return an empty string rather than crashing the request --
callers should treat an empty OCR result the same as "could not extract
text" and surface that to the caller instead of 500ing.
"""
from __future__ import annotations

import logging

logger = logging.getLogger("ai-service.parsing.ocr")


def _ocr_image(image) -> str:
    import pytesseract

    return pytesseract.image_to_string(image)


def extract_text_via_ocr(file_bytes: bytes, *, dpi: int = 200) -> str:
    """Rasterize a PDF's pages to images and OCR each one. Returns "" on any failure."""
    try:
        from pdf2image import convert_from_bytes
    except Exception:
        logger.warning("pdf2image is not available; cannot run OCR fallback.")
        return ""

    try:
        images = convert_from_bytes(file_bytes, dpi=dpi)
    except Exception:
        logger.exception(
            "pdf2image failed to rasterize the PDF (is poppler installed on this host?)."
        )
        return ""

    text_chunks: list[str] = []
    for image in images:
        try:
            text_chunks.append(_ocr_image(image))
        except Exception as exc:
            logger.warning(
                "Tesseract OCR failed (is the `tesseract` binary installed on this host?): %s",
                exc,
            )
            return ""

    return "\n".join(text_chunks).strip()
