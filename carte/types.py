from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import InitVar, dataclass, field
from enum import Enum, StrEnum, auto
from typing import Generic, TypeVar
from weakref import WeakSet

from aiohttp import web


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
