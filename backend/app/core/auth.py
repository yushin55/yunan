import logging

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth

from app.core.firebase import firebase_app

bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


def current_uid(token: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    if token is None or token.scheme.lower() != "bearer":
        raise HTTPException(401, "익명 로그인 후 다시 시도해 주세요.")
    try:
        app = firebase_app()
        # Resolve credentials here so missing/malformed server configuration is
        # not reported as an expired browser session.
        app.credential.get_credential()
    except Exception as exc:
        logger.error("Firebase server credentials failed (%s)", type(exc).__name__)
        raise HTTPException(503, "서버 인증 설정에 문제가 있어요. 관리자에게 문의해 주세요.") from exc
    try:
        decoded = auth.verify_id_token(token.credentials, app=app, check_revoked=False)
        uid = decoded.get("uid")
        if not isinstance(uid, str) or not uid:
            raise ValueError("Verified token has no user ID")
        return uid
    except (auth.InvalidIdTokenError, ValueError) as exc:
        raise HTTPException(401, "로그인을 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.") from exc
    except Exception as exc:
        logger.error("Firebase token verification unavailable (%s)", type(exc).__name__)
        raise HTTPException(503, "로그인 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.") from exc
