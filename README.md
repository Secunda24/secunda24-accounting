# Personal Bookkeeping Demo

Safe public demo version of the bookkeeping app for website visitors and test users.

## What it does

- shows a complete bookkeeping workflow with sample data
- lets visitors explore the dashboard, ledger, reports, and import previews
- keeps demo edits inside the visitor's browser session
- blocks real uploads, workbook changes, exports, and opening Excel files

## Demo safety

This version is designed for public sharing:

- no real financial files are uploaded
- no changes are written to a shared workbook
- no local machine paths need to be exposed to the public
- demo changes reset safely

## Deploy on Render

Use these files:

- `render.yaml`
- `requirements-bookkeeping-demo.txt`

Recommended environment values:

- `BOOKKEEPING_APP_NAME=Personal Bookkeeping`
- `BOOKKEEPING_PUBLIC_DEMO_MODE=true`
- `BOOKKEEPING_DEMO_ALLOW_EXPORTS=false`
- `BOOKKEEPING_CONTACT_URL=https://yourwebsite.com/contact`

Build command:

```text
pip install -r requirements-bookkeeping-demo.txt
```

Start command:

```text
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Health check path:

```text
/api/health
```
