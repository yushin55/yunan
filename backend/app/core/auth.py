from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth

from app.core.firebase import firebase_app

bearer = HTTPBearer(auto_error=False)


def current_uid(token: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    if token is None or token.scheme.lower() != "bearer":
        raise HTTPException(401, "익명 로그인 후 다시 시도해 주세요.")
    try:
        decoded = auth.verify_id_token(token.credentials, app=firebase_app(), check_revoked=False)
        return decoded["uid"]
    except Exception as exc:
        raise HTTPException(401, "로그인이 만료되었어요. 다시 연결해 주세요.") from exc
