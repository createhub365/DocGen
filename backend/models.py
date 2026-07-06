from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=False, default="")
    password_hash = Column(String, nullable=False)
    role = Column(String, default="staff")
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Country(Base):
    __tablename__ = "countries"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)

    trades = relationship("Trade", back_populates="country")
    companies = relationship("Company", back_populates="country")


class Trade(Base):
    """SQLAlchemy trade (admin template filters). JSON trade-bank entries use TradeBankEntry in schemas.py with occupation_codes."""
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    country_id = Column(Integer, ForeignKey("countries.id"), nullable=False)

    country = relationship("Country", back_populates="trades")
    companies = relationship("Company", back_populates="trade")


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    trade_id = Column(Integer, ForeignKey("trades.id"), nullable=False)
    country_id = Column(Integer, ForeignKey("countries.id"), nullable=False)

    trade = relationship("Trade", back_populates="companies")
    country = relationship("Country", back_populates="companies")


class DocumentType(Base):
    __tablename__ = "document_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)


class Template(Base):
    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, index=True)
    document_type_id = Column(Integer, ForeignKey("document_types.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    trade_id = Column(Integer, ForeignKey("trades.id"), nullable=False)
    country_id = Column(Integer, ForeignKey("countries.id"), nullable=False)
    docx_filename = Column(String, nullable=False)
    thumbnail_path = Column(String, nullable=True)
    label_overrides_json = Column(Text, nullable=True)
    category = Column(String, nullable=True)
    format_slug = Column(String, nullable=True)
    format_label = Column(String, nullable=True)
    version = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    document_type = relationship("DocumentType")
    company = relationship("Company")
    trade = relationship("Trade")
    country = relationship("Country")


class Employer(Base):
    __tablename__ = "employers"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    company_name = Column(String, nullable=False)
    company_trading_name = Column(String, nullable=True)
    company_logo_path = Column(String, nullable=True)
    country = Column(String, nullable=False)
    industry = Column(String, nullable=True)
    reg_number_label = Column(String, nullable=True)
    reg_number_value = Column(String, nullable=True)
    company_address = Column(String, nullable=False)
    company_city = Column(String, nullable=False)
    company_state = Column(String, nullable=True)
    company_postcode = Column(String, nullable=True)
    company_email = Column(String, nullable=False)
    company_website = Column(String, nullable=True)
    hr_contact_name = Column(String, nullable=False)
    hr_contact_title = Column(String, nullable=False)
    hr_email = Column(String, nullable=False)
    employer_accreditation_no = Column(String, nullable=True)
    signatory_name = Column(String, nullable=False)
    signatory_designation = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RefCounter(Base):
    __tablename__ = "ref_counter"

    id = Column(Integer, primary_key=True)
    last_number = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow)


class CompanyLogo(Base):
    __tablename__ = "company_logos"

    id = Column(String, primary_key=True)
    company_name = Column(String, nullable=False, index=True)
    filename = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class GeneratedDocument(Base):
    __tablename__ = "generated_documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=False)
    form_data_json = Column(Text, nullable=False)
    docx_filename = Column(String, nullable=True)
    pdf_filename = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    template = relationship("Template")
