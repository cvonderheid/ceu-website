from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig

from ce_api.deps import get_current_user
from ce_api.routers import cycles_router, state_licenses_router, timeline_router
from ce_api.routers.allocations import router as allocations_router
from ce_api.routers.certificates import router as certificates_router
from ce_api.routers.courses import router as courses_router
from ce_api.routers.progress import router as progress_router
from ce_api.schemas import UserMe
from ce_api.storage import ensure_cert_storage_dir

STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parents[2] / "static"))
LOGGER = logging.getLogger(__name__)


def _should_run_migrations_on_startup() -> bool:
    return os.getenv("RUN_MIGRATIONS_ON_STARTUP", "true").strip().lower() in {"1", "true", "yes", "on"}


def _run_migrations_on_startup() -> None:
    if not _should_run_migrations_on_startup():
        return

    config_path = os.getenv("ALEMBIC_CONFIG", "alembic.ini")
    LOGGER.info("Running startup migrations with config '%s'", config_path)

    alembic_cfg = AlembicConfig(config_path)
    alembic_command.upgrade(alembic_cfg, "head")


@asynccontextmanager
async def lifespan(_: FastAPI):
    _run_migrations_on_startup()
    ensure_cert_storage_dir()
    yield


app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@api_router.get("/me", response_model=UserMe)
def me(current_user=Depends(get_current_user)) -> UserMe:
    return UserMe.model_validate(current_user)


api_router.include_router(state_licenses_router)
api_router.include_router(cycles_router)
api_router.include_router(courses_router)
api_router.include_router(allocations_router)
api_router.include_router(progress_router)
api_router.include_router(certificates_router)
api_router.include_router(timeline_router)
app.include_router(api_router)


@app.get("/.auth/{path:path}", include_in_schema=False)
def auth_passthrough(path: str):
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


if STATIC_DIR.exists() and (STATIC_DIR / "index.html").exists():
    @app.get("/{path:path}", include_in_schema=False)
    def spa_fallback(path: str):
        if path.startswith("api") or path.startswith(".auth"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

        if path:
            candidate = (STATIC_DIR / path).resolve()
            if candidate.is_relative_to(STATIC_DIR) and candidate.is_file():
                return FileResponse(candidate)

        return FileResponse(STATIC_DIR / "index.html")
