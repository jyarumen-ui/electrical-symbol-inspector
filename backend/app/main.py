from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import jobs_router, estimation_router, master_items_router, symbol_hits_router, drawings_router
from .config import settings

app = FastAPI(
    title="Electrical Symbol Inspector OS",
    description="電気記号判定・見積管理システム",
    version="1.0.0",
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
