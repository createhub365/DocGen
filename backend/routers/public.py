from datetime import datetime, timezone

from fastapi import APIRouter

from services.pdf_converter import pdf_converter_available

router = APIRouter(tags=["public"])


@router.get("/health")
def health_check():
    available, engine = pdf_converter_available()
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
        "pdf_available": available,
        "pdf_engine": engine if available else None,
    }


@router.get("/ping")
def ping():
    return {"pong": True}
