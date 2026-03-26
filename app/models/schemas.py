from typing import Optional

from pydantic import BaseModel, Field


class StatementRow(BaseModel):
    date: str = ""
    description: str = ""
    category: str = "Other"
    debit: float = 0.0
    credit: float = 0.0
    balance: Optional[float] = None
    source_file: str
    notes: str = ""
    status: str = "Ready"
    confidence: float = Field(default=1.0, ge=0, le=1)
    needs_review: bool = False


class ReceiptRow(BaseModel):
    receipt_id: Optional[str] = None
    date: str = ""
    vendor: str = ""
    amount: float = 0.0
    tax: Optional[float] = None
    linked_ledger_id: str = ""
    source_file: str
    ocr_confidence: float = Field(default=0.0, ge=0, le=1)
    notes: str = ""
    payment_method: str = ""
    status: str = "Ready"
    needs_review: bool = False


class SaveStatementPayload(BaseModel):
    rows: list[StatementRow]


class SaveReceiptPayload(BaseModel):
    rows: list[ReceiptRow]


class SettingsPayload(BaseModel):
    default_categories: list[str]
    currency: str = "ZAR"
    tesseract_cmd: str = ""
    poppler_path: str = ""
    bank_parser: str = "sample_bank"
