"""Pydantic schemas for multi-tenant platform models (Phase 1 — data layer)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator


# ---- Organization / signup ----


class OrgSignupRequest(BaseModel):
    """Public platform signup: creates User + Organization + OrgUser(org_admin)."""

    name: str
    slug: str
    username: str
    password: str
    full_name: Optional[str] = ""


class OrgSignupResponse(BaseModel):
    organization: "OrganizationRead"
    user_id: int
    role: str
    access_token: str


class PlatformLoginRequest(BaseModel):
    username: str
    password: str


class PlatformLoginResponse(BaseModel):
    organization: "OrganizationRead"
    user_id: int
    role: str
    access_token: str


class OrganizationCreate(BaseModel):
    name: str
    slug: str
    is_active: bool = True


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    is_active: Optional[bool] = None


class OrganizationThemeUpdate(BaseModel):
    """Set org UI theme preset. Null clears to the classic maroon/gold default."""

    theme_key: Optional[str] = None


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    created_at: datetime
    is_active: bool
    has_logo: bool = False
    logo_url: Optional[str] = None
    theme_key: Optional[str] = None


# ---- OrgUser ----


class OrgUserCreate(BaseModel):
    org_id: str
    user_id: int
    role: str = "staff"  # org_admin | staff


class OrgUserUpdate(BaseModel):
    role: Optional[str] = None


class OrgUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    org_id: str
    user_id: int
    role: str
    created_at: datetime
    # Populated by list/invite/role handlers (joined from User); not ORM columns.
    username: Optional[str] = None
    email: Optional[str] = None


class OrgUserInviteRequest(BaseModel):
    """Invite contact email (stored on User.email; username currently mirrors email)."""

    email: str
    role: str = "staff"  # staff | org_admin


class OrgUserRoleUpdate(BaseModel):
    role: str


class OrgUserInviteResponse(BaseModel):
    membership: OrgUserRead
    username: str
    temporary_password: Optional[str] = None


# ---- OrgDocumentType (platform DocumentType) ----

DEFAULT_DOC_TYPE_ICON = "file-text"
ALLOWED_DOC_TYPE_ICONS = frozenset(
    {
        "file-text",
        "file-word",
        "file-done",
        "form",
        "profile",
        "idcard",
        "audit",
        "solution",
        "team",
        "bank",
        "schedule",
        "safety",
        "read",
        "contacts",
        "global",
    }
)


def normalize_doc_type_icon(value: Optional[str]) -> str:
    key = (value or "").strip().lower()
    if key in ALLOWED_DOC_TYPE_ICONS:
        return key
    return DEFAULT_DOC_TYPE_ICON


class OrgDocumentTypeCreateRequest(BaseModel):
    """API body: org_id is taken from the auth context, never from the client."""

    name: str
    slug: str
    description: Optional[str] = None
    icon: Optional[str] = None


class OrgDocumentTypeCreate(BaseModel):
    org_id: str
    name: str
    slug: str
    description: Optional[str] = None
    icon: Optional[str] = None
    is_active: bool = True
    created_by: Optional[int] = None


class OrgDocumentTypeUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None


class OrgDocumentTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    org_id: str
    name: str
    slug: str
    description: Optional[str] = None
    icon: str = DEFAULT_DOC_TYPE_ICON
    is_active: bool
    created_at: datetime
    created_by: Optional[int] = None

    @field_validator("icon", mode="before")
    @classmethod
    def _coerce_icon(cls, value):
        return normalize_doc_type_icon(value)


class OrgDocumentTypeListRead(OrgDocumentTypeRead):
    """Document type plus flow-state flags computed by the list query."""

    has_published_flow: bool
    has_draft_flow: bool


# Aliases matching the product name "DocumentType" for API-layer clarity later.
DocumentTypeCreate = OrgDocumentTypeCreate
DocumentTypeUpdate = OrgDocumentTypeUpdate
DocumentTypeRead = OrgDocumentTypeRead


# ---- FlowConfig ----


class FlowConfigCreateRequest(BaseModel):
    """API body for POST /{document_type_id}/flow — document_type_id comes from path."""

    version: Optional[int] = None


class FlowConfigCreate(BaseModel):
    document_type_id: int
    version: int = 1
    is_published: bool = False


class FlowConfigUpdate(BaseModel):
    version: Optional[int] = None
    is_published: Optional[bool] = None


class FlowConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_type_id: Optional[int] = None
    template_id: Optional[int] = None
    version: int
    is_published: bool
    created_at: datetime


# ---- FlowStep ----


class FlowStepCreateRequest(BaseModel):
    """API body for POST /{flow_config_id}/steps — flow_config_id comes from path."""

    step_type: str
    order_index: int = 0
    is_enabled: bool = True
    label: str
    config_json: Optional[dict[str, Any]] = None


class FlowStepCreate(BaseModel):
    flow_config_id: int
    step_type: str
    order_index: int = 0
    is_enabled: bool = True
    label: str
    config_json: Optional[dict[str, Any]] = None


class FlowStepUpdate(BaseModel):
    step_type: Optional[str] = None
    order_index: Optional[int] = None
    is_enabled: Optional[bool] = None
    label: Optional[str] = None
    config_json: Optional[dict[str, Any]] = None


class FlowStepRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    flow_config_id: int
    step_type: str
    order_index: int
    is_enabled: bool
    label: str
    config_json: Optional[dict[str, Any]] = None


# ---- FieldDefinition ----


class FieldDefinitionCreateRequest(BaseModel):
    """API body — flow_step_id comes from the path."""

    field_key: str
    field_label: str
    field_type: str  # text | number | date | dropdown
    is_required: bool = False
    options_json: Optional[Any] = None
    option_list_id: Optional[int] = None
    is_auto_generated: bool = False
    auto_config_json: Optional[Any] = None


class FieldDefinitionCreate(BaseModel):
    flow_step_id: int
    field_key: str
    field_label: str
    field_type: str  # text | number | date | dropdown
    is_required: bool = False
    options_json: Optional[Any] = None
    option_list_id: Optional[int] = None
    is_auto_generated: bool = False
    auto_config_json: Optional[Any] = None


class FieldDefinitionUpdate(BaseModel):
    field_key: Optional[str] = None
    field_label: Optional[str] = None
    field_type: Optional[str] = None
    is_required: Optional[bool] = None
    options_json: Optional[Any] = None
    option_list_id: Optional[int] = None
    is_auto_generated: Optional[bool] = None
    auto_config_json: Optional[Any] = None


class FieldDefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    flow_step_id: int
    field_key: str
    field_label: str
    field_type: str
    is_required: bool
    options_json: Optional[Any] = None
    option_list_id: Optional[int] = None
    is_auto_generated: bool = False
    auto_config_json: Optional[Any] = None
    # List-wins resolved options for generate / UI (None when not a dropdown).
    effective_options: Optional[Any] = None


# ---- Org option lists (Phase 12) ----


class OrgOptionListCreate(BaseModel):
    name: str
    slug: str


class OrgOptionListUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None


class OrgOptionListItemCreate(BaseModel):
    value: str
    label: str
    sort_order: int = 0
    is_active: bool = True


class OrgOptionListItemUpdate(BaseModel):
    value: Optional[str] = None
    label: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class OrgOptionListItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    list_id: int
    value: str
    label: str
    sort_order: int
    is_active: bool


class OrgOptionListRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    org_id: str
    name: str
    slug: str
    created_at: datetime
    items: list[OrgOptionListItemRead] = []


class OrgOptionListSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    org_id: str
    name: str
    slug: str
    created_at: datetime
    item_count: int = 0


# ---- PlaceholderMapping ----


class PlaceholderMappingCreate(BaseModel):
    template_id: int
    placeholder_key: str
    field_key: str
    is_mapped: bool = False


class PlaceholderMappingUpdate(BaseModel):
    placeholder_key: Optional[str] = None
    field_key: Optional[str] = None
    is_mapped: Optional[bool] = None


class PlaceholderMappingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    template_id: int
    placeholder_key: str
    field_key: str
    is_mapped: bool


# ---- Template / GeneratedDocument org fields (partial updates for Phase 1) ----


class TemplateOrgFieldsUpdate(BaseModel):
    """Optional tenant fields on existing Template rows."""

    org_id: Optional[str] = None
    org_document_type_id: Optional[int] = None


class TemplateDisplayNameUpdate(BaseModel):
    """Rename a platform template's user-facing display name."""

    display_name: str


class TemplatePatch(BaseModel):
    """Partial update: rename and/or move between folders (folder_id null clears)."""

    display_name: Optional[str] = None
    folder_id: Optional[int] = None


class TemplateBulkDeleteRequest(BaseModel):
    template_ids: list[int]


class TemplateBulkMoveRequest(BaseModel):
    template_ids: list[int]
    folder_id: Optional[int] = None


class TemplateBulkFailure(BaseModel):
    id: int
    reason: str


class TemplateBulkResult(BaseModel):
    succeeded: list[int]
    failed: list[TemplateBulkFailure]


class TemplateFolderCreate(BaseModel):
    name: str


class TemplateFolderUpdate(BaseModel):
    name: str


class TemplateFolderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    org_id: str
    org_document_type_id: int
    name: str
    created_at: datetime


class GeneratedDocumentOrgFieldsUpdate(BaseModel):
    org_id: Optional[str] = None


# ---- Placeholder mapping / org generate ----


class PlaceholderMappingItem(BaseModel):
    placeholder_key: str
    field_key: str


class PlaceholderMappingBatchRequest(BaseModel):
    mappings: list[PlaceholderMappingItem]


class PlaceholderMappingListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    template_id: int
    placeholder_key: str
    field_key: str
    is_mapped: bool


class PlaceholderMappingsResponse(BaseModel):
    template_id: int
    is_complete: bool
    detected_placeholders: list[str]
    mappings: list[PlaceholderMappingListItem]
    unmapped_placeholders: list[str]


class GeneratedFieldFromPlaceholderItem(BaseModel):
    field_key: str
    field_label: str


class PossibleDuplicateFieldItem(BaseModel):
    """Placeholder held for admin review — similar to existing field_key(s)."""

    placeholder: str
    proposed_field_key: str
    proposed_field_label: str
    similar_field_keys: list[str]


class GenerateFieldsFromPlaceholdersRequest(BaseModel):
    """
    Optional follow-up after a preview/create pass.

    When ``create_placeholders`` is set, only those placeholders are created
    (admin confirmed after fuzzy-duplicate review). Exact matches are still skipped.
    """

    create_placeholders: Optional[list[str]] = None


class GenerateFieldsFromPlaceholdersResponse(BaseModel):
    template_id: int
    flow_config_id: int
    flow_step_id: int
    created: list[GeneratedFieldFromPlaceholderItem]
    skipped_placeholders: list[str]
    possible_duplicates: list[PossibleDuplicateFieldItem] = []


class OrgGenerateRequest(BaseModel):
    template_id: Optional[int] = None
    fields: dict[str, Any] = {}


class OrgGenerateResponse(BaseModel):
    document_id: int
    docx_url: str
    pdf_url: Optional[str] = None
    pdf_available: bool = False
    filename: Optional[str] = None


# ---- Share / Telegram / Email ----


class ShareLinkResponse(BaseModel):
    token: str
    share_url: str
    expires_at: datetime


class SendTelegramRequest(BaseModel):
    telegram_contact_id: int


class SendEmailRequest(BaseModel):
    recipient_email: str
    message: Optional[str] = None

    @field_validator("recipient_email")
    @classmethod
    def _email_required(cls, v: str) -> str:
        value = (v or "").strip()
        if not value or "@" not in value:
            raise ValueError("A valid recipient email is required")
        return value


class TelegramContactCreate(BaseModel):
    label: str
    chat_id: str


class TelegramContactUpdate(BaseModel):
    label: Optional[str] = None
    chat_id: Optional[str] = None


class TelegramContactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    org_id: str
    label: str
    chat_id: str
    created_at: datetime


# ---- Org Trade Bank ----


class OrgTradeCreate(BaseModel):
    name: str
    duties_text: str = ""


class OrgTradeUpdate(BaseModel):
    name: Optional[str] = None
    duties_text: Optional[str] = None


class OrgTradeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    org_id: str
    name: str
    duties_text: str
    created_at: datetime


class OrgTradeSeedResult(BaseModel):
    created: int
    skipped: int
    total_legacy: int
