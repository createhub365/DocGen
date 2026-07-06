# DocGen Pro — Project Structure

```
DocGen Pro/
└── docgen/
    ├── README.md
    ├── PROJECT_REPORT.md
    ├── STRUCTURE.md
    ├── AUDIT_REPORT.md
    ├── config/
    │   └── NZ_Format1_label_overrides.json
    │
    ├── backend/
    │   ├── main.py
    │   ├── auth.py
    │   ├── database.py
    │   ├── models.py
    │   ├── schemas.py
    │   ├── seed.py
    │   ├── reset_passwords.py
    │   ├── limiter.py
    │   ├── requirements.txt
    │   ├── alembic.ini
    │   ├── .env.example
    │   │
    │   ├── routers/
    │   │   ├── auth.py
    │   │   ├── filters.py
    │   │   ├── templates.py
    │   │   ├── documents.py
    │   │   ├── admin.py
    │   │   ├── public.py
    │   │   ├── form_helpers.py
    │   │   ├── employers.py
    │   │   └── trade_bank.py
    │   │
    │   ├── services/
    │   │   ├── doc_generator.py
    │   │   ├── docx_xml_fill.py
    │   │   ├── docx_enhance.py
    │   │   ├── pdf_converter.py
    │   │   ├── placeholder_extractor.py
    │   │   ├── trade_bank.py
    │   │   ├── trade_bank_admin.py
    │   │   ├── occupation_codes.py
    │   │   ├── employer_prefill.py
    │   │   └── barcode_gen.py
    │   │
    │   ├── utils/
    │   │   ├── file_utils.py          — upload validation, safe path join
    │   │   └── duty_resolver.py
    │   │
    │   ├── data/                      — trade bank JSON files
    │   ├── scripts/
    │   ├── migrations/
    │   ├── output/                    — generated DOCX / PDF
    │   ├── template_store/            — master .docx templates
    │   └── uploads/logos/
    │
    └── frontend/
        ├── index.html
        ├── package.json
        ├── vite.config.js
        ├── tailwind.config.js
        │
        └── src/
            ├── main.jsx
            ├── App.jsx
            │
            ├── api/
            │   └── client.js
            │
            ├── context/
            │   └── AuthContext.jsx      — auth state, getMe()
            │
            ├── components/
            │   ├── AdminPanel.jsx
            │   ├── AppLayout.jsx
            │   ├── StepSelectDoc.jsx
            │   ├── EmployerForm.jsx
            │   ├── ErrorBoundary.jsx    — render crash recovery
            │   ├── wizard/              — 4-step wizard sub-components
            │   ├── form/
            │   ├── admin/
            │   └── ui/
            │       └── FullPageSpinner.jsx — loading spinner
            │
            ├── pages/
            │   ├── LoginPage.jsx
            │   ├── DashboardPage.jsx
            │   ├── CreateDocPage.jsx
            │   ├── DocumentsPage.jsx    — paginated history
            │   ├── EmployersPage.jsx
            │   └── NotFoundPage.jsx     — 404 page
            │
            ├── store/
            │   └── useDocStore.js
            │
            ├── hooks/
            ├── data/
            ├── design/
            ├── styles/
            └── utils/
                ├── previewConstants.js
                ├── docxPageRenderer.js
                └── pdfPageRenderer.js
```

## Template Workflow

1. Admin downloads template DOCX from Admin Panel
2. Edit locally in Microsoft Word
3. Upload new version via Admin Panel (PUT multipart)
4. Placeholders auto-detected on upload

## Removed (no longer in codebase)

- `TemplateWordEditorPage.jsx`, `GoogleDocsEditor.jsx`, `AdvancedEditorTools.jsx`
- `docker-compose.yml`, `scripts/start-editor.ps1`, `scripts/configure-onlyoffice.ps1`
- `backend/services/google_docs.py`, `backend/services/edit_tokens.py`
- OnlyOffice integration (`onlyoffice/` folder)
- `EditToken` SQLAlchemy model
