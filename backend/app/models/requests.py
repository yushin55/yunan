from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

ShortId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]
Seconds = Annotated[int, Field(ge=20, le=900)]
MicSeconds = Annotated[int, Field(ge=10, le=120)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PhaseSeconds(Input):
    role: Seconds | None = None
    statement: Seconds | None = None
    event: Seconds | None = None
    rebuttal: Seconds | None = None  # No longer a phase; accepted and ignored so older screens still save.
    vote: Seconds | None = None


class Settings(Input):
    topicId: ShortId | None = None
    randomTopic: bool = False
    switcherCount: Literal[1, 2] | None = None
    phaseSeconds: PhaseSeconds | None = None
    micSeconds: MicSeconds | None = None

    @model_validator(mode="after")
    def one_topic_choice(self):
        if self.topicId and self.randomTopic:
            raise ValueError("주제를 직접 고르거나 무작위 중 하나만 선택해 주세요.")
        return self


class CreateRoom(Settings):
    @model_validator(mode="after")
    def topic_required(self):
        if not self.topicId and not self.randomTopic:
            raise ValueError("주제를 고르거나 무작위 주제를 선택해 주세요.")
        return self


class Intro(Input):
    """Where the whole class is before the game: waiting, a video, or picking roles."""
    step: Literal["waiting", "briefing", "rules", "roles"]


class JoinRoom(Input):
    nickname: str = Field(min_length=1, max_length=12)
    code: str = Field(pattern=r"^[A-Za-z0-9]{6}$")


class Preferences(Input):
    first: ShortId
    second: ShortId

    @model_validator(mode="after")
    def distinct(self):
        if self.first == self.second:
            raise ValueError("1순위와 2순위는 서로 다른 역할이어야 해요.")
        return self


class MicOn(Input):
    """Ask for the one microphone in the room. Z speaks for the phase, X answers."""
    kind: Literal["statement", "question", "rebuttal", "answer"]


class Speech(Input):
    """One short stretch of the speaker's audio. It is transcribed and never stored."""
    audio: str = Field(min_length=1, max_length=2_000_000, pattern=r"^[A-Za-z0-9+/]+={0,2}$")
    mimeType: Literal["audio/wav"]
    phaseVersion: int = Field(ge=0)
    # Clips are sent side by side when the AI is slow; this keeps them in the order they were said.
    clip: int | None = Field(default=None, ge=0)


class LineAdd(Input):
    text: str = Field(min_length=1, max_length=400)
    phaseVersion: int | None = Field(default=None, ge=0)


class LineEdit(Input):
    lineId: ShortId
    text: str = Field(min_length=1, max_length=400)


class LineDelete(Input):
    lineId: ShortId


class Speaker(Input):
    targetUid: ShortId
    phaseVersion: int | None = Field(default=None, ge=0)


class Vote(Input):
    targets: list[ShortId] = Field(min_length=1, max_length=2)

    @field_validator("targets")
    @classmethod
    def distinct(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("서로 다른 후보를 골라 주세요.")
        return value


class Kick(Input):
    targetUid: ShortId


class Extend(Input):
    seconds: int = Field(ge=10, le=300)


class Review(Input):
    entryId: ShortId
    decision: Literal["approve", "return"]


class Sync(Input):
    phaseVersion: int | None = Field(default=None, ge=0)


class Empty(Input):
    pass
