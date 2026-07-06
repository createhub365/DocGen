# AUDIT STATUS UPDATE — July 2026

All 6 Critical issues (C-01 to C-06) are FIXED.
Key High issues fixed: H-01, H-02, H-03, H-04, H-05, H-06.

See PROJECT_REPORT.md Section 3 for full status table.

---
[Original audit report below — June 2026]
---

# DocGen Pro / DocFlow — Full Stack Audit Report

**Date:** June 19, 2026  
**Scope:** `docgen/backend` + `docgen/frontend`  
**Stack:** FastAPI · SQLite · React 18 · Vite 6 · Ant Design 5 · Tailwind 3 · Zustand  
**Build status:** `npm run build` ✓ passes (2.3 MB JS bundle, 700 KB gzip — chunk size warning)

---

## Executive Summary

The DocFlow frontend redesign is largely complete and functional. The backend is structurally sound with JWT auth on most routes. **No broken imports** were found in active code paths.

The highest-risk issues cluster around **security** (unauthenticated OnlyOffice callback, weak JWT defaults, client-side-only admin checks) and **document generation bugs** (missing logos on generate/preview, filename collisions, progress bar overflow, fake dashboard counts).

**Total issues found:** 58  
| Severity | Count |
|----------|-------|
| Critical | 6 |
| High | 21 |
| Medium | 22 |
| Low | 9 |

---

## Critical Issues

### C-01 · Unauthenticated OnlyOffice callback — SSRF + template overwrite
| | |
|---|---|
| **Area** | Backend |
| **File** | `backend/routers/admin.py` (lines 718–744) |
| **Description** | `POST /api/admin/templates/{template_id}/editor-callback` has **no auth**. Any caller can POST a JSON body with a `url` field; the server fetches that URL via `urllib.request.urlopen` and writes bytes into the template. Enables **SSRF** and **unauthorized template modification**. |
| **Fix** | Validate OnlyOffice JWT/signature on callback. Allowlist download hosts to OnlyOffice container only. Add shared-secret HMAC. |

### C-02 · Default JWT secret fallback
| | |
|---|---|
| **Area** | Backend |
| **File** | `backend/auth.py` (line 17) |
| **Description** | `SECRET_KEY = os.getenv("JWT_SECRET", "changeme_use_strong_random_secret")`. If `JWT_SECRET` is unset in production, tokens are forgeable. |
| **Fix** | Fail fast at startup if `JWT_SECRET` is missing or equals the default. |

### C-03 · Hardcoded demo credentials in seed/reset scripts
| | |
|---|---|
| **Area** | Backend |
| **Files** | `backend/seed.py` (lines 159–167), `backend/reset_passwords.py` (lines 6–9) |
| **Description** | Creates/resets `admin/admin123` and `staff/staff123`. Trivially compromised if seed runs in production. |
| **Fix** | Require env-provided passwords. Block seed in production unless `ALLOW_DEMO_SEED=true`. |

### C-04 · Runtime crash: undefined `_remove_file` in admin router
| | |
|---|---|
| **Area** | Backend |
| **File** | `backend/routers/admin.py` (lines 601–607) |
| **Description** | `template_sample_preview_pdf` calls `background_tasks.add_task(_remove_file, ...)` but `_remove_file` is only defined in `documents.py`, not imported in `admin.py`. Calling `POST /api/admin/templates/{id}/sample-preview-pdf` raises `NameError`. |
| **Fix** | Import or define `_remove_file` in `admin.py`, or move to shared utils module. |

### C-05 · Admin access enforced only via `localStorage`
| | |
|---|---|
| **Area** | Frontend |
| **Files** | `frontend/src/App.jsx` (lines 18–27), `frontend/src/pages/DashboardPage.jsx` (line 41) |
| **Description** | Admin route guard checks `localStorage.getItem('role')`. User can set `role=admin` in DevTools and reach `/admin` UI. |
| **Fix** | Treat frontend checks as UX only. Ensure every `/admin/*` API returns 403 for non-admins. Validate role via `getMe()` on app load. |

### C-06 · Auth is token-presence only — no server validation on route entry
| | |
|---|---|
| **Area** | Frontend |
| **Files** | `frontend/src/App.jsx` (lines 10–15), `frontend/src/api/client.js` (lines 7–12) |
| **Description** | `ProtectedRoute` only checks if token exists in `localStorage`. Expired/forged tokens pass until a 401 API response. |
| **Fix** | On app init, call `getMe()`; redirect to `/login` on failure. |

---

## High Issues

### H-01 · JWT stored in `localStorage` — XSS token theft risk
| | |
|---|---|
| **Area** | Frontend |
| **Files** | `frontend/src/pages/LoginPage.jsx` (lines 19–21), `frontend/src/api/client.js` (lines 8–21) |
| **Fix** | Prefer httpOnly secure cookies from backend; add strict CSP if staying with SPA tokens. |

### H-02 · Progress bar overflows on preview step
| | |
|---|---|
| **Area** | Frontend |
| **File** | `frontend/src/components/wizard/StepSmartFillForm.jsx` (line 412) |
| **Description** | Progress uses `VISIBLE_FORM_SECTIONS.length` (7) as denominator but there are 8 sub-steps (`SUB_STEP_ITEMS`). At `subStep === 7`, width becomes **114%**. |
| **Fix** | Use `SUB_STEP_ITEMS.length` as denominator. |

### H-03 · Wizard state persists globally on navigation away
| | |
|---|---|
| **Area** | Frontend |
| **Files** | `frontend/src/store/useDocStore.js`, `frontend/src/pages/CreateDocPage.jsx` |
| **Description** | Leaving `/create` and returning resumes mid-wizard with stale selections; no unmount reset. |
| **Fix** | Reset store on `CreateDocPage` unmount, or prompt "Resume wizard?" on re-entry. |

### H-04 · `initForm()` re-runs on trade change — unexpected ref counter consumption
| | |
|---|---|
| **Area** | Frontend |
| **File** | `frontend/src/components/wizard/StepSmartFillForm.jsx` (lines 115–126) |
| **Fix** | Only increment ref on first entry to step 4; gate `useEffect` deps. |

### H-05 · Legacy wizard steps reference removed store fields
| | |
|---|---|
| **Area** | Frontend |
| **Files** | `frontend/src/components/StepCountryTrade.jsx`, `frontend/src/components/StepCompany.jsx` |
| **Description** | Reference `country`, `trade`, `company`, `setCountry`, etc. not in `useDocStore.js`. Would crash if re-imported. |
| **Fix** | Delete legacy files. |

### H-06 · Trade pill counts use `Math.random()` on every render
| | |
|---|---|
| **Area** | Frontend |
| **File** | `frontend/src/pages/DashboardPage.jsx` (line 362) |
| **Description** | Counts change on every re-render — misleading data. |
| **Fix** | Use real API counts or static fallbacks; memoize. |

### H-07 · No ESLint/Prettier tooling
| | |
|---|---|
| **Area** | Frontend |
| **File** | `frontend/package.json` |
| **Description** | No `lint` script. Report claims quality pass but no automated lint pipeline. |
| **Fix** | Add ESLint + React plugin, `npm run lint` in CI. |

### H-08 · Google Docs templates shared as "anyone: writer"
| | |
|---|---|
| **Area** | Backend |
| **File** | `backend/services/google_docs.py` (lines 62–66) |
| **Description** | `_share_file` grants **public writer** access to every uploaded template on Google Drive. |
| **Fix** | Share only with specific service accounts; use `reader` if write not needed. |

### H-09 · Public unauthenticated template download via ephemeral tokens
| | |
|---|---|
| **Area** | Backend |
| **Files** | `backend/routers/public.py`, `backend/services/edit_tokens.py`, `backend/routers/admin.py` |
| **Description** | Tokens live in **process memory** (lost on restart; not shared across workers), expire after 2 hours, but are **reusable until expiry**. |
| **Fix** | Store tokens in Redis/DB with one-time use. Bind to admin session. Shorten TTL. |

### H-10 · Employer logo not injected on `/generate` or `/preview`
| | |
|---|---|
| **Area** | Backend |
| **File** | `backend/routers/documents.py` (lines 192–197, 243–248) |
| **Description** | `/preview-pdf` passes `logo_path` to `fill_template` (line 146). `/preview` and `/generate` do **not** pass `logo_path`. Final DOCX and DOCX preview omit employer logos while PDF preview includes them. |
| **Fix** | Compute `logo_path` in shared helper and pass to all three endpoints. |

### H-11 · Logo files served publicly without authentication
| | |
|---|---|
| **Area** | Backend |
| **File** | `backend/main.py` (line 67) |
| **Description** | `app.mount("/uploads/logos", StaticFiles(...))` exposes all uploaded logos without auth. |
| **Fix** | Serve through authenticated endpoint or signed URLs. |

### H-12 · No login rate limiting / account lockout
| | |
|---|---|
| **Area** | Backend |
| **File** | `backend/routers/auth.py` (lines 12–19) |
| **Fix** | Add rate limiting (e.g. `slowapi`), exponential backoff after N failures. |

### H-13 · No upload size limits on template DOCX uploads
| | |
|---|---|
| **Area** | Backend |
| **File** | `backend/routers/admin.py` (lines 108–110, 319–321) |
| **Description** | `await file.read()` loads entire upload into memory with no max size. Logo uploads cap at 2MB; templates do not. |
| **Fix** | Enforce max upload size (e.g. 20–50MB). |

### H-14 · Output filename collision overwrites prior documents
| | |
|---|---|
| **Area** | Backend |
| **File** | `backend/routers/documents.py` (lines 228–241) |
| **Description** | Filenames use `{company}_{candidate}_{DDMMYYYY}.docx` with no unique suffix. Same employer/candidate/day overwrites prior file while creating new DB row. |
| **Fix** | Append document ID, UUID, or timestamp-with-seconds. |

### H-15 · Reference counter race condition — duplicate ref numbers
| | |
|---|---|
| **Area** | Backend |
| **File** | `backend/routers/form_helpers.py` (lines 59–69) |
| **Description** | `increment_ref_counter` read-modify-write without row locking. Concurrent requests can get same ref number. Frontend calls increment on form init, increasing risk. |
| **Fix** | Use atomic SQL increment. Consider incrementing only at generate time. |

### H-16 · Document list always returns `pdf_url` even when PDF does not exist
| | |
|---|---|
| **Area** | Backend |
| **Files** | `backend/routers/documents.py` (line 324), `backend/schemas.py` (line 90) |
| **Description** | `DocumentListItem.pdf_url` always set to `/download/pdf` regardless of `doc.pdf_filename`. Dashboard PDF button always shown; fails with 404 when conversion failed. |
| **Fix** | Return `pdf_url: null` when `pdf_filename` is null. Update schema to `Optional[str]`. |

### H-17 · CORS misconfiguration risk
| | |
|---|---|
| **Area** | Backend |
| **File** | `backend/main.py` (lines 45–51) |
| **Description** | `allow_credentials=True` with default `CORS_ORIGINS="*"`. Browsers reject this combination. |
| **Fix** | Require explicit origin list in production. Never combine `*` with `allow_credentials=True`. |

### H-18 · Admin status endpoints unauthenticated
| | |
|---|---|
| **Area** | Backend |
| **File** | `backend/routers/admin.py` (lines 370–400) |
| **Description** | `GET /api/admin/onlyoffice/status` and `GET /api/admin/google-docs/status` have no `Depends(get_admin_user)`. Leak infrastructure URLs. |
| **Fix** | Protect with `get_admin_user`. |

### H-19 · No code splitting — 2.3 MB main bundle
| | |
|---|---|
| **Area** | Frontend |
| **Files** | `frontend/src/App.jsx`, `frontend/src/main.jsx` |
| **Description** | AdminPanel, TemplateWordEditorPage, pdfjs, html2canvas, docx-preview all in main bundle (~700KB gzip). |
| **Fix** | `React.lazy()` + `Suspense` for `/admin`, editor, preview utilities. |

### H-20 · `getTemplateById()` result discarded — dead network call
| | |
|---|---|
| **Area** | Frontend |
| **File** | `frontend/src/components/wizard/StepSmartFillForm.jsx` (lines 120–125) |
| **Fix** | Use response (placeholders/validation) or remove the call. |

### H-21 · Dashboard only offers PDF download — no DOCX option
| | |
|---|---|
| **Area** | Frontend + Backend integration |
| **Files** | `frontend/src/pages/DashboardPage.jsx` (lines 310–338), `frontend/src/api/client.js` |
| **Description** | API supports `downloadDoc(id, 'docx')` but UI only shows PDF button. |
| **Fix** | Add DOCX download button or dropdown. |

---

## Medium Issues

### M-01 · No logout on mobile
| **File** | `frontend/src/components/AppLayout.jsx` (lines 336–361) |
| **Fix** | Add logout to mobile menu or profile sheet. |

### M-02 · "View All" button is a no-op
| **File** | `frontend/src/pages/DashboardPage.jsx` (lines 225–238) |
| **Fix** | Wire to full documents view or remove. |

### M-03 · "View documents" button has no handler
| **File** | `frontend/src/pages/EmployersPage.jsx` (lines 150–152) |
| **Fix** | Navigate to filtered documents or employer detail view. |

### M-04 · Stat cards lack primary labels per redesign report
| **File** | `frontend/src/pages/DashboardPage.jsx` (lines 139–167) |
| **Description** | Report §7.2 promises "Total Documents Generated", etc. Only numeric value + vague subtitle shown. |
| **Fix** | Add `title` prop to `StatCard`. |

### M-05 · Custom drawers lack focus trap / keyboard dismissal
| **Files** | `frontend/src/pages/EmployersPage.jsx`, `frontend/src/components/wizard/StepEmployerTrade.jsx` |
| **Fix** | Add `aria-modal`, `role="dialog"`, focus trap, Escape close. |

### M-06 · StepIndicator buttons lack `aria-label` / `aria-current`
| **File** | `frontend/src/components/ui/StepIndicator.jsx` (lines 57–68) |

### M-07 · Tablet hamburger button missing `aria-label`
| **File** | `frontend/src/components/AppLayout.jsx` (lines 298–311) |

### M-08 · No 404/catch-all route
| **File** | `frontend/src/App.jsx` |
| **Fix** | Add `<Route path="*" element={<Navigate to="/dashboard" />} />`. |

### M-09 · No redirect if already authenticated on `/login`
| **File** | `frontend/src/pages/LoginPage.jsx` |

### M-10 · Admin routes render outside `AppLayout`
| **Files** | `frontend/src/App.jsx` (lines 46–61), `frontend/src/components/AdminPanel.jsx` |
| **Description** | Mobile users lose bottom nav on `/admin`. Admin still uses old `#1677ff` Ant default styling. |

### M-11 · Preview refresh on every keystroke (900ms debounce)
| **File** | `frontend/src/components/wizard/StepSmartFillForm.jsx` (lines 456–462) |
| **Fix** | Debounce merge/preview; refresh only on sub-step advance or blur. |

### M-12 · `autoComplete="off"` on login form
| **File** | `frontend/src/pages/LoginPage.jsx` (line 84) |
| **Fix** | Use `autoComplete="username"` / `current-password`. |

### M-13 · Demo credentials displayed in UI
| **File** | `frontend/src/pages/LoginPage.jsx` (line 107) |
| **Fix** | Hide behind `import.meta.env.DEV` or remove for production. |

### M-14 · `logo_url` rendered without origin validation
| **Files** | `frontend/src/components/LogoPreview.jsx`, `frontend/src/pages/EmployersPage.jsx` |
| **Fix** | Validate URLs are same-origin or allowlisted paths. |

### M-15 · `handleStepClick` not memoized — re-registers nav every render
| **File** | `frontend/src/components/wizard/StepSmartFillForm.jsx` (lines 311–320) |
| **Fix** | Wrap in `useCallback`. |

### M-16 · Preview pipeline runs PDF + html2canvas on main thread
| **Files** | `frontend/src/utils/docxPageRenderer.js`, `frontend/src/utils/pdfPageRenderer.js` |
| **Fix** | Web Worker for PDF rasterization; throttle concurrent previews. |

### M-17 · Trade details `useEffect` has incomplete dependency array
| **File** | `frontend/src/components/wizard/StepEmployerTrade.jsx` (lines 161–172) |

### M-18 · `StepSelectDoc.jsx` uses static `message` from antd instead of `useAppMessage()`
| **File** | `frontend/src/components/StepSelectDoc.jsx` (line 2) |

### M-19 · Dependencies largely unpinned
| **File** | `backend/requirements.txt` |
| **Fix** | Pin all direct dependencies; run `pip-audit` in CI. |

### M-20 · `python-jose` is unmaintained
| **File** | `backend/auth.py`, `backend/requirements.txt` |
| **Fix** | Migrate to `PyJWT`. |

### M-21 · Long-lived JWTs (8 hours) with no revocation
| **File** | `backend/auth.py` (line 19) |

### M-22 · No input validation on Pydantic schemas
| **File** | `backend/schemas.py` |
| **Description** | `LoginRequest`, `UserCreate`, `GenerateRequest.form_data: Dict[str, Any]` have no length/format constraints. |

### M-23 · Admin CRUD missing FK integrity checks
| **File** | `backend/routers/admin.py` (lines 824–856) |

### M-24 · PII stored in plaintext JSON
| **File** | `backend/models.py` (line 131) |

### M-25 · Logo upload validates extension only, not content
| **Files** | `backend/routers/employers.py`, `backend/routers/form_helpers.py` |

### M-26 · SQLite default — not production-grade for concurrency
| **File** | `backend/database.py` (line 7) |

### M-27 · No DB rollback on failure in route handlers
| **Files** | Multiple routers |

### M-28 · Path traversal if filenames tampered in DB
| **Files** | `backend/routers/documents.py` (lines 342, 366), `backend/routers/public.py` |

### M-29 · DOCX processing vulnerable to resource exhaustion (zip bombs)
| **Files** | `backend/services/docx_xml_fill.py`, `backend/services/placeholder_extractor.py` |

### M-30 · `uploads/logos` not gitignored
| **File** | `docgen/.gitignore` |

### M-31 · `injectCssVariables()` exported but never called
| **File** | `frontend/src/design/tokens.js` (lines 104–122) |
| **Description** | Vars duplicated in `global.css` `:root`. |

### M-32 · `keyframesCss` export in `animations.js` never injected
| **File** | `frontend/src/design/animations.js` |
| **Description** | Keyframes duplicated in `global.css`. |

### M-33 · `.animate-shake`, `.page-exit` CSS classes never applied in JSX
| **File** | `frontend/src/styles/global.css` |

### M-34 · PDF conversion warnings never surfaced to user
| **Area** | Integration |
| **Description** | `GenerateResponse.pdf_warning` returned by backend but frontend `smartGenerate` callers don't show toast. |

### M-35 · Ref incremented on form open, not on generate
| **Area** | Integration |
| **Files** | `backend/routers/form_helpers.py`, `frontend/src/components/wizard/StepSmartFillForm.jsx` |

### M-36 · Edit tokens lost on server restart (in-memory store)
| **File** | `backend/services/edit_tokens.py` |

---

## Low Issues

### L-01 · Dead legacy wizard files (zero imports)
| **Files** | `CompactWizardDots.jsx`, `StepCompany.jsx`, `StepCountryTrade.jsx`, `StepFillForm.jsx`, `StepPreview.jsx` |

### L-02 · Completed-dot checkmark uses `fontSize: 4` — invisible
| **File** | `frontend/src/components/ui/SubStepDots.jsx` (line 42) |

### L-03 · AdminPanel still uses `#1677ff` (pre-redesign Ant blue)
| **File** | `frontend/src/components/AdminPanel.jsx` (lines 63–68) |

### L-04 · Color tokens duplicated in JS, CSS `:root`, and Tailwind config
| **Files** | `tokens.js`, `global.css`, `tailwind.config.js` |

### L-05 · Dev proxy hardcoded to `localhost:8000`
| **File** | `frontend/vite.config.js` (lines 7–10) |

### L-06 · Employer logo `alt=""` — could use company name
| **File** | `frontend/src/pages/EmployersPage.jsx` (line 77) |

### L-07 · `CounterUp` lacks `prefers-reduced-motion` bypass
| **File** | `frontend/src/components/ui/CounterUp.jsx` |

### L-08 · No health/readiness endpoints
| **File** | `backend/main.py` |

### L-09 · Deprecated `datetime.utcnow()` usage
| **Files** | `backend/auth.py`, `backend/models.py`, multiple routers |

### L-10 · N+1 query patterns in list endpoints
| **Files** | `backend/routers/documents.py`, `backend/routers/admin.py`, `backend/routers/templates.py` |

### L-11 · Dead / legacy backend endpoints still present
| **Files** | `backend/routers/templates.py` `GET /template`, `form_helpers.py` `/logos`, `doc_generator.py` alias |

### L-12 · No global exception handler / consistent error shape
| **File** | `backend/main.py` |

### L-13 · Schema migration via ad-hoc ALTER in `main.py`
| **File** | `backend/main.py` (lines 16–32) |

---

## What Looks Good

- Most user-facing routes require JWT via `get_current_user`; admin routes use `get_admin_user` (backend)
- Passwords hashed with bcrypt; verification handles invalid hashes safely
- SQLAlchemy ORM — no user-controlled raw SQL
- Document downloads enforce ownership (`_can_access_document`)
- DOCX placeholder replacement escapes XML special characters
- **No `dangerouslySetInnerHTML` / `eval()`** in frontend `src/`
- **Active import graph intact** — all page/component imports resolve
- Design system largely matches redesign report: tokens, global.css, Tailwind, Ant ConfigProvider
- Responsive layout: sidebar breakpoints, tablet drawer, mobile bottom nav
- Preview debouncing (900ms) and request cancellation in `DocumentPreviewPanel`
- `React.memo` on `StatCard`, `StepIndicator`, `SubStepDots`, skeleton components
- Blob URL cleanup in `DocumentFullPreviewModal`
- 401 interceptor clears auth and redirects (`api/client.js`)
- `prefers-reduced-motion` present in `global.css`
- Production build passes

---

## Suggested Fix Order (Default Priority)

> **Note:** User will provide exact fix order. This is the recommended default sequence.

### Phase 1 — Critical bugs & security (fix first)
1. **C-04** — `_remove_file` crash in admin sample preview (immediate runtime bug)
2. **H-10** — Logo missing on `/generate` and `/preview` (user-visible doc bug)
3. **H-02** — Progress bar overflow (visible UI bug)
4. **H-06** — Fake `Math.random()` trade counts (misleading data)
5. **H-16** — `pdf_url` always present → 404 on dashboard
6. **H-14** — Filename collision overwrites documents
7. **C-01** — OnlyOffice callback SSRF (security)
8. **C-02** — JWT secret fallback (security)
9. **C-03** — Demo credentials in seed (security)

### Phase 2 — UX & state bugs
10. **H-03** — Wizard state reset on navigation
11. **H-04** — Ref counter guard on trade change
12. **M-02** — "View All" no-op button
13. **M-03** — "View documents" no-op button
14. **M-04** — Stat card titles missing
15. **H-21** — DOCX download on dashboard
16. **M-01** — Mobile logout missing
17. **M-08** — 404 catch-all route
18. **M-09** — Redirect authenticated users from `/login`

### Phase 3 — Auth hardening
19. **C-05** — Frontend admin guard + backend 403 verification
20. **C-06** — `getMe()` validation on app load
21. **H-12** — Login rate limiting
22. **H-18** — Protect admin status endpoints
23. **M-13** — Hide demo credentials in production

### Phase 4 — Performance & cleanup
24. **H-19** — Code splitting (lazy routes)
25. **H-07** — ESLint setup
26. **L-01** — Delete legacy wizard files
27. **M-31–33** — DRY design tokens / remove dead CSS exports
28. **L-02** — SubStepDots checkmark size

### Phase 5 — Infrastructure & hardening (longer-term)
29. **H-15** — Ref counter race condition
30. **H-13** — Template upload size limits
31. **H-17** — CORS explicit origins
32. **H-08** — Google Docs sharing model
33. **H-09** — Persistent edit tokens
34. **M-19–22** — Pin deps, migrate PyJWT, schema validation
35. **L-08–13** — Health endpoints, Alembic migrations, exception handler

---

## Test Checklist (run after each fix)

```bash
# Frontend build
cd docgen/frontend
npm install
npm run build

# Backend (ensure venv active)
cd docgen/backend
uvicorn main:app --reload

# Manual smoke tests
# 1. Login as admin → dashboard loads, stats visible
# 2. Create doc wizard: employer → trade → template → fill form → preview → generate
# 3. Dashboard: download DOCX + PDF (PDF only if conversion succeeded)
# 4. Employers: add/edit employer with logo
# 5. Admin panel: template upload, OnlyOffice editor save
# 6. Mobile viewport: bottom nav, logout
# 7. Non-admin user: /admin API returns 403
```

---

## Files Reference

| Report | Path |
|--------|------|
| This audit | `docgen/AUDIT_REPORT.md` |
| Frontend redesign | `docgen/frontend/FRONTEND_REDESIGN_REPORT.md` |
| Project structure | `docgen/STRUCTURE.md` |

---

*Generated by Cursor audit — June 19, 2026*
