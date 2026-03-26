import re
from datetime import datetime

from app.models.schemas import StatementRow
from app.parsers.base import BaseStatementParser
from app.services.categorizer_service import guess_category, row_needs_review


START_RE = re.compile(r"^(?P<post>\d{2}/\d{2}/\d{2})\s+(?P<trans>\d{2}/\d{2}/\d{2})\s+(?P<body>.+)$")
AMOUNT_RE = re.compile(r"[+-]\s?\d[\d\s]*\.\d{2}")
IGNORE_MARKERS = (
    "capitec bank",
    "account type",
    "statement no.",
    "page:",
    "post trans. description",
    "balance brought forward",
    "interest rate",
    "statements are accepted",
    "client care centre",
    "business banking",
    "telephone no.",
    "vat reg.",
    "contact",
)


def _normalize_date(value: str) -> str:
    return datetime.strptime(value, "%d/%m/%y").strftime("%Y-%m-%d")


def _clean_amount(token: str) -> float:
    cleaned = (
        token.replace(" ", "")
        .replace(",", "")
        .replace("'", "")
        .replace(":", "")
        .replace(")", "")
        .replace("(", "")
    )
    return float(cleaned)


def _clean_description(text: str) -> str:
    cleaned = " ".join(text.replace("A UTH", "AUTH").replace("AU TH", "AUTH").split())
    return cleaned.strip(" -")


def _should_ignore(line: str) -> bool:
    lowered = line.lower()
    return not lowered or any(marker in lowered for marker in IGNORE_MARKERS)


def _build_row(buffer: list[str], source_file: str) -> StatementRow | None:
    combined = _clean_description(" ".join(buffer))
    match = START_RE.match(combined)
    if not match:
        return None

    body = match.group("body")
    amount_matches = list(AMOUNT_RE.finditer(body))
    if len(amount_matches) < 2:
        return None

    description = _clean_description(body[: amount_matches[0].start()])
    if not description:
        return None

    amounts = [_clean_amount(item.group()) for item in amount_matches]
    balance = round(amounts[-1], 2)
    transaction_amount = round(sum(amounts[:-1]), 2)

    debit = abs(transaction_amount) if transaction_amount < 0 else 0.0
    credit = transaction_amount if transaction_amount > 0 else 0.0
    multi_part_amount = len(amounts) > 2
    needs_review = row_needs_review(description, transaction_amount) or multi_part_amount

    note = ""
    if multi_part_amount:
        note = "Multiple amount parts detected. Check fees/amount split."

    return StatementRow(
        date=_normalize_date(match.group("post")),
        description=description,
        category=guess_category(description),
        debit=round(debit, 2),
        credit=round(credit, 2),
        balance=balance,
        source_file=source_file,
        status="Needs Review" if needs_review else "Ready",
        confidence=0.7 if needs_review else 0.92,
        needs_review=needs_review,
        notes=note,
    )


class CapitecBusinessStatementParser(BaseStatementParser):
    """
    Parser for Capitec business statements with columns like:
    Post Date | Trans Date | Description | Fees | Amount | Balance
    """

    def parse(self, text: str, source_file: str) -> list[StatementRow]:
        rows: list[StatementRow] = []
        current: list[str] = []

        for raw_line in text.splitlines():
            line = " ".join(raw_line.split())
            if not line:
                continue

            if START_RE.match(line):
                if current:
                    row = _build_row(current, source_file)
                    if row:
                        rows.append(row)
                current = [line]
                continue

            if current and not _should_ignore(line):
                current.append(line)

        if current:
            row = _build_row(current, source_file)
            if row:
                rows.append(row)

        return rows
