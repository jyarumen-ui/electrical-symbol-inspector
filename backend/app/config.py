from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/electrical_symbol_db"
    debug: bool = False
    secret_key: str = "change-me-in-production"
    company_name: str = "株式会社サンプル電気工事"
    default_misc_rate: float = 0.15
    default_tax_rate: float = 0.10
    ai_confidence_threshold: float = 0.75
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    model_config = {"env_file": ".env"}

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
