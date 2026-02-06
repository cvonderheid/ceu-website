import os
import json
import time
from typing import Any, Optional

import httpx
import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ce_api.db.session import get_db_session
from ce_api.models import User

_JWKS_CACHE: dict[str, Any] = {}
_JWKS_TTL_SECONDS = 3600


def _get_cognito_region() -> Optional[str]:
    return os.getenv("COGNITO_REGION")


def _get_cognito_user_pool_id() -> Optional[str]:
    return os.getenv("COGNITO_USER_POOL_ID")


def _get_cognito_client_id() -> Optional[str]:
    return os.getenv("COGNITO_USER_POOL_CLIENT_ID")


def _is_cognito_enabled() -> bool:
    return bool(_get_cognito_region() and _get_cognito_user_pool_id())


def _get_bearer_token(request: Request) -> Optional[str]:
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None
    parts = auth_header.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def _cognito_issuer(region: str, user_pool_id: str) -> str:
    return f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}"


def _jwks_cache_key(region: str, user_pool_id: str) -> str:
    return f"{region}:{user_pool_id}"


def _get_jwks(region: str, user_pool_id: str) -> list[dict[str, Any]]:
    cache_key = _jwks_cache_key(region, user_pool_id)
    now = int(time.time())

    cached = _JWKS_CACHE.get(cache_key)
    if cached and cached.get("expires_at", 0) > now:
        return cached["keys"]

    issuer = _cognito_issuer(region, user_pool_id)
    jwks_url = f"{issuer}/.well-known/jwks.json"
    try:
        response = httpx.get(jwks_url, timeout=5.0)
        response.raise_for_status()
        payload = response.json()
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable",
        ) from error

    keys = payload.get("keys")
    if not isinstance(keys, list) or not keys:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication keyset unavailable",
        )

    _JWKS_CACHE[cache_key] = {"expires_at": now + _JWKS_TTL_SECONDS, "keys": keys}
    return keys


def _find_jwk(keys: list[dict[str, Any]], kid: str) -> Optional[dict[str, Any]]:
    for key in keys:
        if key.get("kid") == kid:
            return key
    return None


def _decode_cognito_claims(request: Request) -> dict[str, Any]:
    region = _get_cognito_region()
    user_pool_id = _get_cognito_user_pool_id()
    client_id = _get_cognito_client_id()
    if not region or not user_pool_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication provider not configured",
        )

    token = _get_bearer_token(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from error

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    keys = _get_jwks(region, user_pool_id)
    jwk = _find_jwk(keys, kid)
    if not jwk:
        _JWKS_CACHE.pop(_jwks_cache_key(region, user_pool_id), None)
        keys = _get_jwks(region, user_pool_id)
        jwk = _find_jwk(keys, kid)
        if not jwk:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    issuer = _cognito_issuer(region, user_pool_id)
    try:
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
        claims = jwt.decode(
            token,
            key=public_key,
            algorithms=["RS256"],
            issuer=issuer,
            options={"verify_aud": False},
        )
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from error

    token_use = claims.get("token_use")
    if token_use not in {"access", "id"}:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if client_id:
        if token_use == "id" and claims.get("aud") != client_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        if token_use == "access" and claims.get("client_id") != client_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if not claims.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    return claims


def _get_external_user_id(request: Request) -> Optional[str]:
    return request.headers.get("X-MS-CLIENT-PRINCIPAL-ID") or os.getenv("DEV_USER_ID")


def _get_email(request: Request) -> Optional[str]:
    return request.headers.get("X-MS-CLIENT-PRINCIPAL-NAME") or os.getenv("DEV_EMAIL")


def get_current_user(
    request: Request,
    session: Session = Depends(get_db_session),
) -> User:
    email: Optional[str] = None
    display_name: Optional[str] = None

    if _is_cognito_enabled():
        claims = _decode_cognito_claims(request)
        external_user_id = str(claims["sub"])
        email = claims.get("email")
        display_name = (
            claims.get("name")
            or claims.get("preferred_username")
            or claims.get("username")
            or claims.get("cognito:username")
            or email
            or external_user_id
        )
    else:
        external_user_id = _get_external_user_id(request)
        email = _get_email(request)
        display_name = email

    if not external_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user = session.scalar(select(User).where(User.external_user_id == external_user_id))
    if user:
        return user

    user = User(external_user_id=external_user_id, email=email, display_name=display_name)
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
