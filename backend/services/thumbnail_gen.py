"""
Thumbnail generator for .docx templates.
Pipeline: .docx → PDF (docx2pdf) → PNG page 1 (pymupdf)

Uses pymupdf (fitz) — no poppler required.
Works on Windows with Microsoft Word installed.
"""

import logging
import os
import platform
import shutil
import subprocess
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)

# ~A4 width at 150+ DPI — sharp in modal; cards downscale cleanly
DEFAULT_THUMBNAIL_WIDTH_PX = int(os.getenv("THUMBNAIL_WIDTH_PX", "1200"))


def generate_docx_thumbnail(
    docx_path: str,
    thumbnail_dir: str,
    template_id: int,
    width_px: int | None = None,
) -> Optional[str]:
    """
    Generate PNG thumbnail of page 1 of a .docx file.

    Returns relative path like "thumbnails/thumb_3.png" or None if failed.
    """
    width_px = width_px or DEFAULT_THUMBNAIL_WIDTH_PX
    os.makedirs(thumbnail_dir, exist_ok=True)
    thumb_filename = f"thumb_{template_id}.png"
    thumb_path = os.path.join(thumbnail_dir, thumb_filename)

    pdf_path = _docx_to_pdf(docx_path)
    if not pdf_path:
        return None

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
        return f"thumbnails/{thumb_filename}"
    except ImportError:
        logger.warning("pymupdf not installed. Run: pip install pymupdf")
        return None
    except Exception as exc:
        logger.warning("Thumbnail PNG generation failed: %s", exc)
        return None
    finally:
        if pdf_path and os.path.exists(pdf_path):
            try:
                os.remove(pdf_path)
            except OSError:
                pass


def _docx_to_pdf(docx_path: str) -> Optional[str]:
    """Convert .docx to PDF. Returns temp PDF path or None if failed."""
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

    if not shutil.which("libreoffice"):
        logger.warning("LibreOffice not found — thumbnail skipped")
        if os.path.exists(tmp_pdf):
            os.remove(tmp_pdf)
        return None

    tmp_dir = tempfile.mkdtemp()
    try:
        result = subprocess.run(
            [
                "libreoffice",
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                tmp_dir,
                docx_path,
            ],
            capture_output=True,
            text=True,
            timeout=30,
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
        if os.path.exists(tmp_pdf) and not os.path.getsize(tmp_pdf):
            os.remove(tmp_pdf)

    if os.path.exists(tmp_pdf):
        os.remove(tmp_pdf)
    return None


def regenerate_all_thumbnails(template_store_dir: str, templates: list) -> dict:
    """
    Regenerate thumbnails for all templates.

    Returns {"success": [ids], "failed": [ids], "paths": {id: rel_path}}
    """
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
