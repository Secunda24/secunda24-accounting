from app.models.schemas import ReceiptRow


def match_receipt_to_ledger(receipt: ReceiptRow, ledger_rows: list[dict]) -> tuple[str, str]:
    for row in ledger_rows:
        same_date = row.get("Date") == receipt.date
        same_amount = float(row.get("Debit") or 0) == receipt.amount or float(row.get("Credit") or 0) == receipt.amount
        if same_date and same_amount:
            return str(row.get("ID") or ""), "Matched automatically by date and amount."
    return "", ""
