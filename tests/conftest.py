from __future__ import annotations

import random
from typing import TypeVar

import pytest
import pytest_asyncio
from aiohttp import web

from carte.games import BaseGame, Briscola
from carte.games.base import Player

T_BaseGame = TypeVar("T_BaseGame", bound=BaseGame[Player])


class DummyWebsocketResponse(web.WebSocketResponse):
    def __init__(self) -> None:
        super().__init__()
        self._closed = False
        self._messages: list[str] = []

    async def send_str(
        self, data: str, compress: bool | None = None  # noqa: ARG002
    ) -> None:
        self._messages.append(data)

    def _get_message(self, cmd: str) -> list[str]:
        return next(x.split("|") for x in self._messages if x.startswith(f"{cmd}|"))


Game = tuple[T_BaseGame, list[DummyWebsocketResponse]]


def make_game(game_type: type[T_BaseGame]) -> Game[T_BaseGame]:
    game = game_type("")
    websockets = []

    for i in range(game.number_of_players):
        player = game_type.player_class(f"player{i}", f"Player {i}")
        ws = DummyWebsocketResponse()
        websockets.append(ws)
        game.websockets.add(ws)
        player.websockets.add(ws)
        game._players.append(player)

    return game, websockets


@pytest.fixture
def briscola() -> Game[Briscola]:
    return make_game(Briscola)


@pytest.fixture(autouse=True)
def set_seed(request: pytest.FixtureRequest) -> None:
    if (
        isinstance(request.node, pytest_asyncio.plugin.Coroutine)
        and request.node.callspec is not None
    ):
        seed = request.node.callspec.params.get("seed")
        if isinstance(seed, int):
            random.seed(seed)
