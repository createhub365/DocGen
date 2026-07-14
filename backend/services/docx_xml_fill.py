"""
Fill {{placeholders}} by editing Word XML inside the .docx zip.
Only w:t text nodes change; drawings, stamps, logos, and layout stay intact.
"""
import re
import zipfile
from copy import deepcopy

from lxml import etree

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NSMAP = {"w": W_NS}
# Standard {{key}} and malformed {{key} (single closing brace — common Word split bug)
PLACEHOLDER_PATTERN = re.compile(r"\{\{([^}]+?)\}\}")
MALFORMED_PLACEHOLDER_PATTERN = re.compile(r"\{\{([^}]+?)\}(?!\})")

# Word parts that may contain placeholders
_XML_PREFIXES = (
    "word/document",
    "word/header",
    "word/footer",
    "word/footnotes",
    "word/endnotes",
    "word/comments",
)

# Wizard field ids → template placeholder ids (supports multiple aliases per field)
_WIZARD_FIELD_ALIASES: dict[str, list[str]] = {
    "candidate_full_name": ["cand_name", "candidate_name"],
    "candidate_date_of_birth": ["cand_dob", "date_of_birth"],
    "candidate_passport_number": ["cand_passport", "passport_number"],
    "candidate_nationality": ["cand_nationality", "nationality"],
    "candidate_address": ["country_of_residence"],
    "passport_expiry_date": ["passport_expiry"],
    "passport_issue_date": ["passport_issue"],
    "commencement_date": ["joining_date"],
    "position_title": ["position"],
    "issue_date": ["offer_date"],
    "work_location": ["location"],
    "contract_duration": ["duration"],
    "probation_period": ["probation"],
    "weekly_hours": ["working_hours"],
    "annual_salary": ["salary"],
    "candidate_sign_date": ["sign_date"],
    "pay_frequency": ["payment_frequency"],
    "overtime_rate": ["overtime_terms"],
    "accommodation_allowance": ["accommodation"],
    "travel_allowance": ["transport_allowance"],
    "medical_insurance": ["health_insurance"],
    "employer_accreditation_no": ["accreditation_number"],
    "validity_expiry_date": ["offer_validity"],
    "trade_duties": ["duties_block"],
    "relocation_assistance": ["other_benefits"],
    "professional_development": ["other_benefits"],
}

# Human-readable template labels → wizard field id (case-insensitive lookup)
_LABEL_TO_WIZARD = {
    "name": "candidate_full_name",
    "passport number": "candidate_passport_number",
    "nationality": "candidate_nationality",
    "address": "candidate_address",
    "position": "position_title",
    "salary": "annual_salary",
    "contractduration": "contract_duration",
    "contract duration": "contract_duration",
    "work visa duration": "contract_duration",
    "work visa": "contract_duration",
    "accommodation": "accommodation_allowance",
    "transportation": "travel_allowance",
    "medical insurance": "medical_insurance",
    "working hours": "weekly_hours",
    "date of birth": "candidate_date_of_birth",
    "email": "candidate_email",
    "reference number": "ref_number",
    "reference no": "ref_number",
    "issue date": "issue_date",
    "offer date": "issue_date",
    "department": "department",
    "trade": "position_title",
    "location": "work_location",
    "duration": "contract_duration",
    "probation": "probation_period",
    "probation period": "probation_period",
    "reporting to": "reporting_to",
    "notice period": "notice_period",
    "company name": "company_name",
    "company address": "company_address",
}


def _escape_xml_text(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _should_process_xml(filename: str) -> bool:
    if not filename.startswith("word/") or not filename.endswith(".xml"):
        return False
    base = filename.rsplit(".", 1)[0]
    return any(base.startswith(prefix) for prefix in _XML_PREFIXES)


def _merge_paragraph_runs(p_elem) -> None:
    """Merge split w:t nodes so {{placeholder}} tokens are contiguous before replacement."""
    t_nodes = p_elem.xpath(".//w:t", namespaces=NSMAP)
    if not t_nodes:
        return

    combined = "".join(t.text or "" for t in t_nodes)
    if "{{" not in combined or len(t_nodes) == 1:
        return

    t_nodes[0].text = combined
    for t in t_nodes[1:]:
        t.text = ""


def _normalize_form_data(form_data: dict) -> dict:
    normalized: dict = {}
    for key, value in form_data.items():
        k = str(key).strip()
        if k.startswith("{{") and k.endswith("}}"):
            k = k[2:-2].strip()
        normalized[k] = value
    return normalized


def _label_lookup_key(label: str) -> str:
    return re.sub(r"\s+", " ", label.strip().lower())


def _candidate_name_from_values(values: dict) -> str:
    for key in ("candidate_full_name", "candidate_name", "cand_name", "name"):
        val = values.get(key)
        if val is not None and str(val).strip():
            return str(val).strip()
    return ""


def _strip_duplicated_name_from_salutation(salutation: str, name: str) -> str:
    """Prevent 'Mr. John Doe John Doe' when salutation already includes the full name."""
    sal = (salutation or "").strip()
    name = (name or "").strip()
    if not sal or not name:
        return sal

    lower_sal = sal.lower()
    lower_name = name.lower()
    if lower_sal == lower_name:
        return sal

    # Trailing name: "Mr. Rajinder Sinngh" → "Mr."
    if lower_sal.endswith(lower_name):
        prefix = sal[: -len(name)].strip(" ,")
        return prefix or sal

    # Name embedded after title with extra spaces
    idx = lower_sal.find(lower_name)
    if idx > 0:
        prefix = sal[:idx].strip(" ,")
        suffix = sal[idx + len(name) :].strip(" ,")
        if not suffix:
            return prefix or sal

    return sal


def _dedupe_salutation_against_name(values: dict) -> None:
    """If salutation already contains the candidate name, keep title/prefix only."""
    name = _candidate_name_from_values(values)
    if not name:
        return

    # Only dedupe when a separate name field will also be filled in the document.
    has_name_field = any(
        values.get(key) not in (None, "")
        for key in ("candidate_full_name", "candidate_name", "cand_name")
    )
    if not has_name_field:
        return

    for key in ("candidate_salutation", "salutation"):
        if key not in values or values[key] is None:
            continue
        values[key] = _strip_duplicated_name_from_salutation(str(values[key]), name)


def _build_replacement_values(form_data: dict) -> dict:
    """Expand wizard field ids to template placeholder ids and human-readable labels."""
    values = _normalize_form_data(form_data)

    for wizard_key, alias_ids in _WIZARD_FIELD_ALIASES.items():
        if wizard_key not in values or values[wizard_key] is None:
            continue
        for alias_id in alias_ids:
            if alias_id not in values:
                values[alias_id] = values[wizard_key]

    if values.get("validity_expiry_date") and "offer_validity" not in values:
        values["offer_validity"] = values["validity_expiry_date"]
    elif values.get("validity_days") and "offer_validity" not in values:
        values["offer_validity"] = f"{values['validity_days']} days"

    if "work_location" in values and "location" not in values:
        values["location"] = values["work_location"]
    if "location" in values and "work_location" not in values:
        values["work_location"] = values["location"]
    if "position_title" in values and "position" not in values:
        values["position"] = values["position_title"]
    if "issue_date" in values and "offer_date" not in values:
        values["offer_date"] = values["issue_date"]

    # Keep candidate_full_name / candidate_name in sync before salutation dedupe
    if values.get("candidate_full_name") and not values.get("candidate_name"):
        values["candidate_name"] = values["candidate_full_name"]
    if values.get("candidate_name") and not values.get("candidate_full_name"):
        values["candidate_full_name"] = values["candidate_name"]

    _dedupe_salutation_against_name(values)

    for label, wizard_key in _LABEL_TO_WIZARD.items():
        if wizard_key not in values:
            continue
        value = values[wizard_key]
        values[label] = value
        title = " ".join(word.capitalize() for word in label.split())
        values[title] = value
        compact = label.replace(" ", "")
        values[compact] = value
        if compact:
            values[compact[0].upper() + compact[1:]] = value

    return values


def _resolve_placeholder_value(placeholder_id: str, values: dict) -> str | None:
    pid = placeholder_id.strip()
    if not pid:
        return None

    if pid in values and values[pid] is not None:
        return str(values[pid])

    lower_index = {str(k).lower(): k for k in values}
    direct = lower_index.get(pid.lower())
    if direct is not None and values[direct] is not None:
        return str(values[direct])

    wizard_key = _LABEL_TO_WIZARD.get(_label_lookup_key(pid))
    if wizard_key and wizard_key in values and values[wizard_key] is not None:
        return str(values[wizard_key])

    compact = pid.replace(" ", "")
    if compact in values and values[compact] is not None:
        return str(values[compact])

    return None


def _iter_placeholders(text: str) -> list[tuple[str, str]]:
    """Return (placeholder_id, full_token) pairs; standard tokens win over malformed overlaps."""
    found: list[tuple[int, int, str, str]] = []

    for match in PLACEHOLDER_PATTERN.finditer(text):
        found.append((match.start(), match.end(), match.group(1), match.group(0)))

    for match in MALFORMED_PLACEHOLDER_PATTERN.finditer(text):
        start, end = match.start(), match.end()
        if any(start >= s and end <= e for s, e, _, _ in found):
            continue
        found.append((start, end, match.group(1), match.group(0)))

    found.sort(key=lambda item: item[0])
    return [(pid, token) for _, _, pid, token in found]


def _clear_paragraph_runs(p_elem) -> None:
    for child in list(p_elem):
        if etree.QName(child).localname != "pPr":
            p_elem.remove(child)


def _set_paragraph_multiline_text(p_elem, text: str) -> None:
    """Write text with Word line breaks so each duty appears on its own line in PDF."""
    _clear_paragraph_runs(p_elem)
    lines = text.split("\n")
    for index, line in enumerate(lines):
        run = etree.SubElement(p_elem, f"{{{W_NS}}}r")
        if line:
            text_node = etree.SubElement(run, f"{{{W_NS}}}t")
            if line.startswith(" ") or line.endswith(" "):
                text_node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
            text_node.text = line
        if index < len(lines) - 1:
            etree.SubElement(run, f"{{{W_NS}}}br")


def _set_paragraph_single_line_text(p_elem, text: str, t_nodes: list | None = None) -> None:
    if t_nodes is None:
        t_nodes = p_elem.xpath(".//w:t", namespaces=NSMAP)
    if t_nodes:
        t_nodes[0].text = text
        for node in t_nodes[1:]:
            node.text = ""
        return
    _clear_paragraph_runs(p_elem)
    run = etree.SubElement(p_elem, f"{{{W_NS}}}r")
    text_node = etree.SubElement(run, f"{{{W_NS}}}t")
    text_node.text = text


def _paragraph_is_placeholder_only(combined: str, token: str) -> bool:
    return combined.replace(token, "").strip() == ""


def _strip_leading_bullet(line: str) -> str:
    text = (line or "").strip()
    for prefix in ("• ", "•", "- ", "* ", "– ", "— "):
        if text.startswith(prefix):
            return text[len(prefix) :].strip()
    return text


def _ensure_ppr(p_elem):
    pPr = p_elem.find(f"{{{W_NS}}}pPr")
    if pPr is None:
        pPr = etree.Element(f"{{{W_NS}}}pPr")
        p_elem.insert(0, pPr)
    return pPr


def _apply_bullet_list_props(p_elem) -> None:
    """
    Word-style bullet list layout (hanging indent):
    bullet hangs left, wrapped lines align under the first text character.
    """
    pPr = _ensure_ppr(p_elem)

    for child in list(pPr):
        local = etree.QName(child).localname
        if local in {"ind", "spacing", "numPr"}:
            pPr.remove(child)

    ind = etree.SubElement(pPr, f"{{{W_NS}}}ind")
    # 0.5" left + 0.25" hanging ≈ grey Word bullets with clean wrap
    ind.set(f"{{{W_NS}}}left", "720")
    ind.set(f"{{{W_NS}}}hanging", "360")

    spacing = etree.SubElement(pPr, f"{{{W_NS}}}spacing")
    spacing.set(f"{{{W_NS}}}after", "80")
    spacing.set(f"{{{W_NS}}}before", "0")
    spacing.set(f"{{{W_NS}}}line", "276")
    spacing.set(f"{{{W_NS}}}lineRule", "auto")


def _copy_first_run_props(source_p, target_run) -> None:
    """Preserve italic/font from the original placeholder run when possible."""
    for run in source_p.xpath("./w:r", namespaces=NSMAP):
        rPr = run.find(f"{{{W_NS}}}rPr")
        if rPr is not None:
            target_run.insert(0, deepcopy(rPr))
            return


def _set_duty_bullet_paragraph(p_elem, duty_text: str, style_source=None) -> None:
    props_source = style_source if style_source is not None else p_elem
    _clear_paragraph_runs(p_elem)
    _apply_bullet_list_props(p_elem)

    run = etree.SubElement(p_elem, f"{{{W_NS}}}r")
    _copy_first_run_props(props_source, run)
    text_node = etree.SubElement(run, f"{{{W_NS}}}t")
    text = f"• {_strip_leading_bullet(duty_text)}"
    if text.startswith(" ") or text.endswith(" "):
        text_node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    text_node.text = text


def _split_duties_into_paragraphs(p_elem, text: str) -> None:
    """One duty per bullet paragraph — hanging-indent list like Word List Bullet."""
    parent = p_elem.getparent()
    lines = [_strip_leading_bullet(line) for line in text.split("\n") if line.strip()]
    lines = [line for line in lines if line]
    if not lines:
        _clear_paragraph_runs(p_elem)
        return
    if parent is None:
        _set_duty_bullet_paragraph(p_elem, "\n".join(lines))
        return

    # Keep a clean style clone of the placeholder paragraph (before overwrite)
    style_source = deepcopy(p_elem)

    anchor_index = list(parent).index(p_elem)
    _set_duty_bullet_paragraph(p_elem, lines[0], style_source=style_source)

    for offset, line in enumerate(lines[1:], start=1):
        new_paragraph = deepcopy(style_source)
        _set_duty_bullet_paragraph(new_paragraph, line, style_source=style_source)
        parent.insert(anchor_index + offset, new_paragraph)


def _replace_in_paragraph(p_elem, form_data: dict) -> bool:
    _merge_paragraph_runs(p_elem)

    t_nodes = p_elem.xpath(".//w:t", namespaces=NSMAP)
    if not t_nodes:
        return False

    combined = "".join(t.text or "" for t in t_nodes)
    if "{{" not in combined:
        return False

    new_combined = combined
    changed = False
    seen_tokens: set[str] = set()

    for placeholder_id, token in _iter_placeholders(combined):
        if token in seen_tokens:
            continue
        seen_tokens.add(token)

        value = _resolve_placeholder_value(placeholder_id, form_data)
        if value is None:
            continue

        repl = _escape_xml_text(value)
        if token.endswith("}") and not token.endswith("}}"):
            end_idx = new_combined.find(token)
            if end_idx != -1:
                after = new_combined[end_idx + len(token) :]
                if after and after[0].isupper():
                    repl = f"{repl}\n"
        if token in new_combined:
            new_combined = new_combined.replace(token, repl)
            changed = True

    if not changed or new_combined == combined:
        return changed

    duty_tokens = {
        token
        for pid, token in _iter_placeholders(combined)
        if pid in {"duties_block", "trade_duties"}
        and _paragraph_is_placeholder_only(combined, token)
    }
    if duty_tokens and "\n" in new_combined:
        _split_duties_into_paragraphs(p_elem, new_combined)
    elif "\n" in new_combined:
        _set_paragraph_multiline_text(p_elem, new_combined)
    else:
        _set_paragraph_single_line_text(p_elem, new_combined, t_nodes)
    return True


def _process_xml_bytes(data: bytes, form_data: dict) -> bytes:
    if b"{{" not in data:
        return data

    root = etree.fromstring(data)
    replacement_values = _build_replacement_values(form_data)

    for p in root.xpath(".//w:p", namespaces=NSMAP):
        _replace_in_paragraph(p, replacement_values)

    return etree.tostring(
        root,
        xml_declaration=True,
        encoding="UTF-8",
        standalone=True,
    )


def fill_docx_zip(template_path: str, form_data: dict, output_path: str) -> str:
    """Copy template zip and replace placeholders in Word XML parts only."""
    replacement_values = _build_replacement_values(form_data)

    with zipfile.ZipFile(template_path, "r") as zin:
        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if _should_process_xml(item.filename):
                    data = _process_xml_bytes(data, replacement_values)
                zout.writestr(item, data)
    return output_path


def _collect_text_from_element(elem) -> str:
    """Gather all w:t text under an XML element (paragraphs, text boxes, etc.)."""
    t_nodes = elem.xpath(".//w:t", namespaces=NSMAP)
    return "".join(t.text or "" for t in t_nodes)


def _collect_placeholder_ids_from_text(combined: str, seen: set, ordered: list[str]) -> None:
    if "{{" not in combined:
        return
    for pid, _token in _iter_placeholders(combined):
        key = pid.strip()
        if key and key not in seen:
            seen.add(key)
            ordered.append(key)


def extract_placeholder_ids_from_docx(docx_path: str) -> list[str]:
    """Scan all Word XML parts for {{id}} without modifying the file."""
    seen: set[str] = set()
    ordered: list[str] = []

    with zipfile.ZipFile(docx_path, "r") as zf:
        for name in zf.namelist():
            if not _should_process_xml(name):
                continue
            data = zf.read(name)
            if b"{{" not in data:
                continue
            root = etree.fromstring(data)

            for p in root.xpath(".//w:p", namespaces=NSMAP):
                _collect_placeholder_ids_from_text(_collect_text_from_element(p), seen, ordered)

            for txbx in root.xpath(".//w:txbxContent", namespaces=NSMAP):
                _collect_placeholder_ids_from_text(_collect_text_from_element(txbx), seen, ordered)

    return ordered
