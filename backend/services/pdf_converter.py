import os
import platform
import shutil
import subprocess
import threading

import psutil
from fastapi import HTTPException

_WORD_CONVERT_LOCK = threading.Lock()





def _windows_docx2pdf(docx_path: str, pdf_path: str) -> None:
    """
    Convert DOCX to PDF via Microsoft Word COM automation.

    CoInitialize is required when running inside uvicorn worker threads.
    """
    import pythoncom
    from docx2pdf import convert

    with _WORD_CONVERT_LOCK:
        coinit = False
        try:
            pythoncom.CoInitialize()
            coinit = True
        except pythoncom.com_error:
            pass

        try:
            convert(docx_path, pdf_path)
        finally:
            if coinit:
                pythoncom.CoUninitialize()


def _kill_orphan_word_processes():

    """

    Kill orphaned WINWORD.EXE / LibreOffice processes after timeout or crash.

    Best-effort — headless conversion should not leave interactive Word open.

    """

    try:

        for proc in psutil.process_iter(["name", "pid"]):

            try:

                name = proc.info.get("name") or ""

                if name.upper() in ("WINWORD.EXE", "SOFFICE.EXE", "SOFFICE.BIN"):

                    proc.kill()

            except (psutil.NoSuchProcess, psutil.AccessDenied):

                pass

    except Exception:

        pass





def pdf_converter_available() -> tuple[bool, str]:

    if platform.system() != "Windows":

        return False, "Not Windows"

    try:

        from docx2pdf import convert  # noqa: F401

    except ImportError:

        return False, "docx2pdf not installed. Run: pip install docx2pdf"

    try:

        import winreg



        key = winreg.OpenKey(

            winreg.HKEY_LOCAL_MACHINE,

            r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\WINWORD.EXE",

        )

        word_path = winreg.QueryValue(key, None)

        winreg.CloseKey(key)

        if word_path and os.path.exists(word_path):

            return True, word_path

        return False, f"Word not found at: {word_path}"

    except Exception as exc:

        return False, f"Word not installed: {exc}"





def try_convert_to_pdf(docx_path: str, output_dir: str) -> tuple[str | None, str | None]:

    """

    Convert DOCX to PDF.

    Returns: (pdf_path, error_message)

    Never raises — always returns tuple.

    """

    try:

        return _convert(docx_path, output_dir), None

    except HTTPException as exc:

        return None, exc.detail

    except Exception as exc:

        return None, str(exc)[:300]





def _convert(docx_path: str, output_dir: str) -> str:

    available, word_path_or_err = pdf_converter_available()

    if not available:

        raise HTTPException(status_code=503, detail=word_path_or_err)



    docx_path = os.path.abspath(docx_path)

    output_dir = os.path.abspath(output_dir)

    os.makedirs(output_dir, exist_ok=True)



    base = os.path.splitext(os.path.basename(docx_path))[0]

    pdf_path = os.path.join(output_dir, base + ".pdf")



    if platform.system() == "Windows":
        try:
            _windows_docx2pdf(docx_path, pdf_path)
        except ImportError as exc:
            raise HTTPException(
                status_code=503,
                detail="docx2pdf not installed. Run: pip install docx2pdf",
            ) from exc
        except Exception as exc:
            _kill_orphan_word_processes()
            raise HTTPException(
                status_code=503,
                detail=f"Word conversion failed: {str(exc)[:300]}",
            ) from exc



        if not os.path.exists(pdf_path):

            _kill_orphan_word_processes()

            raise HTTPException(

                status_code=503,

                detail="PDF file not created. Ensure Microsoft Word is installed.",

            )



    else:

        lo_bin = shutil.which("libreoffice") or shutil.which("soffice")

        if not lo_bin:

            raise HTTPException(

                status_code=503,

                detail="LibreOffice not found. Install: sudo apt install libreoffice",

            )



        try:

            result = subprocess.run(

                [lo_bin, "--headless", "--convert-to", "pdf", "--outdir", output_dir, docx_path],

                capture_output=True,

                text=True,

                timeout=60,

            )

        except subprocess.TimeoutExpired as exc:

            _kill_orphan_word_processes()

            raise HTTPException(

                status_code=503,

                detail="PDF conversion timed out (60s). Try again.",

            ) from exc



        if result.returncode != 0 or not os.path.exists(pdf_path):

            err = (result.stderr or result.stdout or "conversion failed").strip()[:200]

            raise HTTPException(

                status_code=503,

                detail=f"LibreOffice conversion failed: {err}",

            )



    return pdf_path

