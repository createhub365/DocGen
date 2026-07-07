-- DocGen Pro — Supabase PostgreSQL schema
-- Project: https://azhajzsruwvnffuwlvmy.supabase.co
-- Run in Supabase Dashboard → SQL Editor (or via setup_supabase.py)

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR NOT NULL,
    full_name VARCHAR NOT NULL DEFAULT '',
    password_hash VARCHAR NOT NULL,
    role VARCHAR DEFAULT 'staff',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username);
CREATE INDEX IF NOT EXISTS ix_users_id ON users (id);

CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL,
    code VARCHAR NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_countries_code ON countries (code);
CREATE INDEX IF NOT EXISTS ix_countries_id ON countries (id);

CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL,
    country_id INTEGER NOT NULL REFERENCES countries(id)
);
CREATE INDEX IF NOT EXISTS ix_trades_id ON trades (id);

CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL,
    trade_id INTEGER NOT NULL REFERENCES trades(id),
    country_id INTEGER NOT NULL REFERENCES countries(id)
);
CREATE INDEX IF NOT EXISTS ix_companies_id ON companies (id);

CREATE TABLE IF NOT EXISTS document_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL,
    slug VARCHAR NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_document_types_slug ON document_types (slug);
CREATE INDEX IF NOT EXISTS ix_document_types_id ON document_types (id);

CREATE TABLE IF NOT EXISTS templates (
    id SERIAL PRIMARY KEY,
    document_type_id INTEGER NOT NULL REFERENCES document_types(id),
    company_id INTEGER NOT NULL REFERENCES companies(id),
    trade_id INTEGER NOT NULL REFERENCES trades(id),
    country_id INTEGER NOT NULL REFERENCES countries(id),
    docx_filename VARCHAR NOT NULL,
    thumbnail_path VARCHAR,
    label_overrides_json TEXT,
    category VARCHAR,
    format_slug VARCHAR,
    format_label VARCHAR,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS ix_templates_id ON templates (id);

CREATE TABLE IF NOT EXISTS employers (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR NOT NULL,
    company_trading_name VARCHAR,
    company_logo_path VARCHAR,
    country VARCHAR NOT NULL,
    industry VARCHAR,
    reg_number_label VARCHAR,
    reg_number_value VARCHAR,
    company_address VARCHAR NOT NULL,
    company_city VARCHAR NOT NULL,
    company_state VARCHAR,
    company_postcode VARCHAR,
    company_email VARCHAR NOT NULL,
    company_website VARCHAR,
    hr_contact_name VARCHAR NOT NULL,
    hr_contact_title VARCHAR NOT NULL,
    hr_email VARCHAR NOT NULL,
    employer_accreditation_no VARCHAR,
    signatory_name VARCHAR NOT NULL,
    signatory_designation VARCHAR NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS ix_employers_id ON employers (id);

CREATE TABLE IF NOT EXISTS ref_counter (
    id SERIAL PRIMARY KEY,
    last_number INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);

CREATE TABLE IF NOT EXISTS company_logos (
    id VARCHAR PRIMARY KEY,
    company_name VARCHAR NOT NULL,
    filename VARCHAR NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS ix_company_logos_company_name ON company_logos (company_name);

CREATE TABLE IF NOT EXISTS generated_documents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    template_id INTEGER NOT NULL REFERENCES templates(id),
    form_data_json TEXT NOT NULL,
    docx_filename VARCHAR,
    pdf_filename VARCHAR,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS ix_generated_documents_id ON generated_documents (id);

CREATE TABLE IF NOT EXISTS alembic_version (
    version_num VARCHAR(32) NOT NULL PRIMARY KEY
);
INSERT INTO alembic_version (version_num)
VALUES ('e5f6a7b8c0d1')
ON CONFLICT (version_num) DO NOTHING;
