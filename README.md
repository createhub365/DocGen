# DocGen Pro

Internal document automation system for immigration consultancy operations.

## Features

- DOCX + PDF document generation from Word templates
- Smart 4-step wizard with live preview
- Auto-detection of `{{placeholders}}` from uploaded templates
- Employer management with logo injection
- Trade bank with 400+ occupation codes
- Role-based access (admin / staff)
- Local Word template workflow — download, edit in Word, re-upload

## Quick Start

### Requirements

- Python 3.12+
- Node.js 18+
- Microsoft Word (Windows) — required for PDF generation  
  DOCX download is available on all platforms

> **Note:** `DOCGEN_SKIP_PDF` is **test-only** scaffolding used by the pytest suite to avoid Word COM. Do **not** set it in production `.env` files — when unset, PDF generation behaves as before Phase 3.

### Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env — set JWT_SECRET to a strong random value
pip install -r requirements.txt
python seed.py          # First run only
alembic upgrade head
uvicorn main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

## URLs

| Service  | URL                                    |
|----------|----------------------------------------|
| Frontend | http://localhost:5173                  |
| API      | http://localhost:8000                  |
| API docs | http://localhost:8000/docs             |
| Health   | http://localhost:8000/api/public/health |

## Default Credentials

See `backend/.env` after running `seed.py`.  
Change passwords before any production use.

## Editing Templates

1. Go to **Admin Panel → Templates**
2. Click **Download Template** on any template
3. Edit the `.docx` file in Microsoft Word
4. Add or modify `{{placeholders}}` as needed
5. Save in Word
6. Click **Upload New Version** in Admin Panel (Settings drawer)
7. System auto-detects all placeholders from the updated file

### Placeholder Syntax

Use double curly braces anywhere in your Word document:

| Placeholder        | Form label example |
|--------------------|--------------------|
| `{{cand_name}}`    | Cand Name          |
| `{{joining_date}}` | Joining Date       |
| `{{salary}}`       | Salary             |

Placeholders work in paragraph text, table cells, headers, footers, and text boxes.

## PDF Generation

DocGen Pro uses `docx2pdf` for PDF conversion:

- **Windows (recommended):** Requires Microsoft Word installed.
  `docx2pdf` uses Word COM automatically — no configuration needed.
- **Linux:** Requires LibreOffice: `sudo apt install libreoffice`
- **No PDF available:** System falls back to DOCX-only with a clear message.

Install:

```bash
pip install docx2pdf
```

Test:

```bash
python -c "from docx2pdf import convert; print('Ready')"
```

## Production Checklist

- [ ] Set `ENVIRONMENT=production` in `.env`
- [ ] Generate strong `JWT_SECRET` (64+ chars)
- [ ] Set `ALLOW_DEMO_SEED=false`
- [ ] Change all seed passwords
- [ ] Set `CORS_ORIGINS` to your domain only
- [ ] Install Microsoft Word on the Windows server for PDF export
- [ ] Run: `alembic upgrade head`
- [ ] Consider PostgreSQL for multi-user concurrency
- [ ] Enable HTTPS

## Security Notes

- JWT stored in HttpOnly cookie (XSS-safe)
- All file uploads validated for type + size
- Path traversal protection on all file serving
- Rate limiting on login endpoint
- All config via environment variables — never hardcoded

## Authentication

Auth uses **httpOnly cookies** (not localStorage). The frontend sends credentials with `withCredentials: true`. After login, the JWT is stored in an `access_token` cookie. Logout clears the cookie via `POST /api/auth/logout`.

## Architecture

```
Browser (React + Vite)
    │  httpOnly cookie (JWT)
    ▼
FastAPI Backend (:8000)
    ├── SQLite database (WAL mode)
    ├── template_store/  (master .docx files)
    ├── output/          (generated DOCX/PDF)
    └── uploads/logos/   (protected via /api/uploads/logos/{filename})

PDF generation (Windows):
    python-docx fill → docx2pdf (Word COM internally) → PDF
    Linux: LibreOffice headless fallback; DOCX always available
```

**Document flow:** Document type → Country/Category/Format → Employer + Trade → Smart form → Preview → Generate DOCX + PDF
