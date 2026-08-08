# FastAPI Backend Service Configuration
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://geraldos_admin:geraldos_secure_pass@postgres:5432/geraldos"
    REDIS_URL: str = "redis://redis:6379/0"
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "minio_admin"
    MINIO_SECRET_KEY: str = "minio_secure_pass"
    KEYCLOAK_URL: str = "http://keycloak:8080/auth"
    KEYCLOAK_REALM: str = "GeraldOS"
    ORTHANC_URL: str = "http://orthanc:8042"
    FHIR_URL: str = "http://fhir:8080/fhir"
    GEMINI_API_KEY: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
