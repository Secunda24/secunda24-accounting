import shutil
import re
from io import BytesIO
from pathlib import Path

import fitz
import pdfplumber
import pytesseract
from PIL import Image

from app.core.config import settings


def configure_ocr_tools() -> None:
    if settings.tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd


def ensure_tesseract_available() -> None:
    configure_ocr_tools()
    resolved = settings.tesseract_cmd or shutil.which("tesseract")
    if not resolved:
        raise ValueError(
            "Tesseract OCR is not installed yet. Install it, then set the path in Settings or data/settings.json."
        )


def _average_confidence(data: dict) -> float:
    scores: list[float] = []
    for idx, word in enumerate(data["text"]):
        clean = word.strip()
        if clean:
            try:
                conf = float(data["conf"][idx])
                if conf >= 0:
                    scores.append(conf)
            except (ValueError, TypeError):
                continue
    return round((sum(scores) / len(scores) / 100), 2) if scores else 0.0


def _text_looks_garbled(text: str) -> bool:
    if not text.strip():
        return True

    mojibake_hits = sum(text.count(marker) for marker in ("â", "Ã", "Â", "Æ", "€", "™"))
    replacement_hits = text.count("?")
    date_hits = len(re.findall(r"\b\d{2}/\d{2}/\d{2,4}\b|\b\d{2}-\d{2}-\d{2,4}\b", text))
    ascii_words = len(re.findall(r"\b[A-Za-z]{3,}\b", text))
    return mojibake_hits >= 10 or replacement_hits >= 40 or (date_hits < 2 and ascii_words < 20)


def extract_text_from_image(image_path: Path) -> tuple[str, float]:
    ensure_tesseract_available()
    image = Image.open(image_path)
    text = pytesseract.image_to_string(image, config="--psm 6")
    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT, config="--psm 6")
    confidence = _average_confidence(data)
    return text.strip(), confidence


def _ocr_pdf_with_fitz(pdf_path: Path) -> tuple[str, float]:
    ensure_tesseract_available()

    document = fitz.open(pdf_path)
    ocr_pages: list[str] = []
    scores: list[float] = []
    try:
        for page in document:
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            image = Image.open(BytesIO(pixmap.tobytes("png")))
            page_text = pytesseract.image_to_string(image, config="--psm 6")
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT, config="--psm 6")
            ocr_pages.append(page_text.strip())
            confidence = _average_confidence(data)
            if confidence > 0:
                scores.append(confidence * 100)
    finally:
        document.close()

    confidence = round((sum(scores) / len(scores) / 100), 2) if scores else 0.0
    return "\n".join(ocr_pages).strip(), confidence


def extract_text_from_pdf(pdf_path: Path) -> tuple[str, float]:
    configure_ocr_tools()
    text_chunks: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                text_chunks.append(page_text)

    plain_text = "\n".join(text_chunks).strip()
    if plain_text and not _text_looks_garbled(plain_text):
        return plain_text, 1.0

    return _ocr_pdf_with_fitz(pdf_path)


def extract_text(file_path: Path) -> tuple[str, float]:
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        return extract_text_from_pdf(file_path)
    if suffix in {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"}:
        return extract_text_from_image(file_path)
    raise ValueError(f"Unsupported file type: {suffix}")
