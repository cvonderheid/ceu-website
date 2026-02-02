import os
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ce_api.db.session import get_db_session
from ce_api.models import User


def _get_external_user_id(request: Request) -> Optional[str]:
    return request.headers.get("X-MS-CLIENT-PRINCIPAL-ID") or os.getenv("DEV_USER_ID")


def _get_email(request: Request) -> Optional[str]:
    return request.headers.get("X-MS-CLIENT-PRINCIPAL-NAME") or os.getenv("DEV_EMAIL")


def get_current_user(
    request: Request,
    session: Session = Depends(get_db_session),
) -> User:
    external_user_id = _get_external_user_id(request)
    if not external_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user = session.scalar(select(User).where(User.external_user_id == external_user_id))
    if user:
        return user

    email = _get_email(request)
    user = User(external_user_id=external_user_id, email=email, display_name=email)
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        user = session.scalar(select(User).where(User.external_user_id == external_user_id))
        if user:
            return user
        raise

    session.refresh(user)
    return user
