import re
from datetime import datetime

from app.models.schemas import StatementRow
from app.parsers.base import BaseStatementParser
from app.services.categorizer_service import guess_category, row_needs_review


DATE_RE = re.compile(
    r"(?P<date>\d{2}[/-]\d{2}[/-]\d{2,4})\s+(?P<desc>.+?)\s+(?P<amount>-?\d[\d,]*\.\d{2})\s+(?P<balance>-?\d[\d,]*\.\d{2})$"
)


def _to_float(value: str) -> float:
    return float(value.replace(",", ""))


def _normalize_date(raw_date: str) -> str:
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y"):
        try:
            return datetime.strptime(raw_date, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return raw_date


class SampleBankStatementParser(BaseStatementParser):
    """
    Starter parser for lines like:
    15/03/2026 Grocery Store -125.90 4200.55
    """

    def parse(self, text: str, source_file: str) -> list[StatementRow]:
        rows: list[StatementRow] = []
        for raw_line in text.splitlines():
            line = " ".join(raw_line.split())
            match = DATE_RE.search(line)
            if not match:
                continue

            amount = _to_float(match.group("amount"))
            balance = _to_float(match.group("balance"))
            debit = abs(amount) if amount < 0 else 0.0
            credit = amount if amount > 0 else 0.0
            description = match.group("desc").strip()
            needs_review = row_needs_review(description, amount)
            rows.append(
                StatementRow(
                    date=_normalize_date(match.group("date")),
                    description=description,
                    category=guess_category(description),
                    debit=round(debit, 2),
                    credit=round(credit, 2),
                    balance=round(balance, 2),
                    source_file=source_file,
                    status="Needs Review" if needs_review else "Ready",
                    confidence=0.55 if needs_review else 0.9,
                    needs_review=needs_review,
                    notes="" if not needs_review else "Check description/date against statement.",
                )
            )
        return rows
