from app.core.config import settings
from app.models.schemas import ReceiptRow, StatementRow
from app.parsers.capitec_business import CapitecBusinessStatementParser
from app.parsers.receipt_parser import SimpleReceiptParser
from app.parsers.sample_bank import SampleBankStatementParser


def parse_statement_text(text: str, source_file: str) -> list[StatementRow]:
    lowered = text.lower()
    if "capitec bank" in lowered or "capitec business acc" in lowered:
        return CapitecBusinessStatementParser().parse(text, source_file)
    if settings.bank_parser == "sample_bank":
        return SampleBankStatementParser().parse(text, source_file)
    return SampleBankStatementParser().parse(text, source_file)


def parse_receipt_text(text: str, source_file: str, confidence: float) -> list[ReceiptRow]:
    return SimpleReceiptParser().parse(text, source_file, confidence)
