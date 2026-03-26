from collections import defaultdict
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook

from app.core.config import settings
from app.services.workbook_service import get_recent_imports, get_sheet_rows


def monthly_summary() -> dict:
    ledger_rows = get_sheet_rows("Ledger")
    by_category: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    income_vs_expense: dict[str, dict[str, float]] = defaultdict(lambda: {"income": 0.0, "expense": 0.0})

    for row in ledger_rows:
        date = str(row.get("Date") or "")
        month = date[:7] if len(date) >= 7 else "Unknown"
        category = row.get("Category") or "Other"
        debit = float(row.get("Debit") or 0)
        credit = float(row.get("Credit") or 0)

        by_category[month][category] += credit - debit
        income_vs_expense[month]["income"] += credit
        income_vs_expense[month]["expense"] += debit

    return {
        "monthlyByCategory": {month: dict(values) for month, values in by_category.items()},
        "incomeVsExpense": {month: dict(values) for month, values in income_vs_expense.items()},
    }


def export_summary_workbook() -> Path:
    summary = monthly_summary()
    workbook = Workbook()

    by_category_sheet = workbook.active
    by_category_sheet.title = "Monthly By Category"
    by_category_sheet.append(["Month", "Category", "Total"])
    for month, categories in summary["monthlyByCategory"].items():
        for category, total in categories.items():
            by_category_sheet.append([month, category, total])

    income_sheet = workbook.create_sheet("Income vs Expense")
    income_sheet.append(["Month", "Income", "Expense"])
    for month, values in summary["incomeVsExpense"].items():
        income_sheet.append([month, values["income"], values["expense"]])

    export_path = Path(settings.exports_dir) / f"summary_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    workbook.save(export_path)
    return export_path


def overview_summary() -> dict:
    ledger_rows = get_sheet_rows("Ledger")
    receipt_rows = get_sheet_rows("Receipts")
    imports_rows = get_sheet_rows("Imports Log")
    recent_imports = get_recent_imports(limit=8)

    expense_total = sum(float(row.get("Debit") or 0) for row in ledger_rows)
    income_total = sum(float(row.get("Credit") or 0) for row in ledger_rows)
    review_count = sum(1 for row in ledger_rows if str(row.get("Status") or "").lower() == "needs review")
    matched_receipts = sum(1 for row in receipt_rows if row.get("Linked Ledger ID"))

    return {
        "totals": {
            "ledgerEntries": len(ledger_rows),
            "receipts": len(receipt_rows),
            "imports": len(imports_rows),
            "needsReview": review_count,
            "income": round(income_total, 2),
            "expenses": round(expense_total, 2),
            "matchedReceipts": matched_receipts,
        },
        "recentImports": recent_imports,
        "latestMonth": next(iter(monthly_summary()["incomeVsExpense"].keys()), ""),
    }
