"""Kakao Login for teachers.

Firebase has no built-in Kakao provider, so the browser sends us Kakao's authorization code,
we exchange it for the Kakao user, and hand back a Firebase custom token for `kakao:<id>`.
"""
import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from firebase_admin import auth

from app.core.config import settings
from app.core.firebase import firebase_app

logger = logging.getLogger(__name__)

TOKEN_URL = "https://kauth.kakao.com/oauth/token"
USER_URL = "https://kapi.kakao.com/v2/user/me"


class KakaoError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _request(url: str, *, data: dict | None = None, headers: dict | None = None) -> dict:
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/x-www-form-urlencoded;charset=utf-8", **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        # Kakao answers 4xx for a used/expired code or a redirect URI mismatch.
        logger.warning("Kakao rejected the request (%s)", exc.code)
        raise KakaoError("카카오 로그인을 확인하지 못했어요. 다시 시도해 주세요.", 401) from exc
    except Exception as exc:
        logger.error("Kakao unavailable (%s)", type(exc).__name__)
        raise KakaoError("카카오 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", 503) from exc


def exchange_code(code: str, redirect_uri: str) -> dict:
    """Authorization code → Kakao user profile."""
    if not settings.kakao_rest_api_key:
        raise KakaoError("카카오 로그인이 아직 설정되지 않았어요. 관리자에게 문의해 주세요.", 503)
    form = {"grant_type": "authorization_code", "client_id": settings.kakao_rest_api_key, "redirect_uri": redirect_uri, "code": code}
    if settings.kakao_client_secret:
        form["client_secret"] = settings.kakao_client_secret
    token = _request(TOKEN_URL, data=form).get("access_token")
    if not isinstance(token, str) or not token:
        raise KakaoError("카카오 로그인을 확인하지 못했어요. 다시 시도해 주세요.", 401)
    return _request(USER_URL, headers={"Authorization": f"Bearer {token}"})


def profile(user: dict) -> tuple[str, str | None]:
    kakao_id = user.get("id")
    if not isinstance(kakao_id, int) and not (isinstance(kakao_id, str) and kakao_id):
        raise KakaoError("카카오 계정 정보를 받지 못했어요.", 401)
    account = user.get("kakao_account") or {}
    name = (account.get("profile") or {}).get("nickname") or (user.get("properties") or {}).get("nickname")
    return f"kakao:{kakao_id}", name if isinstance(name, str) and name.strip() else None


def custom_token(code: str, redirect_uri: str) -> str:
    uid, name = profile(exchange_code(code, redirect_uri))
    app = firebase_app()
    # Keep the Firebase user record so the teacher's name shows after sign-in.
    try:
        auth.get_user(uid, app=app)
        if name:
            auth.update_user(uid, display_name=name, app=app)
    except auth.UserNotFoundError:
        auth.create_user(uid=uid, display_name=name, app=app)
    token = auth.create_custom_token(uid, {"provider": "kakao"}, app=app)
    return token.decode() if isinstance(token, bytes) else token
