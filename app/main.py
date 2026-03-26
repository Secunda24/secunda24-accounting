from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.core.config import APP_NAME, PUBLIC_DEMO_MODE, settings
from app.services.workbook_service import ensure_workbook


def create_app() -> FastAPI:
    title = f"{APP_NAME} Demo" if PUBLIC_DEMO_MODE else APP_NAME
    app = FastAPI(title=title, version="0.2.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router, prefix="/api")

    uploads_dir = Path(settings.uploads_dir)
    if uploads_dir.exists():
        app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

    frontend_dir = Path(settings.frontend_dir)
    if frontend_dir.exists():
        app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
    return app


if not PUBLIC_DEMO_MODE:
    ensure_workbook()
app = create_app()
