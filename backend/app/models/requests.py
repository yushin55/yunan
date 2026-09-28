from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

ShortId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]
Position = Literal["support", "conditional_support", "neutral", "conditional_oppose", "oppose"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CreateRoom(Input):
    nickname: str = Field(min_length=1, max_length=12)
    previousTopicId: ShortId | None = None
    topicId: ShortId | None = None


class JoinRoom(Input):
    nickname: str = Field(min_length=1, max_length=12)
    code: str = Field(pattern=r"^[A-Za-z0-9]{6}$")


class Ready(Input):
    ready: bool = True


class InitialPosition(Input):
    position: Position
    reason: str = Field(min_length=1, max_length=140)
    preferences: list[ShortId] = Field(min_length=2, max_length=2)

    @field_validator("position", mode="before")
    @classmethod
    def translate_position(cls, value):
        return {"찬성": "support", "조건부 찬성": "conditional_support", "판단 유보": "neutral", "조건부 반대": "conditional_oppose", "반대": "oppose"}.get(value, value)

    @field_validator("preferences")
    @classmethod
    def distinct(cls, value):
        if len(set(value)) != 2:
            raise ValueError("서로 다른 역할 2개를 골라 주세요.")
        return value


class Citation(Input):
    cardId: ShortId | None = None
    cardConnection: str | None = Field(default=None, max_length=140)


class Claim(Citation):
    text: str = Field(min_length=1, max_length=100)


class Scenario(Citation):
    optionId: ShortId
    reason: str = Field(min_length=1, max_length=140)


class Question(Input):
    targetUid: ShortId
    text: str = Field(min_length=1, max_length=100)


class Answer(Input):
    questionId: ShortId
    text: str = Field(min_length=1, max_length=60)


class Guess(Input):
    targetUid: ShortId
    reason: str = Field(min_length=1, max_length=50)
    clue: str = Field(min_length=1, max_length=100)


class Rating(Input):
    targetUid: ShortId
    accuracy: int = Field(ge=1, le=5)
    respect: int = Field(ge=1, le=5)
    evidence: int = Field(ge=1, le=5)


class Reflection(Input):
    position: Position
    understood: str = Field(min_length=1, max_length=140)
    disagree: str = Field(min_length=1, max_length=140)
    opinion: str = Field(min_length=1, max_length=240)
    share: bool = False


class React(Input):
    targetUid: ShortId
    # None withdraws the reaction this player sent to the target in the current review.
    kind: Literal["agree", "convincing", "rebut", "curious"] | None = None


class ReviewDone(Input):
    pass


class Sync(Input):
    phaseVersion: int | None = Field(default=None, ge=0)


class Report(Input):
    targetUid: ShortId
    reason: str = Field(min_length=1, max_length=240)
