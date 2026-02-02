import os
from collections.abc import Generator
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

_ENGINE: Optional[Engine] = None
_SESSIONMAKER: Optional[sessionmaker[Session]] = None


def get_engine() -> Engine:
    global _ENGINE
    if _ENGINE is None:
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL is not set")
        _ENGINE = create_engine(database_url, pool_pre_ping=True)
    return _ENGINE


def get_sessionmaker() -> sessionmaker[Session]:
    global _SESSIONMAKER
    if _SESSIONMAKER is None:
        _SESSIONMAKER = sessionmaker(bind=get_engine(), class_=Session, expire_on_commit=False)
    return _SESSIONMAKER


def get_db_session() -> Generator[Session, None, None]:
    session = get_sessionmaker()()
    try:
        yield session
    finally:
        session.close()
