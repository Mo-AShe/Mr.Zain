"""Health check endpoint."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health_check() -> dict[str, str]:
    """Basic service liveness endpoint."""
    return {"status": "ok", "service": "mr-zain-api"}
