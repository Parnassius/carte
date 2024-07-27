from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from carte.games.briscola import Briscola
from carte.types import Player


class Briscolone(Briscola, number_of_players=5, hand_size=8):
    def _board_state(self, ws_player: Player | None) -> Iterator[list[Any]]:
        # TODO: briscola e chiamante sopra al nome?
        yield from super()._board_state(ws_player)

    async def _start_game(self) -> None:
        await self._deal_cards()

    """
    async def _show_briscola(self) -> None:
        # TODO: chiamata
        self._briscola = self._players[0].hand[0]
        self._briscola_drawn = True
        await self._send("show_briscola", self._briscola.suit, self._briscola.number)
    """

    """
    @cmd(game_status=GameStatus.STARTED, current_player=True)
    async def cmd_play(self, suit: Suit, number: CardNumber) -> None:
        card = Card(suit, number)
        try:
            self.current_player.hand.remove(card)
        except ValueError as e:
            msg = "You don't have that card"
            raise CmdError(msg) from e

        self._played_cards[self.current_player] = card
        await self._send("play_card", self._current_player_id, suit, number)

        if len(self._played_cards) == self.number_of_players:
            winning_card: Card | None = None
            winning_player: Player
            card_order = list(self._card_points)
            for player, card in self._played_cards.items():
                if (
                    winning_card is None
                    or (
                        card.suit == winning_card.suit
                        and card_order.index(card.number)
                        > card_order.index(winning_card.number)
                    )
                    or (
                        card.suit == self._briscola.suit
                        and winning_card.suit != self._briscola.suit
                    )
                ):
                    winning_player = player
                    winning_card = card

            winning_player.points.extend(self._played_cards.values())
            self._played_cards.clear()
            self._current_player_id = self._players.index(winning_player)
            await self._send("take", self._current_player_id)

            if self._deck:
                for i in range(self.number_of_players):
                    player = self._players[
                        (self._current_player_id + i) % self.number_of_players
                    ]
                    if self._deck:
                        await self._draw_card(player)
                    else:
                        self._briscola_drawn = True
                        player.hand.append(self._briscola)
                        await self._send("draw_briscola", self._players.index(player))

            elif all(not player.hand for player in self._players):
                self._game_status = GameStatus.ENDED
                results = []
                for results_player in self._players:
                    points = 0
                    for card in results_player.points:
                        points += self._card_points[card.number]
                    results.append(points)
                await self._send_results(results)
                return

        else:
            self._current_player_id = (
                self._current_player_id + 1
            ) % self.number_of_players

        await self._send(self.current_player, "turn")
    """
