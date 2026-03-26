from __future__ import annotations

import json
from collections import defaultdict
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import APP_NAME, BASE_DIR, DEMO_CONTACT_URL


DEMO_DATA_PATH = BASE_DIR / "data" / "bookkeeping_demo_data.json"
DEMO_WORKBOOK_LABEL = "Public demo sandbox (browser-only session)"


@lru_cache(maxsize=1)
def load_demo_dataset() -> dict[str, Any]:
    if not DEMO_DATA_PATH.exists():
        return {
            "settings": {
                "currency": "ZAR",
                "bank_parser": "sample_bank",
                "default_categories": ["Other"],
            },
            "ledger": [],
            "receipts": [],
            "imports_log": [],
            "demo_statement": {"rows": [], "preview_url": "", "file_name": "", "confidence": 1.0, "message": ""},
            "demo_receipt": {"rows": [], "preview_url": "", "file_name": "", "confidence": 1.0, "message": ""},
        }
    return json.loads(DEMO_DATA_PATH.read_text(encoding="utf-8"))


def _deepcopy_list(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return deepcopy(items)


def _settings_payload() -> dict[str, Any]:
    demo_settings = load_demo_dataset().get("settings") or {}
    categories = demo_settings.get("default_categories") or ["Other"]
    return {
        "categories": list(categories),
        "workbookPath": DEMO_WORKBOOK_LABEL,
        "currency": demo_settings.get("currency") or "ZAR",
        "tesseractCmd": "",
        "popplerPath": "",
        "bankParser": demo_settings.get("bank_parser") or "sample_bank",
        "defaultCategories": list(categories),
    }


def demo_app_config() -> dict[str, Any]:
    return {
        "appName": f"{APP_NAME} Demo",
        "publicDemoMode": True,
        "allowRealUploads": False,
        "allowPersistentSave": False,
        "allowSettingsEdit": False,
        "allowOpenLedger": False,
        "allowExports": False,
        "demoNotice": (
            "Public demo mode is on. Visitors can explore the full workflow with sample bookkeeping data, "
            "but real uploads, settings changes, exports, and permanent saves are disabled."
        ),
        "contactUrl": DEMO_CONTACT_URL,
        "workbookLabel": DEMO_WORKBOOK_LABEL,
    }


def bootstrap_payload() -> dict[str, Any]:
    dataset = load_demo_dataset()
    ledger = _deepcopy_list(dataset.get("ledger") or [])
    receipts = _deepcopy_list(dataset.get("receipts") or [])
    imports_log = _deepcopy_list(dataset.get("imports_log") or [])

    return {
        "config": demo_app_config(),
        "settings": _settings_payload(),
        "ledger": ledger,
        "receipts": receipts,
        "importsLog": imports_log,
        "overview": overview_from_rows(ledger, receipts, imports_log),
        "reports": reports_from_rows(ledger),
        "demoStatement": statement_demo_payload(),
        "demoReceipt": receipt_demo_payload(),
    }


def statement_demo_payload() -> dict[str, Any]:
    dataset = load_demo_dataset().get("demo_statement") or {}
    return {
        "rows": _deepcopy_list(dataset.get("rows") or []),
        "message": dataset.get("message") or "Demo statement loaded.",
        "confidence": dataset.get("confidence") or 1.0,
        "previewUrl": dataset.get("preview_url") or "",
        "fileName": dataset.get("file_name") or "demo_statement.pdf",
    }


def receipt_demo_payload() -> dict[str, Any]:
    dataset = load_demo_dataset().get("demo_receipt") or {}
    return {
        "rows": _deepcopy_list(dataset.get("rows") or []),
        "message": dataset.get("message") or "Demo receipt loaded.",
        "confidence": dataset.get("confidence") or 1.0,
        "previewUrl": dataset.get("preview_url") or "",
        "fileName": dataset.get("file_name") or "demo_receipt.jpg",
    }


def demo_ledger_rows(filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    filters = filters or {}
    rows = _deepcopy_list(load_demo_dataset().get("ledger") or [])
    filtered: list[dict[str, Any]] = []

    for row in rows:
        row_date = str(row.get("Date") or "")
        if filters.get("date_from") and row_date and row_date < str(filters["date_from"]):
            continue
        if filters.get("date_to") and row_date and row_date > str(filters["date_to"]):
            continue
        if filters.get("category") and row.get("Category") != filters["category"]:
            continue
        if filters.get("source") and row.get("Source Type") != filters["source"]:
            continue

        amount = max(float(row.get("Debit") or 0), float(row.get("Credit") or 0))
        if filters.get("min_amount") not in (None, "") and amount < float(filters["min_amount"]):
            continue
        if filters.get("max_amount") not in (None, "") and amount > float(filters["max_amount"]):
            continue

        filtered.append(row)

    return filtered


def demo_receipt_rows() -> list[dict[str, Any]]:
    return _deepcopy_list(load_demo_dataset().get("receipts") or [])


def demo_imports_log(limit: int | None = None) -> list[dict[str, Any]]:
    rows = _deepcopy_list(load_demo_dataset().get("imports_log") or [])
    if limit:
        return list(reversed(rows))[:limit]
    return rows


def reports_from_rows(ledger_rows: list[dict[str, Any]]) -> dict[str, Any]:
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


def overview_from_rows(
    ledger_rows: list[dict[str, Any]],
    receipt_rows: list[dict[str, Any]],
    imports_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    expense_total = sum(float(row.get("Debit") or 0) for row in ledger_rows)
    income_total = sum(float(row.get("Credit") or 0) for row in ledger_rows)
    review_count = sum(1 for row in ledger_rows if str(row.get("Status") or "").lower() == "needs review")
    matched_receipts = sum(1 for row in receipt_rows if row.get("Linked Ledger ID"))

    reports = reports_from_rows(ledger_rows)
    latest_month = next(iter(reports["incomeVsExpense"].keys()), "")

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
        "recentImports": list(reversed(imports_rows))[:8],
        "latestMonth": latest_month,
    }
