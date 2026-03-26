import os
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from app.core.config import APP_NAME, PUBLIC_DEMO_MODE, get_settings_dict, save_settings, settings
from app.models.schemas import SaveReceiptPayload, SaveStatementPayload, SettingsPayload
from app.services.categorizer_service import available_categories
from app.services.demo_service import (
    bootstrap_payload,
    demo_app_config,
    demo_imports_log,
    demo_ledger_rows,
    demo_receipt_rows,
    receipt_demo_payload,
    reports_from_rows,
    statement_demo_payload,
)
from app.services.file_service import save_upload
from app.services.match_service import match_receipt_to_ledger
from app.services.parser_service import parse_receipt_text, parse_statement_text
from app.services.report_service import export_summary_workbook, monthly_summary, overview_summary
from app.services.workbook_service import (
    append_receipt_rows,
    append_statement_rows,
    export_workbook_copy,
    filter_ledger,
    get_sheet_rows,
    log_import,
    sync_settings_sheet,
)


router = APIRouter()


@router.get("/health")
def health_check() -> dict:
    return {"status": "ok", "mode": "demo" if PUBLIC_DEMO_MODE else "local"}


@router.get("/app-config")
def get_app_config() -> dict:
    if PUBLIC_DEMO_MODE:
        return demo_app_config()
    return {
        "appName": APP_NAME,
        "publicDemoMode": False,
        "allowRealUploads": True,
        "allowPersistentSave": True,
        "allowSettingsEdit": True,
        "allowOpenLedger": True,
        "allowExports": True,
        "demoNotice": "",
        "contactUrl": "",
        "workbookLabel": settings.workbook_path,
    }


@router.get("/demo/bootstrap")
def get_demo_bootstrap() -> dict:
    if not PUBLIC_DEMO_MODE:
        raise HTTPException(status_code=404, detail="Demo mode is not enabled.")
    return bootstrap_payload()


@router.get("/demo/statement")
def get_demo_statement() -> dict:
    if not PUBLIC_DEMO_MODE:
        raise HTTPException(status_code=404, detail="Demo mode is not enabled.")
    return statement_demo_payload()


@router.get("/demo/receipt")
def get_demo_receipt() -> dict:
    if not PUBLIC_DEMO_MODE:
        raise HTTPException(status_code=404, detail="Demo mode is not enabled.")
    return receipt_demo_payload()


@router.get("/settings")
def get_settings() -> dict:
    if PUBLIC_DEMO_MODE:
        payload = bootstrap_payload()
        return payload["settings"]

    settings_data = get_settings_dict()
    return {
        "categories": available_categories(),
        "workbookPath": settings.workbook_path,
        "currency": settings_data["currency"],
        "tesseractCmd": settings_data["tesseract_cmd"],
        "popplerPath": settings_data["poppler_path"],
        "bankParser": settings_data["bank_parser"],
        "defaultCategories": settings_data["default_categories"],
    }


@router.post("/settings")
def update_settings(payload: SettingsPayload) -> dict:
    if PUBLIC_DEMO_MODE:
        raise HTTPException(status_code=403, detail="Settings are read-only in the public demo.")

    updated = save_settings(
        {
            "default_categories": payload.default_categories,
            "currency": payload.currency,
            "tesseract_cmd": payload.tesseract_cmd,
            "poppler_path": payload.poppler_path,
            "bank_parser": payload.bank_parser,
        }
    )
    sync_settings_sheet()
    return {
        "message": "Settings saved.",
        "categories": updated.default_categories,
        "currency": updated.currency,
        "bankParser": updated.bank_parser,
    }


@router.get("/overview")
def get_overview() -> dict:
    if PUBLIC_DEMO_MODE:
        payload = bootstrap_payload()
        return payload["overview"]
    return overview_summary()


@router.post("/upload/statement")
async def upload_statement(file: UploadFile = File(...)) -> dict:
    if PUBLIC_DEMO_MODE:
        raise HTTPException(status_code=403, detail="Real file uploads are disabled in the public demo. Use the sample statement instead.")

    from app.services.ocr_service import extract_text

    file_path = save_upload(file, "statements")
    relative_source = str(file_path.relative_to(Path(settings.uploads_dir).parent))
    preview_url = f"/uploads/statements/{file_path.name}"
    try:
        text, confidence = extract_text(file_path)
        rows = parse_statement_text(text, relative_source)
        if not rows:
            log_import(file_path.name, "statement", 0, "Failure", "No transaction rows detected.")
            return {
                "rows": [],
                "message": "No rows detected. You may need to customize the bank parser for your statement layout.",
                "confidence": confidence,
                "previewUrl": preview_url,
                "fileName": file_path.name,
            }
        log_import(file_path.name, "statement", len(rows), "Previewed")
        return {
            "rows": [row.model_dump() for row in rows],
            "message": "Preview ready.",
            "confidence": confidence,
            "previewUrl": preview_url,
            "fileName": file_path.name,
        }
    except Exception as exc:
        log_import(file_path.name, "statement", 0, "Failure", str(exc))
        raise HTTPException(status_code=400, detail=f"Statement extraction failed: {exc}") from exc


@router.post("/upload/receipt")
async def upload_receipt(file: UploadFile = File(...)) -> dict:
    if PUBLIC_DEMO_MODE:
        raise HTTPException(status_code=403, detail="Real file uploads are disabled in the public demo. Use the sample receipt instead.")

    from app.services.ocr_service import extract_text

    file_path = save_upload(file, "receipts")
    relative_source = str(file_path.relative_to(Path(settings.uploads_dir).parent))
    preview_url = f"/uploads/receipts/{file_path.name}"
    try:
        text, confidence = extract_text(file_path)
        rows = parse_receipt_text(text, relative_source, confidence)
        ledger_rows = get_sheet_rows("Ledger")
        for row in rows:
            linked_id, note = match_receipt_to_ledger(row, ledger_rows)
            if linked_id:
                row.linked_ledger_id = linked_id
                row.notes = note
        log_import(file_path.name, "receipt", len(rows), "Previewed")
        return {
            "rows": [row.model_dump() for row in rows],
            "message": "Preview ready.",
            "confidence": confidence,
            "previewUrl": preview_url,
            "fileName": file_path.name,
        }
    except Exception as exc:
        log_import(file_path.name, "receipt", 0, "Failure", str(exc))
        raise HTTPException(status_code=400, detail=f"Receipt extraction failed: {exc}") from exc


@router.post("/save/statement")
def save_statement(payload: SaveStatementPayload) -> dict:
    if PUBLIC_DEMO_MODE:
        raise HTTPException(status_code=403, detail="Persistent saving is disabled in the public demo.")

    saved = append_statement_rows(payload.rows)
    if payload.rows:
        log_import(payload.rows[0].source_file, "statement", saved, "Saved")
    return {"saved": saved, "message": f"Saved {saved} ledger rows."}


@router.post("/save/receipt")
def save_receipt(payload: SaveReceiptPayload) -> dict:
    if PUBLIC_DEMO_MODE:
        raise HTTPException(status_code=403, detail="Persistent saving is disabled in the public demo.")

    saved = append_receipt_rows(payload.rows)
    if payload.rows:
        log_import(payload.rows[0].source_file, "receipt", saved, "Saved")
    return {"saved": saved, "message": f"Saved {saved} receipt rows."}


@router.get("/ledger")
def get_ledger(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    category: str | None = Query(default=None),
    source: str | None = Query(default=None),
    min_amount: float | None = Query(default=None),
    max_amount: float | None = Query(default=None),
) -> dict:
    if PUBLIC_DEMO_MODE:
        return {
            "rows": demo_ledger_rows(
                {
                    "date_from": date_from,
                    "date_to": date_to,
                    "category": category,
                    "source": source,
                    "min_amount": min_amount,
                    "max_amount": max_amount,
                }
            )
        }

    rows = filter_ledger(
        {
            "date_from": date_from,
            "date_to": date_to,
            "category": category,
            "source": source,
            "min_amount": min_amount,
            "max_amount": max_amount,
        }
    )
    return {"rows": rows}


@router.get("/receipts")
def get_receipts() -> dict:
    if PUBLIC_DEMO_MODE:
        return {"rows": demo_receipt_rows()}
    return {"rows": get_sheet_rows("Receipts")}


@router.get("/imports-log")
def get_imports_log(limit: int | None = Query(default=None)) -> dict:
    if PUBLIC_DEMO_MODE:
        return {"rows": demo_imports_log(limit=limit)}
    rows = get_sheet_rows("Imports Log")
    if limit:
        rows = list(reversed(rows))[:limit]
    return {"rows": rows}


@router.get("/dashboard")
def get_dashboard() -> dict:
    if PUBLIC_DEMO_MODE:
        return reports_from_rows(demo_ledger_rows())
    return monthly_summary()


@router.get("/export/download")
def download_export() -> FileResponse:
    if PUBLIC_DEMO_MODE:
        raise HTTPException(status_code=403, detail="Workbook exports are disabled in the public demo.")
    export_path = export_workbook_copy()
    return FileResponse(export_path, filename=export_path.name)


@router.get("/export/summary")
def download_summary_export() -> FileResponse:
    if PUBLIC_DEMO_MODE:
        raise HTTPException(status_code=403, detail="Summary exports are disabled in the public demo.")
    export_path = export_summary_workbook()
    return FileResponse(export_path, filename=export_path.name)


@router.post("/export/open-ledger")
def open_ledger_file() -> dict:
    if PUBLIC_DEMO_MODE:
        raise HTTPException(status_code=403, detail="Opening Excel files is disabled in the public demo.")
    workbook_path = Path(settings.workbook_path)
    if not workbook_path.exists():
        raise HTTPException(status_code=404, detail="Workbook not found.")
    os.startfile(workbook_path)  # type: ignore[attr-defined]
    return {"message": "Ledger workbook opened in Excel."}
