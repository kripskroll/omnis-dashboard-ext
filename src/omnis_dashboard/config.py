"""Configuration management using pydantic-settings."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    Pydantic Settings automatically loads from .env file and environment variables.
    Environment variables take precedence over .env file values.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # Ignore extra env vars like NEO4J_*, NODE_ENV, etc.
    )

    # ClickHouse Connection
    clickhouse_url: str = "http://localhost:8123"
    clickhouse_database: str = "omnis"
    clickhouse_username: str = "default"
    clickhouse_password: str = ""

    # Server Configuration
    port: int = 8002

    # Query defaults
    default_hours: int = 24
    default_limit: int = 10
    query_timeout: int = 30


settings = Settings()
