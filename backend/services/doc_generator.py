from services.docx_xml_fill import fill_docx_zip
from services.docx_enhance import inject_logo, inject_ref_barcode
from services.trade_bank import format_duties_for_docx


def fill_template(
    template_path: str,
    form_data: dict,
    output_path: str,
    logo_path: str | None = None,
    trade_duties: list[str] | None = None,
) -> str:
    data = dict(form_data)
    if trade_duties:
        duties_text = format_duties_for_docx(trade_duties)
        data["trade_duties"] = duties_text
        data["duties_block"] = duties_text
    if logo_path:
        data.pop("company_logo", None)

    data.pop("ref_number_barcode", None)
    ref_number = data.get("ref_number") or None
    issue_date = data.get("issue_date")

    fill_docx_zip(template_path, data, output_path)

    if logo_path:
        inject_logo(output_path, logo_path)

    if ref_number:
        inject_ref_barcode(output_path, ref_number, issue_date)

    return output_path


generate_document = fill_template
