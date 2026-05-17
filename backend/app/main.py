import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import jobs_router, estimation_router, master_items_router, symbol_hits_router, drawings_router, admin_router
from .config import settings
from .database import AsyncSessionLocal
from .services.alert_service import check_and_log_expiring_items
from .services.archive_service import archive_old_jobs
from .services.seed_service import seed_if_empty

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_migrations():
    """Run alembic migrations synchronously on startup."""
    try:
        from alembic.config import Config
        from alembic import command

        alembic_cfg = Config("alembic.ini")
        alembic_cfg.set_main_option("sqlalchemy.url", settings.sync_database_url)

        logger.info(f"Running migrations with URL: {settings.sync_database_url[:40]}...")
        command.upgrade(alembic_cfg, "head")
        logger.info("Migrations completed successfully.")
    except Exception as e:
        logger.error(f"Migration error: {e}", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    async with AsyncSessionLocal() as db:
        await seed_if_empty(db)
        await check_and_log_expiring_items(db, settings.expiry_alert_days)
        await archive_old_jobs(db)
    yield


app = FastAPI(
    title="Electrical Symbol Inspector OS",
    description="電気記号判定・見積管理システム",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs_router)
app.include_router(estimation_router)
app.include_router(master_items_router)
app.include_router(symbol_hits_router)
app.include_router(drawings_router)
app.include_router(admin_router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/settings/defaults")
async def get_defaults():
    return {
        "ai_confidence_threshold": settings.ai_confidence_threshold,
        "default_misc_rate": settings.default_misc_rate,
        "default_tax_rate": settings.default_tax_rate,
        "company_name": settings.company_name,
    }
