import os
import platform
import shutil
import subprocess

from fastapi import HTTPException


def _libreoffice_bin() -> str | None:
    configured = os.getenv("LIBREOFFICE_PATH", "").strip()
    candidates: list[str | None] = []
    if configured:
        candidates.append(configured)
    candidates.extend(
        [
            shutil.which("libreoffice"),
            shutil.which("soffice"),
            "/usr/bin/libreoffice",
            "/usr/bin/soffice",
            "/usr/lib/libreoffice/program/soffice",
        ]
    )
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return None


def pdf_converter_available() -> tuple[bool, str]:
    if platform.system() == "Windows":
        try:
            from docx2pdf import convert  # noqa: F401

            return True, "docx2pdf"
        except ImportError:
            return False, "docx2pdf not installed"
    if _libreoffice_bin():
        return True, "libreoffice"
    return False, "LibreOffice not installed"


def try_convert_to_pdf(docx_path: str, output_dir: str) -> tuple[str | None, str | None]:
    try:
        return _convert(docx_path, output_dir), None
    except HTTPException as exc:
        return None, exc.detail
    except Exception as exc:
        return None, str(exc)[:300]


def _convert(docx_path: str, output_dir: str) -> str:
    docx_path = os.path.abspath(docx_path)
    output_dir = os.path.abspath(output_dir)
    os.makedirs(output_dir, exist_ok=True)

    base = os.path.splitext(os.path.basename(docx_path))[0]
    pdf_path = os.path.join(output_dir, base + ".pdf")

    if platform.system() == "Windows":
        from docx2pdf import convert

        convert(docx_path, pdf_path)
    else:
        lo_bin = _libreoffice_bin()
        if not lo_bin:
            raise HTTPException(
                status_code=503,
                detail="LibreOffice not found. Install libreoffice-writer on the server.",
            )

        result = subprocess.run(
            [
                lo_bin,
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                output_dir,
                docx_path,
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )

        if result.returncode != 0 or not os.path.exists(pdf_path):
            raise HTTPException(
                status_code=500,
                detail=f"LibreOffice failed: {(result.stderr or result.stdout or 'conversion failed')[:200]}",
            )

    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=500, detail="PDF not created")

    return pdf_path
