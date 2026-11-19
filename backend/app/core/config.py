"""Application settings loaded from environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """MR. ZAIN backend configuration."""

    APP_NAME: str = "MR. ZAIN API"
    APP_ENV: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: str = "postgresql+psycopg://postgres:change_me@localhost:5432/mr_zain_db"

    SECRET_KEY: str = "replace_with_a_strong_random_secret_key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    CORS_ORIGINS: list[str] = ["http://localhost:5500", "http://127.0.0.1:5500"]
    DEFAULT_CURRENCY: str = "EGP"
    DEFAULT_COUNTRY: str = "EG"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")


settings = Settings()
