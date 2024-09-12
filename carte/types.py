from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import Enum, StrEnum, auto
from typing import TYPE_CHECKING, Generic, TypeVar

if TYPE_CHECKING:
    from carte.games.base import BaseGame


class GameStatus(Enum):
    NOT_STARTED = auto()
    STARTED = auto()
    ENDED = auto()


class Suit(StrEnum):
    BASTONI = auto()
    COPPE = auto()
    DENARI = auto()
    SPADE = auto()


class CardNumber(StrEnum):
    ASSO = "1"
    DUE = "2"
    TRE = "3"
    QUATTRO = "4"
    CINQUE = "5"
    SEI = "6"
    SETTE = "7"
    FANTE = auto()
    CAVALLO = auto()
    RE = auto()


@dataclass(frozen=True)
class Card:
    suit: Suit
    number: CardNumber

    def __str__(self) -> str:
        return f"{self.suit}:{self.number}"


CmdFunc = TypeVar("CmdFunc", bound=Callable[..., Awaitable[None]])


@dataclass
class Command(Generic[CmdFunc]):  # type: ignore[misc]
    func: CmdFunc
    game_status: GameStatus | None
    current_player: bool


@dataclass
class SavedGame:
    game: BaseGame
    version: int
    last_saved: datetime = field(default_factory=lambda: datetime.now(UTC), init=False)

    @property
    def is_valid(self) -> bool:
        if self.last_saved + timedelta(days=7) < datetime.now(UTC):
            return False
        if self.version != type(self.game).version:
            return False
        return True
