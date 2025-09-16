import pytest

from carte.games import Scopa
from carte.games.scopa import ScopaPlayingStatus
from carte.types import GameStatus
from tests.conftest import Game


@pytest.mark.parametrize(
    (
        "seed",
        "res_cards",
        "res_denari",
        "res_primiera",
        "res_settebello",
        "res_scopa",
        "results",
    ),
    [
        (
            843,
            [25, 15],
            [6, 4],
            [84, 66, "bastoni", 7, 1, "coppe", 7, 6, "denari", 7, 4, "spade", 7, 6],
            [1, 0],
            [0, 0],
            [4, 0],
        ),
        (
            176,
            [14, 26],
            [3, 7],
            [78, 76, "bastoni", 7, 1, "coppe", 6, 7, "denari", 7, 6, "spade", 6, 7],
            [1, 0],
            [0, 1],
            [2, 3],
        ),
        (
            150,
            [21, 19],
            [7, 3],
            [78, 78, "bastoni", 7, 6, "coppe", 7, 6, "denari", 6, 7, "spade", 6, 7],
            [0, 1],
            [2, 1],
            [4, 2],
        ),
    ],
)
async def test_full_game(
    scopa: Game[Scopa],
    seed: int,
    res_cards: list[int],
    res_denari: list[int],
    res_primiera: list[int],
    res_settebello: list[int | str],
    res_scopa: list[int],
    results: list[int],
) -> None:
    game, websockets = scopa

    await game._prepare_start()

    while game._game_status is GameStatus.STARTED:
        player_id = game._current_player_id
        if game._playing_status is ScopaPlayingStatus.HAND:
            takeable_cards: list[str] | None = None
            card = game.current_player.hand[0]
            await game.handle_cmd(
                websockets[player_id], game.current_player, "play", str(card)
            )
        else:
            msg = websockets[game._current_player_id]._get_message(
                "capture_takeable_cards"
            )[1:]
            if takeable_cards is None:
                takeable_cards = msg
            else:
                for c in msg:
                    takeable_cards.remove(c)
            await game.handle_cmd(
                websockets[player_id],
                game.current_player,
                "take_choice",
                takeable_cards[0],
            )

    assert res_cards == [
        int(x) for x in websockets[0]._get_message("results_detail|cards")[2:]
    ]
    assert res_denari == [
        int(x) for x in websockets[0]._get_message("results_detail|denari")[2:]
    ]
    assert res_primiera == [
        x if i % 3 == 2 else int(x)
        for i, x in enumerate(websockets[0]._get_message("results_detail|primiera")[2:])
    ]
    assert res_settebello == [
        int(x) for x in websockets[0]._get_message("results_detail|settebello")[2:]
    ]
    assert res_scopa == [
        int(x) for x in websockets[0]._get_message("results_detail|scopa")[2:]
    ]
    assert results == [int(x) for x in websockets[0]._get_message("results")[1:]]
