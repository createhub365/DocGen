from datetime import datetime, timezone

from fastapi import APIRouter

router = APIRouter(tags=["public"])


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
    }


@router.get("/ping")
def ping():
    return {"pong": True}
