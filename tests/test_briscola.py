from __future__ import annotations

import pytest

from carte.games import Briscola
from carte.types import GameStatus
from tests.conftest import Game


@pytest.mark.parametrize(
    "seed, results",
    [
        (123, [50, 70]),
        (321, [60, 60]),
        (111, [27, 93]),
    ],
)
async def test_full_game(
    briscola: Game[Briscola], seed: int, results: list[int]
) -> None:
    game, websockets = briscola

    await game._prepare_start()

    while game._game_status is GameStatus.STARTED:
        player_id = game._current_player_id
        card = game._players[player_id].hand[0]
        await game.handle_cmd(websockets[player_id], "play", str(card))

    assert results == [int(x) for x in websockets[0]._get_message("results")[1:]]
