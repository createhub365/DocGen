from datetime import datetime, timezone

from fastapi import APIRouter

from services.pdf_converter import pdf_converter_available

router = APIRouter(tags=["public"])


@router.get("/health")
def health_check():
    pdf_ok, pdf_detail = pdf_converter_available()
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
        "pdf_available": pdf_ok,
        "pdf_detail": pdf_detail,
    }


@router.get("/ping")
def ping():
    return {"pong": True}
