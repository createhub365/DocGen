# DocGen Pro — Complete Project Report

**Generated:** 4 July 2026  
**Stack:** React 18 + Vite 6 + Ant Design 5 | FastAPI + SQLAlchemy + SQLite | python-docx + docx2pdf  
**Overall completion:** ~90%

---

## 1. Executive Summary

DocGen Pro is an internal document automation system for immigration consultancy operations. Staff use a 4-step wizard to select a template, pick an employer and trade, fill a smart form, and generate Word + PDF documents. Admins manage templates via local Word editing + re-upload.

**Architecture:**

```
Browser (React + Vite :5173)
    │  httpOnly cookie (JWT)
    ▼
FastAPI Backend (:8000)
    ├── SQLite (WAL mode)
    ├── template_store/   — master .docx templates
    ├── output/           — generated DOCX/PDF
    ├── uploads/logos/    — employer logos
    └── data/*.json       — trade bank (400+ trades)

Pipeline:
Upload .docx → placeholder detect → wizard form fill
→ python-docx XML fill → logo + barcode inject → DOCX
→ docx2pdf (Windows: Word COM | Linux: LibreOffice) → PDF
```

---

## 2. Recent Changes Log

### Option E (July 2026) — Docs + Employer Import
- `PROJECT_REPORT.md` rewritten (this file)
- `AUDIT_REPORT.md` status header added (C-01–C-06 fixed)
- CSV employer import: `scripts/import_employers.py` + admin API + UI
- `employers_template.csv` example template (no real data)
- `.gitignore`: block real CSV files, allow template only

### Option A (July 2026) — Performance + Quality
- Bundle: 2.2 MB → 495 KB initial load  
  (vendor-preview 848 KB lazy-loaded, vendor-antd 1.14 MB cached)
- Placeholder extractor: first/even page headers, text boxes (`w:txbxContent`), shapes
- Dead code: `_ensure_schema_columns()` removed
- Word COM: psutil cleanup on crash
- H-02: progress bar capped at 100%
- H-03: wizard resets on mount + unmount
- H-04: logo path via `safe_join` + exists check
- H-06: dashboard stats from real API
- Admin pagination: DB-level, max 100/page
- Stale files: `onlyoffice/` deleted, README + STRUCTURE updated

### Pre Option-A (June–July 2026)
- JWT → httpOnly cookie (XSS safe)
- AuthContext: `getMe()` on load (server-verified)
- Logo serving: auth required
- Rate limiting: 10/min on login
- Security headers middleware
- SQLite WAL mode
- Path traversal protection (`safe_join`)
- File upload validation
- Alembic migrations setup
- Bundle code splitting (`vite.config.js`)
- Employment Contract + Appointment Letter enabled
- Documents page (paginated, search, date filter)
- 404 page, ErrorBoundary, FullPageSpinner
- OnlyOffice, Google Docs, Docker removed
- docx2pdf replacing PowerShell/LibreOffice-only on Windows

---

## 3. Audit Status (from AUDIT_REPORT.md — June 2026)

| ID | Issue | Status |
|----|-------|--------|
| C-01 | Unauthenticated OnlyOffice callback | ✅ Fixed — editor removed |
| C-02 | Weak JWT secret default | ✅ Fixed — fail-fast in prod |
| C-03 | Hardcoded demo passwords | ✅ Fixed — env-gated |
| C-04 | `_remove_file` crash | ✅ Fixed — endpoint removed |
| C-05 | Admin guard client-side only | ✅ Fixed — `getMe()` in AdminRoute |
| C-06 | Token-presence-only auth | ✅ Fixed — AuthContext `getMe()` |
| H-01 | JWT in localStorage | ✅ Fixed — httpOnly cookie |
| H-02 | Progress bar overflow | ✅ Fixed — Math.min capped |
| H-03 | Wizard state persists | ✅ Fixed — reset on mount/unmount |
| H-04 | Logo path resolution | ✅ Fixed — safe_join + exists |
| H-05 | Filename collisions | ✅ Fixed — UUID suffix |
| H-06 | Hardcoded dashboard stats | ✅ Fixed — real API counts |

---

## 4. What's Working (Verified)

| Feature | Status |
|---------|--------|
| JWT httpOnly cookie auth | ✅ |
| Server-verified admin guard | ✅ |
| 4-step wizard (all doc types) | ✅ |
| Placeholder auto-detect (body/tables/headers/textboxes) | ✅ |
| DOCX generation (XML fill, logo, barcode) | ✅ |
| PDF via docx2pdf (Windows) | ✅ |
| PDF via LibreOffice (Linux) | ✅ |
| DOCX-only fallback | ✅ |
| Live preview (docx-preview + pdfjs, lazy-loaded) | ✅ |
| Employer CRUD + logo + prefill | ✅ |
| Employer CSV import (CLI + admin UI) | ✅ |
| Trade bank (400+ trades, duties, codes) | ✅ |
| Document history (paginated, search, date) | ✅ |
| Admin panel (templates, users, trade bank, stats) | ✅ |
| Template download + Upload New Version | ✅ |
| Appointment Letter + Employment Contract | ✅ |
| Public health API | ✅ |
| Security headers | ✅ |
| File upload validation | ✅ |
| SQLite WAL mode | ✅ |
| Error boundary | ✅ |
| 401 auto-logout | ✅ |
| Bundle optimized (~495 KB initial) | ✅ |

---

## 5. What's Incomplete

| Item | Priority | Notes |
|------|----------|-------|
| Populate real employer CSV data | P1 | Import system ready; seed still has demo companies |
| Automated tests | P2 | 0% coverage |
| CI/CD | P2 | No GitHub Actions |
| PostgreSQL migration | P3 | SQLite OK for small team |
| Frontend retry logic | P3 | API fail = reload only |
| Email notifications | — | Not planned |
| Multi-tenant | — | Not planned |

---

## 6. API Endpoints (48 total)

### Public (no auth)
- `GET /api/public/health`
- `GET /api/public/ping`

### Auth (`/api/auth`)
- `POST /login` — sets httpOnly cookie
- `POST /logout` — clears cookie
- `GET /me` — server-validates session

### Filters (`/api`)
- `GET /countries`
- `GET /trades?country_id=`
- `GET /companies?trade_id=&country_id=`
- `GET /document-types`

### Templates (`/api`)
- `GET /templates`
- `GET /template/{id}`
- `GET /template?company_id=&trade_id=&country_id=&doc_type_id=`

### Documents (`/api`)
- `POST /preview`
- `POST /preview-pdf`
- `POST /generate`
- `GET /documents` (paginated, max 100/page)
- `GET /documents/{id}/download/docx`
- `GET /documents/{id}/download/pdf`

### Employers (`/api`)
- `GET/POST/PUT/DELETE /employers`
- `GET /employers/{id}/logo`

### Form Helpers (`/api`)
- `GET /ref-counter`
- `POST /ref-counter/increment`
- `GET /uploads/logos/{filename}`
- `POST /logos`
- `GET /logos?company_name=`

### Trade Bank (`/api`)
- `GET /trade-bank`

### Admin (`/api/admin` — admin role required)
- `POST /templates/preview-placeholders`
- `POST /templates`
- `PUT /templates/{id}`
- `POST /templates/{id}/edit`
- `GET /templates`
- `GET /templates/{id}/download`
- `DELETE /templates/{id}`
- `POST /employers/import-csv`
- `POST /countries`
- `POST /trades`
- `POST /companies`
- `GET /stats`
- `GET /users`
- `POST /users`
- `GET /trade-bank`
- `POST /trade-bank/industries`
- `POST /trade-bank/trades`
- `PUT /trade-bank/trades/{id}`
- `DELETE /trade-bank/trades/{id}`

---

## 7. Database Schema (10 tables)

`users`, `countries`, `trades`, `companies`, `document_types`, `templates`, `employers`, `ref_counter`, `company_logos`, `generated_documents`

See `backend/models.py` for full column definitions.

---

## 8. Build Status

**Frontend:** `npm run build` passes

| Chunk | Size |
|-------|------|
| index | 224 KB |
| vendor-react | 144 KB |
| vendor-router | 19 KB |
| vendor-antd | 1.14 MB (cached after first load) |
| vendor-antd-icons | 48 KB |
| vendor-preview | 848 KB (lazy-loaded on preview) |
| vendor-utils | 60 KB |
| **Initial load** | **~495 KB** |

**Backend:** All imports OK, uvicorn starts clean

---

## 9. Environment Variables

**Backend (`.env`):**  
`JWT_SECRET`, `DATABASE_URL`, `OUTPUT_DIR`, `TEMPLATE_DIR`, `LOGO_DIR`, `CORS_ORIGINS`, `ENVIRONMENT`, `ALLOW_DEMO_SEED`, `SEED_ADMIN_PASSWORD`, `SEED_STAFF_PASSWORD`, `WORD_PATH` (optional)

**Frontend (`.env.local`):**  
`VITE_API_BASE_URL` (optional — Vite proxy works without it)

---

## 10. Progress Tracker

| Module | Completion |
|--------|------------|
| Backend core | 95% |
| Document generation | 93% |
| PDF conversion | 90% |
| Frontend wizard | 92% |
| Performance | 85% |
| Security | 90% |
| Employer management | 85% ← CSV import ready |
| Tests + CI | 0% |
| Documentation | 95% |
| **Overall** | **~90%** |

---

## 11. Quick Start

**Backend:**

```bash
cd backend
cp .env.example .env
pip install -r requirements.txt
python seed.py
uvicorn main:app --reload --port 8000
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

**Employer CSV import:**

```bash
cd backend
python scripts/import_employers.py --file scripts/employers_template.csv --dry-run
python scripts/import_employers.py --file your_data.csv
```

Or: Admin Panel → Employers → Bulk Import CSV

**URLs:**

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| Health | http://localhost:8000/api/public/health |

**Production checklist:**

- [ ] `ENVIRONMENT=production`
- [ ] `ALLOW_DEMO_SEED=false`
- [ ] Strong `JWT_SECRET` (64+ chars)
- [ ] Change seed passwords
- [ ] Microsoft Word installed (Windows PDF)
- [ ] Run: `alembic upgrade head`
- [ ] `CORS_ORIGINS` = exact domain
- [ ] Never commit real employer CSV files to git
