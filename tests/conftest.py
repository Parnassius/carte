import random
from typing import Any

import pytest
import pytest_asyncio
from aiohttp import web

from carte.games import BaseGame, Briscola, Scopa


class DummyWebsocketResponse(web.WebSocketResponse):
    def __init__(self) -> None:
        super().__init__()
        self._closed = False
        self._messages: list[str] = []

    async def send_str(
        self,
        data: str,
        compress: int | None = None,  # noqa: ARG002
    ) -> None:
        self._messages.append(data)

    def _get_message(self, cmd: str) -> list[str]:
        return next(
            x.split("|") for x in reversed(self._messages) if x.startswith(f"{cmd}|")
        )


type Game[T: BaseGame[Any]] = tuple[T, list[DummyWebsocketResponse]]


def make_game[T: BaseGame[Any]](game_type: type[T]) -> Game[T]:
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


@pytest.fixture
def scopa() -> Game[Scopa]:
    return make_game(Scopa)


@pytest.fixture(autouse=True)
def set_seed(request: pytest.FixtureRequest) -> None:
    if (
        isinstance(request.node, pytest_asyncio.plugin.Coroutine)
        and request.node.callspec is not None
    ):
        seed = request.node.callspec.params.get("seed")
        if isinstance(seed, int):
            random.seed(seed)
