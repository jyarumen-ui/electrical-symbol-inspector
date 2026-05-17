from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/electrical_symbol_db"
    debug: bool = False
    secret_key: str = "change-me-in-production"
    company_name: str = "株式会社サンプル電気工事"
    default_misc_rate: float = 0.15
    default_tax_rate: float = 0.10
    ai_confidence_threshold: float = 0.75
    auto_accept_threshold: float = 0.95
    expiry_alert_days: int = 30
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"
    anthropic_api_key: str = ""

    model_config = {"env_file": ".env"}

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def async_database_url(self) -> str:
        """Convert postgres:// to postgresql+asyncpg:// for async SQLAlchemy."""
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and "+asyncpg" not in url:
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        # asyncpg uses ?ssl=require instead of ?sslmode=require
        if "sslmode=require" in url:
            url = url.replace("sslmode=require", "ssl=require")
        return url

    @property
    def sync_database_url(self) -> str:
        """psycopg2 sync URL for alembic migrations."""
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        elif url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
        return url


settings = Settings()
