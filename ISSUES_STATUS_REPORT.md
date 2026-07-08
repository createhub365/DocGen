# DocGen Pro — Issues & Status Report

**Date:** 8 July 2026  
**Frontend:** https://docgen.createhub365.workers.dev  
**Backend API:** https://docgen-api-g2tk.onrender.com  
**Database / Storage:** Supabase (`azhajzsruwvnffuwlvmy`)

---

## Executive Summary

DocGen Pro production mein deploy ho chuka hai aur **core flow kaam kar raha hai** (login, template, Word document generate). Kuch UI, storage, aur cross-origin issues fix ho chuke hain. **Abhi sirf ek major open issue hai: PDF generation** — Render server pe LibreOffice install nahi hua.

| Area | Status |
|------|--------|
| Login / Auth | ✅ Fixed & working |
| Desktop UI / Drawer | ✅ Fixed |
| Employer logos | ✅ Fixed |
| Template company dropdown | ✅ Fixed |
| Template file persistence (Supabase) | ✅ Fixed |
| Template preview / thumbnails | ✅ Working (template #3) |
| Word (.docx) generate | ✅ Working |
| PDF generate | ❌ **Open** — LibreOffice missing on Render |
| Cross-origin cookies / thumbnails | ✅ Fixed (Bearer token + image proxy) |

---

## 1. Issues That Occurred

### 1.1 Desktop UI — Drawer clipped / layout broken

**Symptom:** Admin drawer overlay cut ho raha tha, content viewport fill nahi kar raha tha.

**Cause:** `position: fixed` drawer `transform` wale animated parent ke andar tha.

**Fix:** React Portal se drawer `document.body` pe move; page transitions sirf opacity.

**Files:** `AppDrawer.jsx`, `EmployersPage.jsx`, `global.css`

**Status:** ✅ Resolved & deployed

---

### 1.2 Employer logo not showing

**Symptom:** Employer cards / form pe logo nahi dikh raha tha.

**Cause:** Relative `/api/uploads/...` URLs Cloudflare pe hit ho rahe the; cross-origin cookies images ke liye kaam nahi karte.

**Fix:** `resolveMediaUrl()`, public logo API endpoints, Supabase `employer-logos` bucket.

**Status:** ✅ Resolved & deployed

---

### 1.3 Admin template upload — wrong company dropdown

**Symptom:** NZ + Logistics empty; Construction mein seed companies dikhte the jo Employers mein nahi the.

**Cause:** Companies seed `companies` table se aa rahe the, `employers` se sync nahi.

**Fix:** `employer_company_sync.py`, `GET /companies/for-industry` API.

**Status:** ✅ Resolved & deployed

---

### 1.4 Files lost on Render redeploy

**Symptom:** Logos aur template `.docx` redeploy ke baad gayab.

**Cause:** Render disk ephemeral hai — local files persist nahi hoti.

**Fix:** Supabase Storage buckets:
- `employer-logos`
- `template-thumbnails`
- `template-documents`

Upload pe file Supabase + local cache dono pe save; read pe Supabase se fetch.

**Status:** ✅ Resolved (new uploads). Purani files re-upload zaroori thi.

---

### 1.5 API 404 — template download / fields / generate

**Symptom:**
```
GET /api/template/1          → 404
GET /api/admin/templates/1/download → 404
POST /api/generate           → 404
```

**Cause:** DB mein template record tha lekin `.docx` file Render disk pe missing (redeploy wipe).

**Fix:** `template_storage.py`, `save_template_docx()`, `resolve_template_local_path()` — Supabase `template-documents` bucket se file load.

**Status:** ✅ Resolved after re-upload. Active template ab **#3** hai.

---

### 1.6 Template id 1 still 404 in wizard

**Symptom:** User ko `/api/template/1` pe 404.

**Cause:** Templates 1 & 2 **inactive** (`is_active = false`). Sirf template **#3** active hai.

**Fix:** User ko fresh wizard / template #3 use karna. Purana cached `templateId: 1` session clear karo.

**Status:** ⚠️ Data issue — not a code bug. Templates 1 & 2 intentionally inactive.

---

### 1.7 Browser console — cookies & thumbnails

**Symptoms:**
- `access_token` cookie Partitioned warning
- `OpaqueResponseBlocking` on thumbnails
- `__cf_bm` cookie rejected on `thumb_2.png`

**Cause:** Frontend (Cloudflare) + API (Render) cross-origin; thumbnails Supabase pe redirect ho rahe the.

**Fix:**
- Bearer token auth (`Authorization` header + `sessionStorage`)
- Thumbnail/logo images API se proxy (redirect hata diya)
- `Partitioned` cookie attribute

**Status:** ✅ Resolved & deployed

---

### 1.8 PDF generate — "Not Windows" / LibreOffice error

**Symptom:** Generate Document → PDF select → error:
```
Not Windows
```
Ab updated message:
```
LibreOffice is not installed on the server. Use Word (.docx) or install LibreOffice.
```

**Cause:** API Render (Linux) pe chalti hai. PDF ke liye pehle sirf Windows + Microsoft Word support tha. LibreOffice code add ho gaya lekin **Render pe LibreOffice abhi install nahi hua**.

**Health check (current):**
```json
{
  "status": "ok",
  "pdf_available": false,
  "pdf_detail": "LibreOffice is not installed on the server..."
}
```

**Fix applied in code:**
- `pdf_converter.py` — Linux LibreOffice support
- `Aptfile` + `backend/Dockerfile` + `render.yaml`
- Format modal — PDF disabled jab server pe available nahi

**Status:** ❌ **OPEN** — Render pe Docker deploy + LibreOffice install pending

**Workaround:** **Word (.docx)** use karo — fully working.

---

## 2. Current Production Data

### Templates (Supabase)

| ID | Active | File in Storage | Thumbnail |
|----|--------|-----------------|-----------|
| 1 | ❌ No | ❌ Old filename, no file | ❌ |
| 2 | ❌ No | ✅ Supabase | ✅ thumb_2.png |
| 3 | ✅ **Yes** | ✅ Supabase | ✅ thumb_3.png |

**Use template #3** for document generation.

### Employers

| ID | Company |
|----|---------|
| 2 | Apex Warehousing Solutions Ltd |

Logo Supabase `employer-logos` bucket mein saved.

---

## 3. Environment Variables (Render)

Required on Render:

```
DATABASE_URL=postgresql://postgres.azhajzsruwvnffuwlvmy@...
ENVIRONMENT=production
JWT_SECRET=<64+ chars>
CORS_ORIGINS=https://docgen.createhub365.workers.dev
ALLOW_DEMO_SEED=false
SUPABASE_URL=https://azhajzsruwvnffuwlvmy.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

Frontend (`.env.deploy`):
```
VITE_API_BASE_URL=https://docgen-api-g2tk.onrender.com/api
```

---

## 4. What Works Right Now (Verified)

- ✅ Login (`admin` / `admin123`) + Bearer token
- ✅ `/api/auth/me`
- ✅ Template #3 — 44 placeholders load
- ✅ Template #3 thumbnail (PNG)
- ✅ Template #3 download (DOCX)
- ✅ `/api/generate` → Word document (employer_id: 2, template_id: 3)
- ✅ Employer logo display
- ✅ Supabase file persistence

---

## 5. Open Action Items

### Priority 1 — PDF on Render (user action)

1. Render Dashboard → `docgen-api` service
2. **Runtime → Docker**
3. **Root Directory → `backend`**
4. **Manual Deploy** (latest commit `c99f4fb` or newer)
5. Wait 5–15 min for LibreOffice install in Docker build
6. Verify: `GET /api/public/health` → `pdf_available: true`

### Priority 2 — Clean up inactive templates (optional)

- Admin panel se templates 1 & 2 delete ya clearly mark karo
- Users ko sirf active template #3 dikhe

### Priority 3 — User browser cache

- Hard refresh: `Ctrl + Shift + R`
- Logout → Login (naya Bearer token)
- Create Document → **Start Fresh** (purana template id 1 cache clear)

---

## 6. Recent Commits (fixes)

| Commit | Description |
|--------|-------------|
| `3636221` | Desktop drawer + employer logo fix |
| `d8c8813` | Employer sync + Supabase logos |
| `6b1cc5b` | Template preview thumbnails |
| `19e95f8` | Template card previews |
| `f6a5d3a` | Template .docx Supabase persistence |
| `030cd37` | Cross-origin auth + thumbnail proxy |
| `d17b4eb` | PDF LibreOffice code + format modal UX |
| `c99f4fb` | Dockerfile + Aptfile for Render |

---

## 7. Architecture (quick reference)

```
User Browser
    ↓
Cloudflare Workers (React frontend)
    ↓  HTTPS + Bearer token
Render FastAPI (Linux)
    ↓
Supabase PostgreSQL (data)
Supabase Storage (logos, templates, thumbnails)
```

**PDF flow (when LibreOffice installed):**
```
.docx (filled) → LibreOffice headless → .pdf
```

**PDF flow (Windows local dev):**
```
.docx → Microsoft Word (docx2pdf) → .pdf
```

---

## 8. Support Checklist

Agar koi issue aaye:

1. Browser console errors screenshot
2. Kaun sa step fail (login / template select / generate)
3. Health check: `/api/public/health`
4. Template id check — active template #3 use ho raha hai?
5. Format: DOCX try karo pehle, phir PDF

---

*Report generated from production API checks and Supabase state on 8 July 2026.*
