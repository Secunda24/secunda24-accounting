import json
import os
from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]
CONFIG_PATH = BASE_DIR / "data" / "settings.json"


def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


APP_NAME = os.getenv("BOOKKEEPING_APP_NAME", "Personal Bookkeeping App").strip() or "Personal Bookkeeping App"
PUBLIC_DEMO_MODE = _env_flag("BOOKKEEPING_PUBLIC_DEMO_MODE", False)
DEMO_ALLOW_EXPORTS = _env_flag("BOOKKEEPING_DEMO_ALLOW_EXPORTS", False)
DEMO_CONTACT_URL = os.getenv("BOOKKEEPING_CONTACT_URL", "").strip()

DEFAULT_SETTINGS = {
    "workbook_path": str(BASE_DIR / "data" / "bookkeeping_ledger.xlsx"),
    "exports_dir": str(BASE_DIR / "exports"),
    "uploads_dir": str(BASE_DIR / "uploads"),
    "frontend_dir": str(BASE_DIR / "frontend"),
    "tesseract_cmd": "",
    "poppler_path": "",
    "default_categories": [
        "Groceries",
        "Transport",
        "Utilities",
        "Entertainment",
        "Medical",
        "Salary/Income",
        "Transfer",
        "Cash Withdrawal",
        "Other",
    ],
    "currency": "ZAR",
    "bank_parser": "sample_bank",
}


def ensure_settings_file() -> dict:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not CONFIG_PATH.exists():
        CONFIG_PATH.write_text(json.dumps(DEFAULT_SETTINGS, indent=2), encoding="utf-8")
        return DEFAULT_SETTINGS

    raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    merged = {**DEFAULT_SETTINGS, **raw}
    if merged != raw:
        CONFIG_PATH.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    return merged


@dataclass
class Settings:
    workbook_path: str
    exports_dir: str
    uploads_dir: str
    frontend_dir: str
    tesseract_cmd: str
    poppler_path: str
    default_categories: list[str]
    currency: str
    bank_parser: str


def _build_settings(data: dict) -> Settings:
    return Settings(**data)


settings = _build_settings(ensure_settings_file())


def get_settings_dict() -> dict:
    return {
        "workbook_path": settings.workbook_path,
        "exports_dir": settings.exports_dir,
        "uploads_dir": settings.uploads_dir,
        "frontend_dir": settings.frontend_dir,
        "tesseract_cmd": settings.tesseract_cmd,
        "poppler_path": settings.poppler_path,
        "default_categories": list(settings.default_categories),
        "currency": settings.currency,
        "bank_parser": settings.bank_parser,
    }


def save_settings(updated_values: dict) -> Settings:
    current = get_settings_dict()
    merged = {**current, **updated_values}
    CONFIG_PATH.write_text(json.dumps(merged, indent=2), encoding="utf-8")

    new_settings = _build_settings(merged)
    settings.workbook_path = new_settings.workbook_path
    settings.exports_dir = new_settings.exports_dir
    settings.uploads_dir = new_settings.uploads_dir
    settings.frontend_dir = new_settings.frontend_dir
    settings.tesseract_cmd = new_settings.tesseract_cmd
    settings.poppler_path = new_settings.poppler_path
    settings.default_categories = new_settings.default_categories
    settings.currency = new_settings.currency
    settings.bank_parser = new_settings.bank_parser
    return settings
