from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.responses import FileResponse

from ce_api.deps import get_current_user
from ce_api.routers import cycles_router, state_licenses_router, timeline_router
from ce_api.routers.allocations import router as allocations_router
from ce_api.routers.certificates import router as certificates_router
from ce_api.routers.courses import router as courses_router
from ce_api.routers.progress import router as progress_router
from ce_api.schemas import UserMe
from ce_api.storage import ensure_cert_storage_dir

STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parents[2] / "static"))


@asynccontextmanager
async def lifespan(_: FastAPI):
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
