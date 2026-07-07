"""
Thumbnail generator for .docx templates.
Pipeline: .docx → PDF (docx2pdf / LibreOffice) → PNG page 1 (pymupdf)
Fallback: python-docx + Pillow text render (works on Render without Word/LibreOffice)
"""

import logging
import os
import platform
import shutil
import subprocess
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_THUMBNAIL_WIDTH_PX = int(os.getenv("THUMBNAIL_WIDTH_PX", "1200"))


def generate_docx_thumbnail(
    docx_path: str,
    thumbnail_dir: str,
    template_id: int,
    width_px: int | None = None,
) -> Optional[str]:
    width_px = width_px or DEFAULT_THUMBNAIL_WIDTH_PX
    os.makedirs(thumbnail_dir, exist_ok=True)
    thumb_filename = f"thumb_{template_id}.png"
    thumb_path = os.path.join(thumbnail_dir, thumb_filename)

    pdf_path = _docx_to_pdf(docx_path)
    if pdf_path:
        try:
            if _pdf_to_png(pdf_path, thumb_path, width_px):
                return f"thumbnails/{thumb_filename}"
        finally:
            if os.path.exists(pdf_path):
                try:
                    os.remove(pdf_path)
                except OSError:
                    pass

    if _docx_text_thumbnail(docx_path, thumb_path, width_px):
        return f"thumbnails/{thumb_filename}"

    return None


def _pdf_to_png(pdf_path: str, thumb_path: str, width_px: int) -> bool:
    try:
        import fitz

        doc = fitz.open(pdf_path)
        page = doc[0]
        page_width = page.rect.width or 595
        zoom = width_px / page_width
        matrix = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=matrix, alpha=False, annots=True)
        pix.save(thumb_path)
        doc.close()
        return True
    except ImportError:
        logger.warning("pymupdf not installed. Run: pip install pymupdf")
        return False
    except Exception as exc:
        logger.warning("Thumbnail PNG generation failed: %s", exc)
        return False


def _docx_text_thumbnail(docx_path: str, thumb_path: str, width_px: int) -> bool:
    try:
        from docx import Document
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        logger.warning("python-docx or Pillow missing for text thumbnail fallback")
        return False

    try:
        doc = Document(docx_path)
        lines: list[str] = []
        for para in doc.paragraphs:
            text = (para.text or "").strip()
            if text:
                lines.append(text)
            if len(lines) >= 42:
                break

        if not lines:
            lines = ["Document preview"]

        height_px = int(width_px * 1.414)
        image = Image.new("RGB", (width_px, height_px), "white")
        draw = ImageDraw.Draw(image)

        try:
            title_font = ImageFont.truetype("arial.ttf", 22)
            body_font = ImageFont.truetype("arial.ttf", 16)
        except OSError:
            title_font = ImageFont.load_default()
            body_font = title_font

        margin_x = 56
        y = 48
        draw.text((margin_x, y), lines[0][:90], fill="#8B1A1A", font=title_font)
        y += 40

        for line in lines[1:36]:
            draw.text((margin_x, y), line[:100], fill="#222222", font=body_font)
            y += 28
            if y > height_px - 72:
                break

        draw.rectangle(
            [(24, 24), (width_px - 24, height_px - 24)],
            outline="#E8D8D8",
            width=2,
        )
        image.save(thumb_path, "PNG")
        return True
    except Exception as exc:
        logger.warning("Text thumbnail fallback failed: %s", exc)
        return False


def _docx_to_pdf(docx_path: str) -> Optional[str]:
    fd, tmp_pdf = tempfile.mkstemp(suffix=".pdf")
    os.close(fd)

    if platform.system() == "Windows":
        try:
            from services.pdf_converter import _windows_docx2pdf

            _windows_docx2pdf(docx_path, tmp_pdf)
            if os.path.exists(tmp_pdf) and os.path.getsize(tmp_pdf) > 0:
                return tmp_pdf
        except Exception as exc:
            logger.warning("docx2pdf failed for thumbnail: %s", exc)
        if os.path.exists(tmp_pdf):
            os.remove(tmp_pdf)
        return None

    libreoffice_cmd = shutil.which("libreoffice") or shutil.which("soffice")
    if not libreoffice_cmd:
        if os.path.exists(tmp_pdf):
            os.remove(tmp_pdf)
        return None

    tmp_dir = tempfile.mkdtemp()
    try:
        result = subprocess.run(
            [
                libreoffice_cmd,
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                tmp_dir,
                docx_path,
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        base = os.path.splitext(os.path.basename(docx_path))[0]
        pdf_out = os.path.join(tmp_dir, base + ".pdf")

        if result.returncode == 0 and os.path.exists(pdf_out):
            shutil.move(pdf_out, tmp_pdf)
            return tmp_pdf
    except Exception as exc:
        logger.warning("LibreOffice thumbnail failed: %s", exc)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        if os.path.exists(tmp_pdf) and os.path.getsize(tmp_pdf) == 0:
            os.remove(tmp_pdf)

    if os.path.exists(tmp_pdf):
        os.remove(tmp_pdf)
    return None


def regenerate_all_thumbnails(template_store_dir: str, templates: list) -> dict:
    thumbnail_dir = os.path.join(template_store_dir, "thumbnails")
    results: dict = {"success": [], "failed": [], "paths": {}}

    for template in templates:
        docx_path = os.path.join(template_store_dir, template.docx_filename)
        if not os.path.exists(docx_path):
            results["failed"].append(template.id)
            continue

        thumb_rel = generate_docx_thumbnail(
            docx_path, thumbnail_dir, template.id
        )
        if thumb_rel:
            results["success"].append(template.id)
            results["paths"][template.id] = thumb_rel
        else:
            results["failed"].append(template.id)

    return results
