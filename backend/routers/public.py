from datetime import datetime, timezone
import os

from fastapi import APIRouter

from services.pdf_converter import pdf_converter_available

router = APIRouter(tags=["public"])


@router.get("/health")
def health_check():
    available, engine = pdf_converter_available()
    is_docker = os.path.exists("/.dockerenv")
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
        "runtime": "docker" if is_docker else "native",
        "pdf_available": available,
        "pdf_engine": engine if available else None,
        "pdf_unavailable_reason": None if available else engine,
    }


@router.get("/ping")
def ping():
    return {"pong": True}
