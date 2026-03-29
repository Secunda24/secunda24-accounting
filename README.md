# Personal Bookkeeping Demo

This folder is the GitHub-ready public demo of the bookkeeping app.

It is meant for GitHub and Render deployment, not for storing your private bookkeeping data. The real local desktop version keeps uploads, Excel files, and OCR tools on your own PC. This demo version shows the workflow safely with sample data only.

## What this demo does

- Shows the same basic UI and review flow as the local app.
- Loads sample bookkeeping data from `data/bookkeeping_demo_data.json`.
- Lets visitors test statement and receipt review screens.
- Disables real uploads, permanent saves, workbook exports, and opening Excel files.

## Repo contents

- `app/` FastAPI backend
- `frontend/` static HTML, CSS, and JavaScript frontend
- `data/bookkeeping_demo_data.json` sample demo dataset
- `requirements.txt` Python dependencies for deployment
- `render.yaml` Render Blueprint config
- `.python-version` pinned Python version for predictable builds

## Use this as the repo root

If your main workspace contains other projects, do not deploy the entire parent folder.

Use only the contents of this folder as the root of the GitHub repo:

`C:\Users\angel\OneDrive\Documentos\Playground\bookkeeping_demo_github_upload`

If you keep it inside a larger monorepo, set your Render service root directory to this folder.

## Push to GitHub

Create a new empty GitHub repository, then from inside this folder run:

```powershell
git init
git add .
git commit -m "Initial bookkeeping demo"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

## Deploy on Render

This folder already includes `render.yaml`, so Blueprint deploy is the easiest option.

### Option 1. Blueprint deploy

1. Push this folder to GitHub.
2. In Render, create a new Blueprint instance from that repo.
3. Render will read `render.yaml` automatically.

### Option 2. Manual web service

If you create the service manually, use:

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/api/health`

Environment variables:

- `BOOKKEEPING_APP_NAME=Personal Bookkeeping`
- `BOOKKEEPING_PUBLIC_DEMO_MODE=true`
- `BOOKKEEPING_DEMO_ALLOW_EXPORTS=false`
- `BOOKKEEPING_CONTACT_URL=https://yourwebsite.com/contact`

## Run locally

```powershell
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000).

## Notes

- This demo does not need Tesseract, Poppler, or Excel to run on Render.
- `data/settings.json` is created automatically at runtime if it does not exist.
- The original full local app should stay private because it is designed for real uploads and local Excel storage.
