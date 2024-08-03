from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import InitVar, dataclass, field
from datetime import UTC, datetime, timedelta
from enum import Enum, StrEnum, auto
from typing import TYPE_CHECKING, Any, Generic, TypeVar
from weakref import WeakSet

from aiohttp import web

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


@dataclass
class Player:
    token: InitVar[str]
    name: str = ""
    ready: bool = True
    hand: list[Card] = field(default_factory=list, init=False)
    points: list[Card] = field(default_factory=list, init=False)
    websockets: WeakSet[web.WebSocketResponse] = field(
        default_factory=WeakSet, init=False
    )

    def __post_init__(self, token: str) -> None:
        self._token = token

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Player) and self._token == other._token

    def __hash__(self) -> int:
        return hash(self._token)

    def __getstate__(self) -> dict[str, Any]:
        state = self.__dict__.copy()
        del state["websockets"]
        return state

    def __setstate__(self, state: dict[str, Any]) -> None:
        self.__dict__.update(state)
        self.websockets = WeakSet()

    def reset(self) -> None:
        self.ready = False
        self.hand.clear()
        self.points.clear()


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
