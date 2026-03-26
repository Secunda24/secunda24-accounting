import shutil
from datetime import datetime
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings


def _timestamped_name(filename: str) -> str:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = Path(filename).name.replace(" ", "_")
    return f"{stamp}_{safe_name}"


def save_upload(upload: UploadFile, target_folder: str) -> Path:
    folder = Path(settings.uploads_dir) / target_folder
    folder.mkdir(parents=True, exist_ok=True)
    file_path = folder / _timestamped_name(upload.filename or "upload.bin")
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)
    return file_path
