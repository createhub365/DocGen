from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str


class LoginResponse(BaseModel):
    role: str
    username: str
    name: str
    access_token: str


class UserResponse(BaseModel):
    id: int
    username: str
    name: str
    role: str
    is_active: bool = True
    created_at: Optional[str] = None


class UserUpdate(BaseModel):
    username: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserPasswordUpdate(BaseModel):
    password: str


class CountryResponse(BaseModel):
    id: int
    name: str
    code: str


class TradeResponse(BaseModel):
    id: int
    name: str
    country_id: int


class CompanyResponse(BaseModel):
    id: int
    name: str
    has_template: bool
    trade_id: int | None = None


class DocumentTypeResponse(BaseModel):
    id: int
    name: str
    slug: str


class PlaceholderSchema(BaseModel):
    id: str
    label: str
    type: str
    required: bool


class TemplateFieldsResponse(BaseModel):
    template_id: int
    placeholders: List[PlaceholderSchema]


class GenerateRequest(BaseModel):
    template_id: Optional[int] = None
    template: Optional[Dict[str, str]] = None
    employer_id: Optional[int] = None
    trade: Optional[str] = None
    trade_category: Optional[str] = None
    form_data: Dict[str, Any] = {}
    fields: Optional[Dict[str, Any]] = None

    def resolved_fields(self) -> Dict[str, Any]:
        return self.fields if self.fields is not None else self.form_data


class GenerateResponse(BaseModel):
    document_id: int
    docx_url: str
    pdf_url: Optional[str] = None
    pdf_warning: Optional[str] = None
    pdf_available: bool = True
    pdf_error: Optional[str] = None
    filename: Optional[str] = None


class DocumentListItem(BaseModel):
    id: int
    created_at: datetime
    doc_type_name: str
    company_name: str
    country_name: str
    trade_name: str
    docx_url: str
    pdf_url: Optional[str] = None
    username: Optional[str] = None


class PaginatedDocumentsResponse(BaseModel):
    items: List[DocumentListItem]
    total: int
    page: int
    limit: int
    pages: int


class CountryCreate(BaseModel):
    name: str
    code: str


class TradeCreate(BaseModel):
    name: str
    country_id: int


class OccupationCodeEntry(BaseModel):
    code: str
    title: str


class TradeBankEntry(BaseModel):
    """JSON trade-bank record (complete_trade_bank.json / custom trades)."""
    trade: str
    occupation_codes: dict[str, OccupationCodeEntry] = {}
    anzsco_code: Optional[str] = None
    anzsco_title: Optional[str] = None
    responsibilities: list[str] = []
    duties_generic: list[str] = []
    duties_by_country: dict[str, list[str]] = {}
    duties: list[str] = []


class CompanyCreate(BaseModel):
    name: str
    trade_id: int
    country_id: int


class UserCreate(BaseModel):
    username: str
    name: str
    password: str
    role: str = "staff"


class TemplateUpdate(BaseModel):
    label_overrides_json: Optional[str] = None
    is_active: Optional[bool] = None


class AdminStatsResponse(BaseModel):
    total_documents_generated: int
    total_active_templates: int
    total_companies: int
    documents_today: int
    documents_this_month: int
