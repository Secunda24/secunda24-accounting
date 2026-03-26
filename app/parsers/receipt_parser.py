import re
from datetime import datetime

from app.models.schemas import ReceiptRow
from app.parsers.base import BaseReceiptParser


AMOUNT_RE = re.compile(r"(?i)(total|amount due|grand total)\D{0,10}(\d[\d,]*\.\d{2})")
TAX_RE = re.compile(r"(?i)(vat|tax)\D{0,10}(\d[\d,]*\.\d{2})")
PAYMENT_RE = re.compile(r"(?i)(visa|mastercard|cash|eft|debit|credit|card)")
DATE_PATTERNS = ["%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%y"]


def _search_amount(pattern: re.Pattern[str], text: str) -> float | None:
    match = pattern.search(text)
    if not match:
        return None
    return float(match.group(2).replace(",", ""))


def _extract_date(text: str) -> str:
    tokens = re.findall(r"\d{2}[/-]\d{2}[/-]\d{2,4}|\d{4}[/-]\d{2}[/-]\d{2}", text)
    for token in tokens:
        for fmt in DATE_PATTERNS:
            try:
                return datetime.strptime(token, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
    return ""


class SimpleReceiptParser(BaseReceiptParser):
    def parse(self, text: str, source_file: str, confidence: float) -> list[ReceiptRow]:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        vendor = lines[0] if lines else ""
        amount = _search_amount(AMOUNT_RE, text) or 0.0
        tax = _search_amount(TAX_RE, text)
        date = _extract_date(text)
        payment_match = PAYMENT_RE.search(text)
        payment_method = payment_match.group(1).title() if payment_match else ""
        needs_review = confidence < 0.65 or not vendor or amount <= 0
        return [
            ReceiptRow(
                date=date,
                vendor=vendor[:120],
                amount=round(amount, 2),
                tax=round(tax, 2) if tax is not None else None,
                linked_ledger_id="",
                source_file=source_file,
                ocr_confidence=confidence,
                notes="" if not needs_review else "Check OCR fields before saving.",
                payment_method=payment_method,
                status="Needs Review" if needs_review else "Ready",
                needs_review=needs_review,
            )
        ]
