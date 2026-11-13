import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services import kakao

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)

# The frontend route that receives Kakao's redirect.
KAKAO_CALLBACK = "/auth/kakao"


class KakaoLogin(BaseModel):
    code: str = Field(min_length=1, max_length=512)
    redirectUri: str = Field(min_length=1, max_length=512)


@router.post("/kakao")
def kakao_login(data: KakaoLogin):
    """Kakao authorization code → Firebase custom token for the teacher."""
    # Only our own pages may receive the code; Kakao checks its registered list too.
    if data.redirectUri not in {origin.rstrip("/") + KAKAO_CALLBACK for origin in settings.allowed_origins}:
        raise HTTPException(400, "허용되지 않은 로그인 주소예요.")
    try:
        return {"token": kakao.custom_token(data.code, data.redirectUri)}
    except kakao.KakaoError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    except Exception as exc:
        logger.error("Kakao sign-in failed (%s)", type(exc).__name__)
        raise HTTPException(503, "로그인 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.") from exc
