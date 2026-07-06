import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from database import Base, engine
import models
from routers import auth, filters, templates, documents, admin, public, form_helpers, employers, trade_bank
from limiter import limiter

load_dotenv()

if os.getenv("ENVIRONMENT", "development").lower() == "development":
    Base.metadata.create_all(bind=engine)

app = FastAPI(title="DocGen Pro API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if os.getenv("ENVIRONMENT") == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        return response


app.add_middleware(SecurityHeadersMiddleware)

app.include_router(auth.router, prefix="/api/auth")
app.include_router(filters.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(admin.router, prefix="/api/admin")
app.include_router(public.router, prefix="/api/public")
app.include_router(form_helpers.router, prefix="/api")
app.include_router(employers.router, prefix="/api")
app.include_router(trade_bank.router, prefix="/api")

LOGO_DIR = os.getenv("LOGO_DIR", "./uploads/logos")
os.makedirs(os.getenv("OUTPUT_DIR", "./output"), exist_ok=True)
os.makedirs(os.getenv("TEMPLATE_DIR", "./template_store"), exist_ok=True)
os.makedirs(LOGO_DIR, exist_ok=True)


@app.on_event("startup")
async def validate_environment():
    env = os.getenv("ENVIRONMENT", "development")
    jwt_secret = os.getenv("JWT_SECRET", "")
    allow_seed = os.getenv("ALLOW_DEMO_SEED", "false").lower()

    warnings = []

    if len(jwt_secret) < 32:
        msg = "CRITICAL: JWT_SECRET is too short (minimum 32 characters)"
        if env == "production":
            raise RuntimeError(msg)
        warnings.append(msg)

    if env == "production" and allow_seed == "true":
        warnings.append(
            "WARNING: ALLOW_DEMO_SEED=true in production — disable immediately"
        )

    if env == "production":
        seed_admin = os.getenv("SEED_ADMIN_PASSWORD", "")
        if seed_admin in ("admin123", "password", "admin", ""):
            warnings.append(
                "WARNING: Weak or default SEED_ADMIN_PASSWORD detected"
            )

    for w in warnings:
        print(f"[SECURITY] {w}", flush=True)
